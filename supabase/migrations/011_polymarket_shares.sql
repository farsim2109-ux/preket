-- Polymarket share model: store entry price + shares at bet time; pay $1/share on win

ALTER TABLE public.bets
  ADD COLUMN IF NOT EXISTS entry_price NUMERIC(8, 6),
  ADD COLUMN IF NOT EXISTS shares NUMERIC(18, 6);

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

  SELECT status, total_yes_pool, total_no_pool
  INTO v_event_status, v_yes_pool, v_no_pool
  FROM events WHERE id = p_event_id FOR UPDATE;

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

  -- Lock entry price BEFORE pool update (Polymarket ask price)
  v_total := v_yes_pool + v_no_pool;
  IF v_total <= 0 THEN
    v_entry := 0.5;
  ELSIF p_outcome = 'YES' THEN
    v_entry := GREATEST(0.01, LEAST(0.99, v_yes_pool / v_total));
  ELSE
    v_entry := GREATEST(0.01, LEAST(0.99, v_no_pool / v_total));
  END IF;

  v_shares := p_amount_usd / v_entry;

  UPDATE users SET balance_usd = balance_usd - p_amount_usd WHERE id = v_user_id;

  INSERT INTO bets (user_id, event_id, outcome, amount_usd, entry_price, shares)
  VALUES (v_user_id, p_event_id, p_outcome, p_amount_usd, v_entry, v_shares)
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
  v_total_share_payout NUMERIC(18, 2);
  v_scale NUMERIC(18, 8);
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
    UPDATE bets SET status = 'lost', payout_usd = 0 WHERE event_id = p_event_id;
    RETURN;
  END IF;

  -- Total $1/share obligations vs real pool — scale down if needed (solvency)
  SELECT COALESCE(SUM(COALESCE(shares, amount_usd / NULLIF(entry_price, 0))), 0)
  INTO v_total_share_payout
  FROM bets
  WHERE event_id = p_event_id AND outcome = p_winning_outcome;

  IF v_total_share_payout <= 0 THEN
    UPDATE bets SET status = 'lost', payout_usd = 0 WHERE event_id = p_event_id;
    RETURN;
  END IF;

  IF v_total_share_payout > v_total_pool THEN
    v_scale := v_total_pool / v_total_share_payout;
  ELSE
    v_scale := 1;
  END IF;

  FOR r IN
    SELECT id, user_id, amount_usd, entry_price, shares
    FROM bets
    WHERE event_id = p_event_id AND outcome = p_winning_outcome
    FOR UPDATE
  LOOP
    DECLARE
      v_raw_shares NUMERIC(18, 6);
      v_payout NUMERIC(18, 2);
    BEGIN
      v_raw_shares := COALESCE(r.shares, r.amount_usd / NULLIF(r.entry_price, 0), r.amount_usd);
      v_payout := ROUND(v_raw_shares * v_scale, 2);
      UPDATE bets SET status = 'won', payout_usd = v_payout WHERE id = r.id;
      UPDATE users SET balance_usd = balance_usd + v_payout WHERE id = r.user_id;
    END;
  END LOOP;

  UPDATE bets SET status = 'lost', payout_usd = 0
  WHERE event_id = p_event_id AND outcome <> p_winning_outcome;
END;
$$;
