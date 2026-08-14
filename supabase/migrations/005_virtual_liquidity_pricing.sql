-- Polymarket-style pricing: virtual liquidity seeds odds and payout formula

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
  v_virtual CONSTANT NUMERIC(18, 2) := 100;
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

  -- Virtual liquidity: winners share real pool + subsidized depth (matches client estimate)
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
