-- Fix CPMM sell (must mirror buy) + enforce 500 min reserve on both sides

CREATE OR REPLACE FUNCTION public.cpmm_sell_raw(
  p_shares NUMERIC,
  p_outcome TEXT,
  p_ry NUMERIC,
  p_rn NUMERIC
)
RETURNS TABLE(proceeds NUMERIC, new_ry NUMERIC, new_rn NUMERIC)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_k NUMERIC;
  v_seed CONSTANT NUMERIC := 500;
BEGIN
  IF p_shares <= 0 THEN
    RETURN QUERY SELECT 0::NUMERIC, p_ry, p_rn;
    RETURN;
  END IF;

  v_k := p_ry * p_rn;

  -- Inverse of buy: return shares to opposite reserve, extract collateral
  IF p_outcome = 'YES' THEN
    new_rn := p_rn + p_shares;
    new_ry := v_k / new_rn;
    IF new_ry < v_seed THEN
      new_ry := v_seed;
      new_rn := v_k / new_ry;
    END IF;
    proceeds := GREATEST(0, p_ry - new_ry);
    RETURN NEXT;
  ELSE
    new_ry := p_ry + p_shares;
    new_rn := v_k / new_ry;
    IF new_rn < v_seed THEN
      new_rn := v_seed;
      new_ry := v_k / new_rn;
    END IF;
    proceeds := GREATEST(0, p_rn - new_rn);
    RETURN NEXT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cpmm_buy_raw(
  p_amount NUMERIC,
  p_outcome TEXT,
  p_ry NUMERIC,
  p_rn NUMERIC
)
RETURNS TABLE(shares NUMERIC, new_ry NUMERIC, new_rn NUMERIC)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_k NUMERIC;
  v_seed CONSTANT NUMERIC := 500;
BEGIN
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT 0::NUMERIC, GREATEST(v_seed, p_ry), GREATEST(v_seed, p_rn);
    RETURN;
  END IF;

  p_ry := GREATEST(v_seed, p_ry);
  p_rn := GREATEST(v_seed, p_rn);
  v_k := p_ry * p_rn;

  IF p_outcome = 'YES' THEN
    new_ry := p_ry + p_amount;
    new_rn := v_k / new_ry;
    IF new_rn < v_seed THEN
      new_rn := v_seed;
      new_ry := v_k / new_rn;
    END IF;
    shares := GREATEST(0, p_rn - new_rn);
    RETURN NEXT;
  ELSE
    new_rn := p_rn + p_amount;
    new_ry := v_k / new_rn;
    IF new_ry < v_seed THEN
      new_ry := v_seed;
      new_rn := v_k / new_ry;
    END IF;
    shares := GREATEST(0, p_ry - new_ry);
    RETURN NEXT;
  END IF;
END;
$$;

-- Clamp corrupted reserves then replay trades
UPDATE public.events
SET cpmm_ry = GREATEST(500, COALESCE(cpmm_ry, 500)),
    cpmm_rn = GREATEST(500, COALESCE(cpmm_rn, 500));

DO $$
DECLARE
  v_seed CONSTANT NUMERIC := 500;
  ev RECORD;
  tr RECORD;
  v_ry NUMERIC;
  v_rn NUMERIC;
  v_fill RECORD;
BEGIN
  FOR ev IN SELECT id FROM public.events LOOP
    v_ry := v_seed;
    v_rn := v_seed;

    FOR tr IN
      SELECT trade_type, outcome, amount_usd, shares
      FROM public.bets
      WHERE event_id = ev.id AND status = 'active'
      ORDER BY created_at ASC
    LOOP
      IF tr.trade_type = 'buy' THEN
        SELECT * INTO v_fill FROM public.cpmm_buy_shares(tr.amount_usd, tr.outcome, v_ry, v_rn);
        v_ry := GREATEST(v_seed, v_fill.new_ry);
        v_rn := GREATEST(v_seed, v_fill.new_rn);
      ELSE
        SELECT * INTO v_fill FROM public.cpmm_sell_proceeds(tr.shares, tr.outcome, v_ry, v_rn);
        v_ry := GREATEST(v_seed, v_fill.new_ry);
        v_rn := GREATEST(v_seed, v_fill.new_rn);
      END IF;
    END LOOP;

    UPDATE public.events
    SET cpmm_ry = GREATEST(v_seed, v_ry), cpmm_rn = GREATEST(v_seed, v_rn)
    WHERE id = ev.id;

    PERFORM public.sync_event_pools_from_cpmm(ev.id);
  END LOOP;
END;
$$;
