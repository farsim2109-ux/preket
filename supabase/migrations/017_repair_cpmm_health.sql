-- Repair corrupted CPMM state + prevent reserve collapse

CREATE OR REPLACE FUNCTION public.cpmm_is_healthy(p_ry NUMERIC, p_rn NUMERIC)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_ry >= 50 AND p_rn >= 50 AND (p_ry * p_rn) >= 25000;
$$;

CREATE OR REPLACE FUNCTION public.repair_event_cpmm(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seed CONSTANT NUMERIC := 500;
  v_ry NUMERIC := v_seed;
  v_rn NUMERIC := v_seed;
  tr RECORD;
  v_fill RECORD;
  v_ratio NUMERIC;
BEGIN
  FOR tr IN
    SELECT id, trade_type, outcome, amount_usd, shares, cpmm_per_pm
    FROM public.bets
    WHERE event_id = p_event_id AND status = 'active'
    ORDER BY created_at ASC
  LOOP
    IF tr.trade_type = 'buy' THEN
      SELECT * INTO v_fill FROM public.cpmm_buy_fill(tr.amount_usd, tr.outcome, v_ry, v_rn);
      v_ry := v_fill.new_ry;
      v_rn := v_fill.new_rn;
      UPDATE public.bets
      SET cpmm_per_pm = v_fill.cpmm_per_pm, shares = v_fill.pm_shares, entry_price = v_fill.avg_price
      WHERE id = tr.id;
    ELSE
      v_ratio := tr.cpmm_per_pm;
      IF v_ratio IS NULL OR v_ratio <= 0.0001 OR v_ratio > 1000 THEN
        v_ratio := 1;
      END IF;
      SELECT * INTO v_fill FROM public.cpmm_sell_fill(tr.shares, v_ratio, tr.outcome, v_ry, v_rn);
      v_ry := GREATEST(50, v_fill.new_ry);
      v_rn := GREATEST(50, v_fill.new_rn);
    END IF;
  END LOOP;

  IF NOT public.cpmm_is_healthy(v_ry, v_rn) THEN
    v_ry := v_seed;
    v_rn := v_seed;
  END IF;

  UPDATE public.events
  SET cpmm_ry = v_ry, cpmm_rn = v_rn
  WHERE id = p_event_id;

  PERFORM public.sync_event_pools_from_cpmm(p_event_id);
END;
$$;

-- Repair all active events
DO $$
DECLARE ev RECORD;
BEGIN
  FOR ev IN SELECT id FROM public.events WHERE status = 'active' LOOP
    PERFORM public.repair_event_cpmm(ev.id);
  END LOOP;
END;
$$;

-- Harden buy/sell: reject if reserves unhealthy, repair after trade
CREATE OR REPLACE FUNCTION public.place_bet(
  p_event_id UUID, p_outcome TEXT, p_amount_usd NUMERIC
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance NUMERIC(18,2);
  v_event_status TEXT;
  v_ry NUMERIC; v_rn NUMERIC;
  v_fill RECORD;
  v_bet_id UUID;
  v_fee CONSTANT NUMERIC := 0.02;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount_usd < 1 THEN RAISE EXCEPTION 'Minimum buy is $1.00'; END IF;
  IF p_amount_usd > 1000000 THEN RAISE EXCEPTION 'Maximum buy is $1,000,000'; END IF;
  IF p_outcome NOT IN ('YES','NO') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;

  SELECT status, cpmm_ry, cpmm_rn INTO v_event_status, v_ry, v_rn
  FROM events WHERE id = p_event_id FOR UPDATE;
  IF v_event_status <> 'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;

  IF NOT public.cpmm_is_healthy(v_ry, v_rn) THEN
    PERFORM public.repair_event_cpmm(p_event_id);
    SELECT cpmm_ry, cpmm_rn INTO v_ry, v_rn FROM events WHERE id = p_event_id;
  END IF;

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
  v_proceeds NUMERIC(18,2);
  v_owned NUMERIC(18,6);
  v_ratio NUMERIC(18,8);
  v_bet_id UUID;
  v_fee CONSTANT NUMERIC := 0.02;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_shares <= 0 THEN RAISE EXCEPTION 'Shares must be greater than 0'; END IF;
  IF p_outcome NOT IN ('YES','NO') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;

  SELECT status, cpmm_ry, cpmm_rn INTO v_event_status, v_ry, v_rn
  FROM events WHERE id = p_event_id FOR UPDATE;
  IF v_event_status <> 'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;

  IF NOT public.cpmm_is_healthy(v_ry, v_rn) THEN
    PERFORM public.repair_event_cpmm(p_event_id);
    SELECT cpmm_ry, cpmm_rn INTO v_ry, v_rn FROM events WHERE id = p_event_id;
  END IF;

  v_owned := public.get_net_shares(v_user_id, p_event_id, p_outcome);
  IF p_shares > v_owned THEN RAISE EXCEPTION 'Insufficient shares'; END IF;

  v_ratio := public.get_user_cpmm_per_pm(v_user_id, p_event_id, p_outcome);
  IF v_ratio <= 0.0001 OR v_ratio > 1000 THEN v_ratio := 1; END IF;

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

CREATE OR REPLACE FUNCTION public.get_user_cpmm_per_pm(
  p_user_id UUID, p_event_id UUID, p_outcome TEXT
)
RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE r RECORD; pm NUMERIC := 0; cpmm NUMERIC := 0; sh NUMERIC; ratio NUMERIC;
BEGIN
  FOR r IN
    SELECT trade_type, COALESCE(shares,0) AS sh, cpmm_per_pm
    FROM bets
    WHERE user_id = p_user_id AND event_id = p_event_id AND outcome = p_outcome AND status = 'active'
    ORDER BY created_at ASC
  LOOP
    ratio := r.cpmm_per_pm;
    IF ratio IS NULL OR ratio <= 0.0001 OR ratio > 1000 THEN ratio := 1; END IF;
    IF r.trade_type = 'buy' THEN
      pm := pm + r.sh;
      cpmm := cpmm + r.sh * ratio;
    ELSIF pm > 0 THEN
      sh := LEAST(r.sh, pm);
      cpmm := cpmm - (cpmm * sh / pm);
      pm := pm - sh;
    END IF;
  END LOOP;
  IF pm <= 0 THEN RETURN 1; END IF;
  RETURN GREATEST(0.0001, cpmm / pm);
END;
$$;

-- Default cpmm on new events
CREATE OR REPLACE FUNCTION public.init_event_cpmm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.cpmm_ry IS NULL OR NEW.cpmm_ry < 50 THEN NEW.cpmm_ry := 500; END IF;
  IF NEW.cpmm_rn IS NULL OR NEW.cpmm_rn < 50 THEN NEW.cpmm_rn := 500; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_event_cpmm ON public.events;
CREATE TRIGGER trg_init_event_cpmm
  BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.init_event_cpmm();
