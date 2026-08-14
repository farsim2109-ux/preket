-- Polymarket bid/ask + seed liquidity (fixes buy-then-sell instant profit glitch)

CREATE OR REPLACE FUNCTION public.market_mid(
  p_yes_pool NUMERIC,
  p_no_pool NUMERIC,
  p_outcome TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_seed CONSTANT NUMERIC := 500;
  v_yes_eff NUMERIC;
  v_no_eff NUMERIC;
  v_mid NUMERIC;
BEGIN
  v_yes_eff := p_yes_pool + v_seed;
  v_no_eff := p_no_pool + v_seed;
  IF p_outcome = 'YES' THEN
    v_mid := v_yes_eff / (v_yes_eff + v_no_eff);
  ELSE
    v_mid := v_no_eff / (v_yes_eff + v_no_eff);
  END IF;
  RETURN GREATEST(0.01, LEAST(0.99, v_mid));
END;
$$;

CREATE OR REPLACE FUNCTION public.market_ask(
  p_yes_pool NUMERIC,
  p_no_pool NUMERIC,
  p_outcome TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_spread CONSTANT NUMERIC := 0.02;
BEGIN
  RETURN GREATEST(0.01, LEAST(0.99, public.market_mid(p_yes_pool, p_no_pool, p_outcome) + v_spread / 2));
END;
$$;

CREATE OR REPLACE FUNCTION public.market_bid(
  p_yes_pool NUMERIC,
  p_no_pool NUMERIC,
  p_outcome TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_spread CONSTANT NUMERIC := 0.02;
BEGIN
  RETURN GREATEST(0.01, LEAST(0.99, public.market_mid(p_yes_pool, p_no_pool, p_outcome) - v_spread / 2));
END;
$$;

CREATE OR REPLACE FUNCTION public.market_sell_proceeds(
  p_shares NUMERIC,
  p_outcome TEXT,
  p_yes_pool NUMERIC,
  p_no_pool NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_bid_before NUMERIC;
  v_bid_after NUMERIC;
  v_proceeds NUMERIC;
  v_yes_after NUMERIC;
  v_no_after NUMERIC;
BEGIN
  IF p_shares <= 0 THEN RETURN 0; END IF;

  v_bid_before := public.market_bid(p_yes_pool, p_no_pool, p_outcome);
  v_proceeds := p_shares * v_bid_before;

  IF p_outcome = 'YES' THEN
    v_yes_after := GREATEST(0, p_yes_pool - v_proceeds);
    v_no_after := p_no_pool;
  ELSE
    v_yes_after := p_yes_pool;
    v_no_after := GREATEST(0, p_no_pool - v_proceeds);
  END IF;

  v_bid_after := public.market_bid(v_yes_after, v_no_after, p_outcome);
  v_proceeds := p_shares * ((v_bid_before + v_bid_after) / 2);

  RETURN GREATEST(0, v_proceeds);
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
  v_yes_pool NUMERIC(18, 2);
  v_no_pool NUMERIC(18, 2);
  v_ask NUMERIC(8, 6);
  v_shares NUMERIC(18, 6);
  v_bet_id UUID;
  v_fee CONSTANT NUMERIC(18, 2) := 0.02;
  v_max_bet CONSTANT NUMERIC(18, 2) := 1000000;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount_usd < 1 THEN RAISE EXCEPTION 'Minimum buy is $1.00'; END IF;
  IF p_amount_usd > v_max_bet THEN RAISE EXCEPTION 'Maximum buy is $1,000,000'; END IF;
  IF p_outcome NOT IN ('YES', 'NO') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;

  SELECT status, total_yes_pool, total_no_pool
  INTO v_event_status, v_yes_pool, v_no_pool
  FROM events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event_status <> 'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;

  SELECT balance_usd INTO v_balance FROM users WHERE id = v_user_id FOR UPDATE;
  IF v_balance < p_amount_usd + v_fee THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_ask := public.market_ask(v_yes_pool, v_no_pool, p_outcome);
  v_shares := p_amount_usd / v_ask;

  UPDATE users SET balance_usd = balance_usd - p_amount_usd - v_fee WHERE id = v_user_id;

  INSERT INTO bets (user_id, event_id, outcome, amount_usd, entry_price, shares, trade_type, fee_usd)
  VALUES (v_user_id, p_event_id, p_outcome, p_amount_usd, v_ask, v_shares, 'buy', v_fee)
  RETURNING id INTO v_bet_id;

  IF p_outcome = 'YES' THEN
    UPDATE events SET total_yes_pool = total_yes_pool + p_amount_usd WHERE id = p_event_id;
  ELSE
    UPDATE events SET total_no_pool = total_no_pool + p_amount_usd WHERE id = p_event_id;
  END IF;

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
  v_yes_pool NUMERIC(18, 2);
  v_no_pool NUMERIC(18, 2);
  v_bid NUMERIC(8, 6);
  v_proceeds NUMERIC(18, 2);
  v_owned NUMERIC(18, 6);
  v_bet_id UUID;
  v_fee CONSTANT NUMERIC(18, 2) := 0.02;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_shares <= 0 THEN RAISE EXCEPTION 'Shares must be greater than 0'; END IF;
  IF p_outcome NOT IN ('YES', 'NO') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;

  SELECT status, total_yes_pool, total_no_pool
  INTO v_event_status, v_yes_pool, v_no_pool
  FROM events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event_status <> 'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;

  v_owned := public.get_net_shares(v_user_id, p_event_id, p_outcome);
  IF p_shares > v_owned THEN RAISE EXCEPTION 'Insufficient shares'; END IF;

  v_proceeds := ROUND(public.market_sell_proceeds(p_shares, p_outcome, v_yes_pool, v_no_pool), 2);
  IF v_proceeds <= 0 THEN RAISE EXCEPTION 'Proceeds too small'; END IF;

  v_bid := public.market_bid(v_yes_pool, v_no_pool, p_outcome);

  UPDATE users SET balance_usd = balance_usd + v_proceeds - v_fee WHERE id = v_user_id;

  INSERT INTO bets (user_id, event_id, outcome, amount_usd, entry_price, shares, trade_type, fee_usd)
  VALUES (v_user_id, p_event_id, p_outcome, v_proceeds, v_bid, p_shares, 'sell', v_fee)
  RETURNING id INTO v_bet_id;

  IF p_outcome = 'YES' THEN
    UPDATE events SET total_yes_pool = GREATEST(0, total_yes_pool - v_proceeds) WHERE id = p_event_id;
  ELSE
    UPDATE events SET total_no_pool = GREATEST(0, total_no_pool - v_proceeds) WHERE id = p_event_id;
  END IF;

  RETURN v_bet_id;
END;
$$;
