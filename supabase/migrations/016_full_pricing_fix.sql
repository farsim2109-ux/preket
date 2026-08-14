-- Full pricing fix: CPMM curve + Polymarket shares + correct sell inverse
-- Fixes: 0 shares on buy, $184k sell exploit, pool desync

ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS cpmm_per_pm NUMERIC(18, 8);

CREATE OR REPLACE FUNCTION public.cpmm_mid(p_ry NUMERIC, p_rn NUMERIC, p_outcome TEXT)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  p_ry := GREATEST(1, p_ry);
  p_rn := GREATEST(1, p_rn);
  IF p_outcome = 'YES' THEN
    RETURN GREATEST(0.01, LEAST(0.99, p_ry / (p_ry + p_rn)));
  END IF;
  RETURN GREATEST(0.01, LEAST(0.99, p_rn / (p_ry + p_rn)));
END;
$$;

CREATE OR REPLACE FUNCTION public.cpmm_buy_raw(
  p_amount NUMERIC, p_outcome TEXT, p_ry NUMERIC, p_rn NUMERIC
)
RETURNS TABLE(cpmm_shares NUMERIC, new_ry NUMERIC, new_rn NUMERIC)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_k NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT 0::NUMERIC, GREATEST(1, p_ry), GREATEST(1, p_rn);
    RETURN;
  END IF;
  p_ry := GREATEST(1, p_ry);
  p_rn := GREATEST(1, p_rn);
  v_k := p_ry * p_rn;
  IF p_outcome = 'YES' THEN
    new_ry := p_ry + p_amount;
    new_rn := GREATEST(1, v_k / new_ry);
    cpmm_shares := GREATEST(0, p_rn - new_rn);
    RETURN NEXT;
  ELSE
    new_rn := p_rn + p_amount;
    new_ry := GREATEST(1, v_k / new_rn);
    cpmm_shares := GREATEST(0, p_ry - new_ry);
    RETURN NEXT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cpmm_sell_raw(
  p_cpmm_shares NUMERIC, p_outcome TEXT, p_ry NUMERIC, p_rn NUMERIC
)
RETURNS TABLE(proceeds NUMERIC, new_ry NUMERIC, new_rn NUMERIC)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_k NUMERIC;
BEGIN
  IF p_cpmm_shares <= 0 THEN
    RETURN QUERY SELECT 0::NUMERIC, GREATEST(1, p_ry), GREATEST(1, p_rn);
    RETURN;
  END IF;
  p_ry := GREATEST(1, p_ry);
  p_rn := GREATEST(1, p_rn);
  v_k := p_ry * p_rn;
  IF p_outcome = 'YES' THEN
    new_rn := p_rn + p_cpmm_shares;
    new_ry := GREATEST(1, v_k / new_rn);
    proceeds := GREATEST(0, p_ry - new_ry);
    RETURN NEXT;
  ELSE
    new_ry := p_ry + p_cpmm_shares;
    new_rn := GREATEST(1, v_k / new_ry);
    proceeds := GREATEST(0, p_rn - new_rn);
    RETURN NEXT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cpmm_buy_fill(
  p_amount NUMERIC, p_outcome TEXT, p_ry NUMERIC, p_rn NUMERIC
)
RETURNS TABLE(
  pm_shares NUMERIC, cpmm_per_pm NUMERIC, avg_price NUMERIC,
  new_ry NUMERIC, new_rn NUMERIC
)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_spread CONSTANT NUMERIC := 0.02;
  v_mid NUMERIC;
  v_ask NUMERIC;
  v_pm NUMERIC;
  v_raw RECORD;
BEGIN
  v_mid := public.cpmm_mid(p_ry, p_rn, p_outcome);
  v_ask := GREATEST(0.01, LEAST(0.99, v_mid + v_spread / 2));
  SELECT * INTO v_raw FROM public.cpmm_buy_raw(p_amount, p_outcome, p_ry, p_rn);
  v_pm := CASE WHEN v_ask > 0 THEN p_amount / v_ask ELSE 0 END;
  pm_shares := v_pm;
  cpmm_per_pm := CASE WHEN v_pm > 0 THEN v_raw.cpmm_shares / v_pm ELSE 1 END;
  avg_price := v_ask;
  new_ry := v_raw.new_ry;
  new_rn := v_raw.new_rn;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.cpmm_sell_fill(
  p_pm_shares NUMERIC, p_cpmm_per_pm NUMERIC, p_outcome TEXT, p_ry NUMERIC, p_rn NUMERIC
)
RETURNS TABLE(proceeds NUMERIC, avg_price NUMERIC, new_ry NUMERIC, new_rn NUMERIC)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_spread CONSTANT NUMERIC := 0.02;
  v_mid NUMERIC;
  v_bid NUMERIC;
  v_cpmm NUMERIC;
  v_raw RECORD;
