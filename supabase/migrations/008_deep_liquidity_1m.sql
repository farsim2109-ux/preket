-- Deep virtual liquidity ($1M/side) + $1M max bet cap

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
  v_max_bet CONSTANT NUMERIC(18, 2) := 1000000;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount_usd < 1 THEN
    RAISE EXCEPTION 'Minimum bet is $1.00';
  END IF;

  IF p_amount_usd > v_max_bet THEN
    RAISE EXCEPTION 'Maximum bet is $1,000,000';
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
  v_virtual CONSTANT NUMERIC(18, 2) := 1000000;
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
      v_payout := ROUND(
        (r.amount_usd / (v_winning_pool + v_virtual)) * (v_total_pool + 2 * v_virtual),
        2
      );
      UPDATE bets SET status = 'won', payout_usd = v_payout WHERE id = r.id;
      UPDATE users SET balance_usd = balance_usd + v_payout WHERE id = r.user_id;
    END;
  END LOOP;

  UPDATE bets SET status = 'lost' WHERE event_id = p_event_id AND outcome <> p_winning_outcome;
END;
$$;
