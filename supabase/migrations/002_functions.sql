-- Postgres functions for atomic balance operations

-- Place a bet (deduct balance, insert bet, update pools)
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
  v_bet_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount_usd < 1 THEN
    RAISE EXCEPTION 'Minimum bet is $1.00';
  END IF;

  IF p_outcome NOT IN ('YES', 'NO') THEN
    RAISE EXCEPTION 'Invalid outcome';
  END IF;

  SELECT status INTO v_event_status FROM events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  IF v_event_status <> 'active' THEN
    RAISE EXCEPTION 'Event is not active';
  END IF;

  SELECT balance_usd INTO v_balance FROM users WHERE id = v_user_id FOR UPDATE;
  IF v_balance < p_amount_usd THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE users SET balance_usd = balance_usd - p_amount_usd WHERE id = v_user_id;

  INSERT INTO bets (user_id, event_id, outcome, amount_usd)
  VALUES (v_user_id, p_event_id, p_outcome, p_amount_usd)
  RETURNING id INTO v_bet_id;

  IF p_outcome = 'YES' THEN
    UPDATE events SET total_yes_pool = total_yes_pool + p_amount_usd WHERE id = p_event_id;
  ELSE
    UPDATE events SET total_no_pool = total_no_pool + p_amount_usd WHERE id = p_event_id;
  END IF;

  RETURN v_bet_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_bet(UUID, TEXT, NUMERIC) TO authenticated;

-- Credit verified deposit (called from service role API after verification)
CREATE OR REPLACE FUNCTION public.credit_deposit(
  p_user_id UUID,
  p_network TEXT,
  p_tx_hash TEXT,
  p_amount_crypto NUMERIC,
  p_amount_usd NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deposit_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM deposits WHERE tx_hash = p_tx_hash) THEN
    RAISE EXCEPTION 'Transaction hash already used';
  END IF;

  INSERT INTO deposits (user_id, network, tx_hash, amount_crypto, amount_usd, status)
  VALUES (p_user_id, p_network, p_tx_hash, p_amount_crypto, p_amount_usd, 'verified')
  RETURNING id INTO v_deposit_id;

  UPDATE users SET balance_usd = balance_usd + p_amount_usd WHERE id = p_user_id;

  RETURN v_deposit_id;
END;
$$;

-- Record failed deposit attempt
CREATE OR REPLACE FUNCTION public.record_failed_deposit(
  p_user_id UUID,
  p_network TEXT,
  p_tx_hash TEXT,
  p_amount_crypto NUMERIC DEFAULT 0,
  p_amount_usd NUMERIC DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deposit_id UUID;
BEGIN
  INSERT INTO deposits (user_id, network, tx_hash, amount_crypto, amount_usd, status)
  VALUES (p_user_id, p_network, p_tx_hash, p_amount_crypto, p_amount_usd, 'failed')
  ON CONFLICT (tx_hash) DO NOTHING
  RETURNING id INTO v_deposit_id;
  RETURN v_deposit_id;
END;
$$;

-- Resolve event with pari-mutuel payouts
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
  v_winning_pool NUMERIC(18, 2);
  r RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_winning_outcome NOT IN ('YES', 'NO') THEN
    RAISE EXCEPTION 'Invalid winning outcome';
  END IF;

  SELECT status, total_yes_pool, total_no_pool
  INTO v_status, v_yes_pool, v_no_pool
  FROM events WHERE id = p_event_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;

  v_total_pool := v_yes_pool + v_no_pool;
  v_winning_pool := CASE WHEN p_winning_outcome = 'YES' THEN v_yes_pool ELSE v_no_pool END;

  UPDATE events
  SET status = 'resolved', winning_outcome = p_winning_outcome
  WHERE id = p_event_id;

  IF v_winning_pool = 0 OR v_total_pool = 0 THEN
    UPDATE bets SET status = 'lost' WHERE event_id = p_event_id AND outcome <> p_winning_outcome;
    UPDATE bets SET status = 'won', payout_usd = 0 WHERE event_id = p_event_id AND outcome = p_winning_outcome;
    RETURN;
  END IF;

  FOR r IN SELECT id, user_id, amount_usd FROM bets WHERE event_id = p_event_id AND outcome = p_winning_outcome FOR UPDATE LOOP
    DECLARE v_payout NUMERIC(18, 2);
    BEGIN
      v_payout := ROUND((r.amount_usd / v_winning_pool) * v_total_pool, 2);
      UPDATE bets SET status = 'won', payout_usd = v_payout WHERE id = r.id;
      UPDATE users SET balance_usd = balance_usd + v_payout WHERE id = r.user_id;
    END;
  END LOOP;

  UPDATE bets SET status = 'lost' WHERE event_id = p_event_id AND outcome <> p_winning_outcome;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_event(UUID, TEXT) TO authenticated;

-- Cancel event and refund all bets
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT status INTO v_status FROM events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;

  UPDATE events SET status = 'cancelled' WHERE id = p_event_id;

  FOR r IN SELECT id, user_id, amount_usd FROM bets WHERE event_id = p_event_id AND status = 'active' FOR UPDATE LOOP
    UPDATE users SET balance_usd = balance_usd + r.amount_usd WHERE id = r.user_id;
    UPDATE bets SET status = 'lost', payout_usd = 0 WHERE id = r.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_event(UUID) TO authenticated;

-- Request withdrawal (hold funds)
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_network TEXT,
  p_wallet_address TEXT,
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
  v_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount_usd <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;

  SELECT balance_usd INTO v_balance FROM users WHERE id = v_user_id FOR UPDATE;
  IF v_balance < p_amount_usd THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  UPDATE users SET balance_usd = balance_usd - p_amount_usd WHERE id = v_user_id;

  INSERT INTO withdrawals (user_id, network, wallet_address, amount_usd, status)
  VALUES (v_user_id, p_network, p_wallet_address, p_amount_usd, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_withdrawal(TEXT, TEXT, NUMERIC) TO authenticated;

-- Admin approve withdrawal
CREATE OR REPLACE FUNCTION public.approve_withdrawal(p_withdrawal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;

  UPDATE withdrawals SET status = 'approved'
  WHERE id = p_withdrawal_id AND status = 'pending';

  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal not found or not pending'; END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_withdrawal(UUID) TO authenticated;

-- Admin reject withdrawal (refund)
CREATE OR REPLACE FUNCTION public.reject_withdrawal(p_withdrawal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;

  SELECT user_id, amount_usd, status INTO r FROM withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal not found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Withdrawal is not pending'; END IF;

  UPDATE users SET balance_usd = balance_usd + r.amount_usd WHERE id = r.user_id;
  UPDATE withdrawals SET status = 'rejected' WHERE id = p_withdrawal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_withdrawal(UUID) TO authenticated;

-- Admin create event
CREATE OR REPLACE FUNCTION public.create_event(
  p_title TEXT,
  p_description TEXT,
  p_category TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;

  INSERT INTO events (title, description, category)
  VALUES (p_title, p_description, p_category)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_event(TEXT, TEXT, TEXT) TO authenticated;