BEGIN
  v_mid := public.cpmm_mid(p_ry, p_rn, p_outcome);
  v_bid := GREATEST(0.01, LEAST(0.99, v_mid - v_spread / 2));
  v_cpmm := p_pm_shares * COALESCE(NULLIF(p_cpmm_per_pm, 0), 1);
  SELECT * INTO v_raw FROM public.cpmm_sell_raw(v_cpmm, p_outcome, p_ry, p_rn);
  proceeds := v_raw.proceeds * (v_bid / NULLIF(v_mid, 0));
  avg_price := v_bid;
  new_ry := v_raw.new_ry;
  new_rn := v_raw.new_rn;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_cpmm_per_pm(
  p_user_id UUID, p_event_id UUID, p_outcome TEXT
)
RETURNS NUMERIC
LANGUAGE sql STABLE
AS $$
  WITH legs AS (
    SELECT
      trade_type,
      COALESCE(shares, 0) AS sh,
      COALESCE(cpmm_per_pm, 1) AS ratio
    FROM public.bets
    WHERE user_id = p_user_id
      AND event_id = p_event_id
      AND outcome = p_outcome
      AND status = 'active'
    ORDER BY created_at ASC
  ),
  calc AS (
    SELECT
      SUM(CASE WHEN trade_type = 'buy' THEN sh ELSE 0 END) AS pm_bought,
      SUM(CASE WHEN trade_type = 'buy' THEN sh * ratio ELSE 0 END) AS cpmm_bought,
      SUM(CASE WHEN trade_type = 'sell' THEN sh ELSE 0 END) AS pm_sold
    FROM legs
  )
  SELECT CASE
    WHEN (pm_bought - pm_sold) <= 0 THEN 1
    ELSE GREATEST(0.0001, (cpmm_bought - pm_sold * (cpmm_bought / NULLIF(pm_bought, 0))) / (pm_bought - pm_sold))
  END
  FROM calc;
$$;

