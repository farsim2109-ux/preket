-- Polymarket CPMM pricing: constant-product curve + bid/ask spread
-- Fixes buy-at-51c / sell-at-98c instant-arb glitch

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cpmm_ry NUMERIC(28, 6),
  ADD COLUMN IF NOT EXISTS cpmm_rn NUMERIC(28, 6);

-- Backfill reserves from seed + legacy pool columns
UPDATE public.events
SET
  cpmm_ry = COALESCE(cpmm_ry, GREATEST(500, 500 + COALESCE(total_yes_pool, 0))),
  cpmm_rn = COALESCE(cpmm_rn, GREATEST(500, 500 + COALESCE(total_no_pool, 0)))
WHERE cpmm_ry IS NULL OR cpmm_rn IS NULL;

ALTER TABLE public.events
  ALTER COLUMN cpmm_ry SET DEFAULT 500,
  ALTER COLUMN cpmm_rn SET DEFAULT 500;

UPDATE public.events SET cpmm_ry = 500 WHERE cpmm_ry IS NULL;
UPDATE public.events SET cpmm_rn = 500 WHERE cpmm_rn IS NULL;

ALTER TABLE public.events
  ALTER COLUMN cpmm_ry SET NOT NULL,
  ALTER COLUMN cpmm_rn SET NOT NULL;

