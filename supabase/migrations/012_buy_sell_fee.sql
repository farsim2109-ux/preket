-- Buy/Sell + $0.02 fee per trade (Polymarket-style)

ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS trade_type TEXT NOT NULL DEFAULT 'buy'
    CHECK (trade_type IN ('buy', 'sell')),
  ADD COLUMN IF NOT EXISTS fee_usd NUMERIC(18, 2) NOT NULL DEFAULT 0.02;

CREATE OR REPLACE FUNCTION public.get_net_shares(
  p_user_id UUID,
  p_event_id UUID,
  p_outcome TEXT
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE WHEN trade_type = 'buy' THEN COALESCE(shares, 0) ELSE -COALESCE(shares, 0) END
  ), 0)
  FROM public.bets
  WHERE user_id = p_user_id
    AND event_id = p_event_id
    AND outcome = p_outcome
    AND status = 'active';
$$;

GRANT EXECUTE ON FUNCTION public.get_net_shares(UUID, UUID, TEXT) TO authenticated;

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
  v_total NUMERIC(18, 2);
  v_entry NUMERIC(8, 6);
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

  v_total := v_yes_pool + v_no_pool;
  IF v_total <= 0 THEN v_entry := 0.5;
  ELSIF p_outcome = 'YES' THEN v_entry := GREATEST(0.01, LEAST(0.99, v_yes_pool / v_total));
  ELSE v_entry := GREATEST(0.01, LEAST(0.99, v_no_pool / v_total));
  END IF;

  v_shares := p_amount_usd / v_entry;

  UPDATE users SET balance_usd = balance_usd - p_amount_usd - v_fee WHERE id = v_user_id;

  INSERT INTO bets (user_id, event_id, outcome, amount_usd, entry_price, shares, trade_type, fee_usd)
  VALUES (v_user_id, p_event_id, p_outcome, p_amount_usd, v_entry, v_shares, 'buy', v_fee)
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
  v_balance NUMERIC(18, 2);
  v_event_status TEXT;
  v_yes_pool NUMERIC(18, 2);
  v_no_pool NUMERIC(18, 2);
  v_total NUMERIC(18, 2);
  v_entry NUMERIC(8, 6);
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

  v_total := v_yes_pool + v_no_pool;
  IF v_total <= 0 THEN v_entry := 0.5;
  ELSIF p_outcome = 'YES' THEN v_entry := GREATEST(0.01, LEAST(0.99, v_yes_pool / v_total));
  ELSE v_entry := GREATEST(0.01, LEAST(0.99, v_no_pool / v_total));
  END IF;

  v_proceeds := ROUND(p_shares * v_entry, 2);
  IF v_proceeds <= 0 THEN RAISE EXCEPTION 'Proceeds too small'; END IF;

  SELECT balance_usd INTO v_balance FROM users WHERE id = v_user_id FOR UPDATE;
  UPDATE users SET balance_usd = balance_usd + v_proceeds - v_fee WHERE id = v_user_id;

  INSERT INTO bets (user_id, event_id, outcome, amount_usd, entry_price, shares, trade_type, fee_usd)
  VALUES (v_user_id, p_event_id, p_outcome, v_proceeds, v_entry, p_shares, 'sell', v_fee)
  RETURNING id INTO v_bet_id;

  IF p_outcome = 'YES' THEN
    UPDATE events SET total_yes_pool = GREATEST(0, total_yes_pool - v_proceeds) WHERE id = p_event_id;
  ELSE
    UPDATE events SET total_no_pool = GREATEST(0, total_no_pool - v_proceeds) WHERE id = p_event_id;
  END IF;

  RETURN v_bet_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sell_shares(UUID, TEXT, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_event(
  p_event_id UUID,
  p_winning_outcome TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_yes_pool NUMERIC(18, 2);
  v_no_pool NUMERIC(18, 2);
  v_total_pool NUMERIC(18, 2);
  v_total_net_shares NUMERIC(18, 6);
  v_scale NUMERIC(18, 8);
  r RECORD;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF p_winning_outcome NOT IN ('YES', 'NO') THEN RAISE EXCEPTION 'Invalid winning outcome'; END IF;

  SELECT status, total_yes_pool, total_no_pool
  INTO v_status, v_yes_pool, v_no_pool
  FROM events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;

  v_total_pool := v_yes_pool + v_no_pool;

  UPDATE events SET status = 'resolved', winning_outcome = p_winning_outcome WHERE id = p_event_id;

  SELECT COALESCE(SUM(
    CASE WHEN trade_type = 'buy' THEN COALESCE(shares, 0) ELSE -COALESCE(shares, 0) END
  ), 0)
  INTO v_total_net_shares
  FROM bets
  WHERE event_id = p_event_id AND outcome = p_winning_outcome AND status = 'active';

  IF v_total_net_shares <= 0 OR v_total_pool <= 0 THEN
    UPDATE bets SET status = 'lost', payout_usd = 0 WHERE event_id = p_event_id;
    RETURN;
  END IF;

  IF v_total_net_shares > v_total_pool THEN
    v_scale := v_total_pool / v_total_net_shares;
  ELSE
    v_scale := 1;
  END IF;

  FOR r IN
    SELECT user_id,
      SUM(CASE WHEN trade_type = 'buy' THEN COALESCE(shares, 0) ELSE -COALESCE(shares, 0) END) AS net_shares
    FROM bets
    WHERE event_id = p_event_id AND outcome = p_winning_outcome AND status = 'active'
    GROUP BY user_id
    HAVING SUM(CASE WHEN trade_type = 'buy' THEN COALESCE(shares, 0) ELSE -COALESCE(shares, 0) END) > 0
  LOOP
    DECLARE v_payout NUMERIC(18, 2);
    BEGIN
      v_payout := ROUND(r.net_shares * v_scale, 2);
      UPDATE users SET balance_usd = balance_usd + v_payout WHERE id = r.user_id;
    END;
  END LOOP;

  UPDATE bets SET
    status = CASE WHEN outcome = p_winning_outcome THEN 'won' ELSE 'lost' END,
    payout_usd = 0
  WHERE event_id = p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_event(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  r RECORD;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;

  SELECT status INTO v_status FROM events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;

  UPDATE events SET status = 'cancelled' WHERE id = p_event_id;

  FOR r IN
    SELECT user_id,
      COALESCE(SUM(
        CASE WHEN trade_type = 'buy' THEN amount_usd + COALESCE(fee_usd, 0.02)
             ELSE -(amount_usd - COALESCE(fee_usd, 0.02)) END
      ), 0) AS net_paid
    FROM bets
    WHERE event_id = p_event_id AND status = 'active'
    GROUP BY user_id
  LOOP
    IF r.net_paid > 0 THEN
      UPDATE users SET balance_usd = balance_usd + r.net_paid WHERE id = r.user_id;
    END IF;
  END LOOP;

  UPDATE bets SET status = 'lost', payout_usd = 0 WHERE event_id = p_event_id;
END;
$$;