CREATE OR REPLACE FUNCTION public.sync_event_pools_from_cpmm(p_event_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_seed CONSTANT NUMERIC := 500;
BEGIN
  UPDATE public.events e
  SET
    total_yes_pool = GREATEST(0, ROUND(e.cpmm_ry - v_seed, 2)),
    total_no_pool = GREATEST(0, ROUND(e.cpmm_rn - v_seed, 2))
  WHERE e.id = p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.place_bet(
  p_event_id UUID, p_outcome TEXT, p_amount_usd NUMERIC
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance NUMERIC(18, 2);
  v_event_status TEXT;
  v_ry NUMERIC; v_rn NUMERIC;
  v_fill RECORD;
  v_bet_id UUID;
  v_fee CONSTANT NUMERIC := 0.02;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount_usd < 1 THEN RAISE EXCEPTION 'Minimum buy is $1.00'; END IF;
  IF p_amount_usd > 1000000 THEN RAISE EXCEPTION 'Maximum buy is $1,000,000'; END IF;
  IF p_outcome NOT IN ('YES', 'NO') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;

  SELECT status, cpmm_ry, cpmm_rn INTO v_event_status, v_ry, v_rn
  FROM events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event_status <> 'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;

  SELECT balance_usd INTO v_balance FROM users WHERE id = v_user_id FOR UPDATE;
  IF v_balance < p_amount_usd + v_fee THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  SELECT * INTO v_fill FROM public.cpmm_buy_fill(p_amount_usd, p_outcome, v_ry, v_rn);
  IF v_fill.pm_shares <= 0 THEN RAISE EXCEPTION 'Trade too small or no liquidity'; END IF;

  UPDATE users SET balance_usd = balance_usd - p_amount_usd - v_fee WHERE id = v_user_id;

  INSERT INTO bets (user_id, event_id, outcome, amount_usd, entry_price, shares, trade_type, fee_usd, cpmm_per_pm)
  VALUES (v_user_id, p_event_id, p_outcome, p_amount_usd, v_fill.avg_price, v_fill.pm_shares, 'buy', v_fee, v_fill.cpmm_per_pm)
  RETURNING id INTO v_bet_id;

  UPDATE events SET cpmm_ry = v_fill.new_ry, cpmm_rn = v_fill.new_rn WHERE id = p_event_id;
  PERFORM public.sync_event_pools_from_cpmm(p_event_id);
  RETURN v_bet_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sell_shares(
  p_event_id UUID, p_outcome TEXT, p_shares NUMERIC
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_event_status TEXT;
  v_ry NUMERIC; v_rn NUMERIC;
  v_fill RECORD;
  v_proceeds NUMERIC(18, 2);
  v_owned NUMERIC(18, 6);
  v_ratio NUMERIC(18, 8);
  v_bet_id UUID;
  v_fee CONSTANT NUMERIC := 0.02;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_shares <= 0 THEN RAISE EXCEPTION 'Shares must be greater than 0'; END IF;
  IF p_outcome NOT IN ('YES', 'NO') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;

  SELECT status, cpmm_ry, cpmm_rn INTO v_event_status, v_ry, v_rn
  FROM events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event_status <> 'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;

  v_owned := public.get_net_shares(v_user_id, p_event_id, p_outcome);
  IF p_shares > v_owned THEN RAISE EXCEPTION 'Insufficient shares'; END IF;

  v_ratio := public.get_user_cpmm_per_pm(v_user_id, p_event_id, p_outcome);

  SELECT * INTO v_fill FROM public.cpmm_sell_fill(p_shares, v_ratio, p_outcome, v_ry, v_rn);
  v_proceeds := ROUND(v_fill.proceeds, 2);
  IF v_proceeds <= 0 THEN RAISE EXCEPTION 'Proceeds too small'; END IF;

  UPDATE users SET balance_usd = balance_usd + v_proceeds - v_fee WHERE id = v_user_id;

  INSERT INTO bets (user_id, event_id, outcome, amount_usd, entry_price, shares, trade_type, fee_usd, cpmm_per_pm)
  VALUES (v_user_id, p_event_id, p_outcome, v_proceeds, v_fill.avg_price, p_shares, 'sell', v_fee, v_ratio)
  RETURNING id INTO v_bet_id;

  UPDATE events SET cpmm_ry = v_fill.new_ry, cpmm_rn = v_fill.new_rn WHERE id = p_event_id;
  PERFORM public.sync_event_pools_from_cpmm(p_event_id);
  RETURN v_bet_id;
END;
$$;

-- Backfill cpmm_per_pm on existing buys
UPDATE public.bets b
SET cpmm_per_pm = GREATEST(0.0001, public.cpmm_mid(
  GREATEST(1, (SELECT cpmm_ry FROM events e WHERE e.id = b.event_id)),
  GREATEST(1, (SELECT cpmm_rn FROM events e WHERE e.id = b.event_id)),
  b.outcome
) / NULLIF(b.entry_price, 0))
WHERE b.trade_type = 'buy' AND b.cpmm_per_pm IS NULL AND b.entry_price > 0;

UPDATE public.bets SET cpmm_per_pm = 1 WHERE cpmm_per_pm IS NULL;

-- Replay CPMM state from scratch with correct math
DO $$
DECLARE
  v_seed CONSTANT NUMERIC := 500;
  ev RECORD; tr RECORD;
  v_ry NUMERIC; v_rn NUMERIC; v_fill RECORD; v_ratio NUMERIC;
BEGIN
  FOR ev IN SELECT id FROM public.events LOOP
    v_ry := v_seed; v_rn := v_seed;
    FOR tr IN
      SELECT b.trade_type, b.outcome, b.amount_usd, b.shares, b.cpmm_per_pm, b.user_id, b.event_id
      FROM public.bets b
      WHERE b.event_id = ev.id AND b.status = 'active'
      ORDER BY b.created_at ASC
    LOOP
      IF tr.trade_type = 'buy' THEN
        SELECT * INTO v_fill FROM public.cpmm_buy_fill(tr.amount_usd, tr.outcome, v_ry, v_rn);
        v_ry := v_fill.new_ry; v_rn := v_fill.new_rn;
      ELSE
        v_ratio := COALESCE(tr.cpmm_per_pm, public.get_user_cpmm_per_pm(tr.user_id, tr.event_id, tr.outcome));
        SELECT * INTO v_fill FROM public.cpmm_sell_fill(tr.shares, v_ratio, tr.outcome, v_ry, v_rn);
        v_ry := v_fill.new_ry; v_rn := v_fill.new_rn;
      END IF;
    END LOOP;
    UPDATE public.events SET cpmm_ry = GREATEST(1, v_ry), cpmm_rn = GREATEST(1, v_rn) WHERE id = ev.id;
    PERFORM public.sync_event_pools_from_cpmm(ev.id);
  END LOOP;
END;
$$;