CREATE OR REPLACE FUNCTION public.cpmm_mid(p_ry NUMERIC, p_rn NUMERIC, p_outcome TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_seed CONSTANT NUMERIC := 500;
BEGIN
  IF p_outcome = 'YES' THEN
    RETURN GREATEST(0.01, LEAST(0.99, p_ry / (p_ry + p_rn)));
  END IF;
  RETURN GREATEST(0.01, LEAST(0.99, p_rn / (p_ry + p_rn)));
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
BEGIN
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT 0::NUMERIC, p_ry, p_rn;
    RETURN;
  END IF;

  v_k := p_ry * p_rn;

  IF p_outcome = 'YES' THEN
    new_ry := p_ry + p_amount;
    new_rn := v_k / new_ry;
    shares := GREATEST(0, p_rn - new_rn);
    RETURN NEXT;
  ELSE
    new_rn := p_rn + p_amount;
    new_ry := v_k / new_rn;
    shares := GREATEST(0, p_ry - new_ry);
    RETURN NEXT;
  END IF;
END;
$$;

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
  v_min CONSTANT NUMERIC := 1;
BEGIN
  IF p_shares <= 0 THEN
    RETURN QUERY SELECT 0::NUMERIC, p_ry, p_rn;
    RETURN;
  END IF;

  v_k := p_ry * p_rn;

  IF p_outcome = 'YES' THEN
    new_ry := GREATEST(v_min, p_ry - p_shares);
    new_rn := v_k / new_ry;
    proceeds := GREATEST(0, new_rn - p_rn);
    RETURN NEXT;
  ELSE
    new_rn := GREATEST(v_min, p_rn - p_shares);
    new_ry := v_k / new_rn;
    proceeds := GREATEST(0, new_ry - p_ry);
    RETURN NEXT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cpmm_buy_shares(
  p_amount NUMERIC,
  p_outcome TEXT,
  p_ry NUMERIC,
  p_rn NUMERIC
)
RETURNS TABLE(shares NUMERIC, new_ry NUMERIC, new_rn NUMERIC, avg_price NUMERIC)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_spread CONSTANT NUMERIC := 0.02;
  v_mid NUMERIC;
  v_ask NUMERIC;
  v_raw RECORD;
BEGIN
  v_mid := public.cpmm_mid(p_ry, p_rn, p_outcome);
  v_ask := GREATEST(0.01, LEAST(0.99, v_mid + v_spread / 2));

  SELECT * INTO v_raw FROM public.cpmm_buy_raw(p_amount, p_outcome, p_ry, p_rn);

  shares := v_raw.shares * (v_mid / v_ask);
  new_ry := v_raw.new_ry;
  new_rn := v_raw.new_rn;
  avg_price := v_ask;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.cpmm_sell_proceeds(
  p_shares NUMERIC,
  p_outcome TEXT,
  p_ry NUMERIC,
  p_rn NUMERIC
)
RETURNS TABLE(proceeds NUMERIC, new_ry NUMERIC, new_rn NUMERIC, avg_price NUMERIC)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_spread CONSTANT NUMERIC := 0.02;
  v_mid NUMERIC;
  v_bid NUMERIC;
  v_raw RECORD;
BEGIN
  v_mid := public.cpmm_mid(p_ry, p_rn, p_outcome);
  v_bid := GREATEST(0.01, LEAST(0.99, v_mid - v_spread / 2));

  SELECT * INTO v_raw FROM public.cpmm_sell_raw(p_shares, p_outcome, p_ry, p_rn);

  proceeds := v_raw.proceeds * (v_bid / v_mid);
  new_ry := v_raw.new_ry;
  new_rn := v_raw.new_rn;
  avg_price := v_bid;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_event_pools_from_cpmm(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_seed CONSTANT NUMERIC := 500;
  v_ry NUMERIC;
  v_rn NUMERIC;
BEGIN
  SELECT cpmm_ry, cpmm_rn INTO v_ry, v_rn FROM public.events WHERE id = p_event_id;
  UPDATE public.events
  SET
    total_yes_pool = GREATEST(0, ROUND(v_ry - v_seed, 2)),
    total_no_pool = GREATEST(0, ROUND(v_rn - v_seed, 2))
  WHERE id = p_event_id;
END;
$$;

-- Replay all trades to rebuild correct CPMM reserves
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
        v_ry := v_fill.new_ry;
        v_rn := v_fill.new_rn;
      ELSE
        SELECT * INTO v_fill FROM public.cpmm_sell_proceeds(tr.shares, tr.outcome, v_ry, v_rn);
        v_ry := v_fill.new_ry;
        v_rn := v_fill.new_rn;
      END IF;
    END LOOP;

    UPDATE public.events
    SET cpmm_ry = v_ry, cpmm_rn = v_rn
    WHERE id = ev.id;

    PERFORM public.sync_event_pools_from_cpmm(ev.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.place_bet(
  p_event_id UUID,
  p_outcome TEXT,
  p_amount_usd NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance NUMERIC(18, 2);
  v_event_status TEXT;
  v_ry NUMERIC(28, 6);
  v_rn NUMERIC(28, 6);
  v_fill RECORD;
  v_bet_id UUID;
  v_fee CONSTANT NUMERIC(18, 2) := 0.02;
  v_max_bet CONSTANT NUMERIC(18, 2) := 1000000;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount_usd < 1 THEN RAISE EXCEPTION 'Minimum buy is $1.00'; END IF;
  IF p_amount_usd > v_max_bet THEN RAISE EXCEPTION 'Maximum buy is $1,000,000'; END IF;
  IF p_outcome NOT IN ('YES', 'NO') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;

  SELECT status, cpmm_ry, cpmm_rn
  INTO v_event_status, v_ry, v_rn
  FROM events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event_status <> 'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;

  SELECT balance_usd INTO v_balance FROM users WHERE id = v_user_id FOR UPDATE;
  IF v_balance < p_amount_usd + v_fee THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  SELECT * INTO v_fill FROM public.cpmm_buy_shares(p_amount_usd, p_outcome, v_ry, v_rn);
  IF v_fill.shares <= 0 THEN RAISE EXCEPTION 'Trade too small'; END IF;

  UPDATE users SET balance_usd = balance_usd - p_amount_usd - v_fee WHERE id = v_user_id;

  INSERT INTO bets (user_id, event_id, outcome, amount_usd, entry_price, shares, trade_type, fee_usd)
  VALUES (v_user_id, p_event_id, p_outcome, p_amount_usd, v_fill.avg_price, v_fill.shares, 'buy', v_fee)
  RETURNING id INTO v_bet_id;

  UPDATE events
  SET cpmm_ry = v_fill.new_ry, cpmm_rn = v_fill.new_rn
  WHERE id = p_event_id;

  PERFORM public.sync_event_pools_from_cpmm(p_event_id);

  RETURN v_bet_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sell_shares(
  p_event_id UUID,
  p_outcome TEXT,
  p_shares NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_event_status TEXT;
  v_ry NUMERIC(28, 6);
  v_rn NUMERIC(28, 6);
  v_fill RECORD;
  v_proceeds NUMERIC(18, 2);
  v_owned NUMERIC(18, 6);
  v_bet_id UUID;
  v_fee CONSTANT NUMERIC(18, 2) := 0.02;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_shares <= 0 THEN RAISE EXCEPTION 'Shares must be greater than 0'; END IF;
  IF p_outcome NOT IN ('YES', 'NO') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;

  SELECT status, cpmm_ry, cpmm_rn
  INTO v_event_status, v_ry, v_rn
  FROM events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event_status <> 'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;

  v_owned := public.get_net_shares(v_user_id, p_event_id, p_outcome);
  IF p_shares > v_owned THEN RAISE EXCEPTION 'Insufficient shares'; END IF;

  SELECT * INTO v_fill FROM public.cpmm_sell_proceeds(p_shares, p_outcome, v_ry, v_rn);
  v_proceeds := ROUND(v_fill.proceeds, 2);
  IF v_proceeds <= 0 THEN RAISE EXCEPTION 'Proceeds too small'; END IF;

  UPDATE users SET balance_usd = balance_usd + v_proceeds - v_fee WHERE id = v_user_id;

  INSERT INTO bets (user_id, event_id, outcome, amount_usd, entry_price, shares, trade_type, fee_usd)
  VALUES (v_user_id, p_event_id, p_outcome, v_proceeds, v_fill.avg_price, p_shares, 'sell', v_fee)
  RETURNING id INTO v_bet_id;

  UPDATE events
  SET cpmm_ry = v_fill.new_ry, cpmm_rn = v_fill.new_rn
  WHERE id = p_event_id;

  PERFORM public.sync_event_pools_from_cpmm(p_event_id);

  RETURN v_bet_id;
END;
$$;

-- Display helpers (mid / bid / ask from CPMM reserves)
CREATE OR REPLACE FUNCTION public.market_mid(p_yes_pool NUMERIC, p_no_pool NUMERIC, p_outcome TEXT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.cpmm_mid(
    GREATEST(1, p_yes_pool + 500),
    GREATEST(1, p_no_pool + 500),
    p_outcome
  );
$$;

CREATE OR REPLACE FUNCTION public.market_ask(p_yes_pool NUMERIC, p_no_pool NUMERIC, p_outcome TEXT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(0.01, LEAST(0.99, public.market_mid(p_yes_pool, p_no_pool, p_outcome) + 0.01));
$$;

CREATE OR REPLACE FUNCTION public.market_bid(p_yes_pool NUMERIC, p_no_pool NUMERIC, p_outcome TEXT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(0.01, LEAST(0.99, public.market_mid(p_yes_pool, p_no_pool, p_outcome) - 0.01));
$$;

CREATE OR REPLACE FUNCTION public.market_sell_proceeds(
  p_shares NUMERIC,
  p_outcome TEXT,
  p_yes_pool NUMERIC,
  p_no_pool NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT proceeds FROM public.cpmm_sell_proceeds(
    p_shares,
    p_outcome,
    GREATEST(1, p_yes_pool + 500),
    GREATEST(1, p_no_pool + 500)
  );
$$;
