-- Polymarket-style CPMM share payouts + live price seed ($10k/side)

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
  v_seed CONSTANT NUMERIC(18, 2) := 10000;
  v_running_yes NUMERIC(18, 2) := 0;
  v_running_no NUMERIC(18, 2) := 0;
  v_ry NUMERIC(28, 6);
  v_rn NUMERIC(28, 6);
  v_k NUMERIC(36, 6);
  v_new_ry NUMERIC(28, 6);
  v_new_rn NUMERIC(28, 6);
  v_shares NUMERIC(28, 6);
  v_payout NUMERIC(18, 2);
  r RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF p_winning_outcome NOT IN ('YES', 'NO') THEN
    RAISE EXCEPTION 'Invalid winning outcome';
  END IF;

  SELECT status INTO v_status FROM events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;

  UPDATE events
  SET status = 'resolved', winning_outcome = p_winning_outcome
  WHERE id = p_event_id;

  FOR r IN
    SELECT id, user_id, outcome, amount_usd
    FROM bets
    WHERE event_id = p_event_id
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    v_ry := v_running_yes + v_seed;
    v_rn := v_running_no + v_seed;
    v_k := v_ry * v_rn;

    IF r.outcome = 'YES' THEN
      v_new_ry := v_ry + r.amount_usd;
      v_new_rn := v_k / v_new_ry;
      v_shares := v_rn - v_new_rn;
      v_running_yes := v_running_yes + r.amount_usd;
    ELSE
      v_new_rn := v_rn + r.amount_usd;
      v_new_ry := v_k / v_new_rn;
      v_shares := v_ry - v_new_ry;
      v_running_no := v_running_no + r.amount_usd;
    END IF;

    IF r.outcome = p_winning_outcome THEN
      v_payout := ROUND(GREATEST(v_shares, 0), 2);
      UPDATE bets SET status = 'won', payout_usd = v_payout WHERE id = r.id;
      UPDATE users SET balance_usd = balance_usd + v_payout WHERE id = r.user_id;
    ELSE
      UPDATE bets SET status = 'lost', payout_usd = 0 WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;
