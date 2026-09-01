CREATE OR REPLACE FUNCTION public._resolve_event_core(p_event_id uuid, p_winning_outcome text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status TEXT;
  v_yes_pool NUMERIC(18,2);
  v_no_pool NUMERIC(18,2);
  v_total_pool NUMERIC(18,2);
  v_total_net_shares NUMERIC(18,6);
  v_scale NUMERIC(18,8);
  r RECORD;
BEGIN
  IF p_winning_outcome NOT IN ('YES','NO') THEN
    RAISE EXCEPTION 'Invalid winning outcome';
  END IF;

  SELECT status, total_yes_pool, total_no_pool
    INTO v_status, v_yes_pool, v_no_pool
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'Event is not active'; END IF;

  v_total_pool := v_yes_pool + v_no_pool;

  UPDATE public.events
  SET status = 'resolved', winning_outcome = p_winning_outcome
  WHERE id = p_event_id;

  SELECT COALESCE(SUM(
    CASE WHEN trade_type = 'buy' THEN COALESCE(shares, 0)
         ELSE -COALESCE(shares, 0)
    END
  ), 0)
  INTO v_total_net_shares
  FROM public.bets
  WHERE event_id = p_event_id
    AND outcome = p_winning_outcome
    AND status = 'active';

  UPDATE public.bets
  SET payout_usd = 0
  WHERE event_id = p_event_id;

  IF v_total_net_shares <= 0 OR v_total_pool <= 0 THEN
    UPDATE public.bets
    SET status = 'lost'
    WHERE event_id = p_event_id;
    RETURN;
  END IF;

  v_scale := CASE
    WHEN v_total_net_shares > v_total_pool
      THEN v_total_pool / v_total_net_shares
    ELSE 1
  END;

  FOR r IN
    SELECT
      user_id,
      SUM(CASE WHEN trade_type = 'buy' THEN COALESCE(shares, 0)
               ELSE -COALESCE(shares, 0)
          END) AS net_shares
    FROM public.bets
    WHERE event_id = p_event_id
      AND outcome = p_winning_outcome
      AND status = 'active'
    GROUP BY user_id
    HAVING SUM(CASE WHEN trade_type = 'buy' THEN COALESCE(shares, 0)
                    ELSE -COALESCE(shares, 0)
               END) > 0
  LOOP
    DECLARE
      v_payout NUMERIC(18,2);
      v_payout_bet_id UUID;
    BEGIN
      v_payout := ROUND(r.net_shares * v_scale, 2);

      UPDATE public.users
      SET balance_usd = balance_usd + v_payout
      WHERE id = r.user_id;

      SELECT id INTO v_payout_bet_id
      FROM public.bets
      WHERE event_id = p_event_id
        AND user_id = r.user_id
        AND outcome = p_winning_outcome
        AND trade_type = 'buy'
        AND status = 'active'
      ORDER BY created_at DESC, id DESC
      LIMIT 1;

      IF v_payout_bet_id IS NOT NULL THEN
        UPDATE public.bets
        SET payout_usd = v_payout
        WHERE id = v_payout_bet_id;
      END IF;
    END;
  END LOOP;

  UPDATE public.bets
  SET status = CASE
    WHEN outcome = p_winning_outcome THEN 'won'
    ELSE 'lost'
  END
  WHERE event_id = p_event_id;
END;
$function$;
