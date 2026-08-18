CREATE OR REPLACE FUNCTION public.request_withdrawal(p_network text, p_wallet_address text, p_amount_usd numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_balance NUMERIC(18, 2);
  v_id UUID;
  v_pending_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_network NOT IN ('polygon', 'bsc', 'arbitrum', 'base') THEN RAISE EXCEPTION 'Invalid network'; END IF;
  IF p_wallet_address !~* '^0x[0-9a-f]{40}$' THEN RAISE EXCEPTION 'Invalid EVM wallet address'; END IF;
  IF p_amount_usd <= 0 OR p_amount_usd > 1000000 THEN RAISE EXCEPTION 'Invalid withdrawal amount'; END IF;

  IF NOT public.check_rate_limit('withdrawal:' || v_user_id::text, 10, 3600) THEN
    RAISE EXCEPTION 'Too many withdrawal requests. Try again later.';
  END IF;

  SELECT COUNT(*) INTO v_pending_count
  FROM public.withdrawals
  WHERE user_id = v_user_id AND status = 'pending';
  IF v_pending_count >= 3 THEN RAISE EXCEPTION 'Too many pending withdrawals'; END IF;

  SELECT balance_usd INTO v_balance FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF v_balance < p_amount_usd THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  UPDATE public.users SET balance_usd = balance_usd - p_amount_usd WHERE id = v_user_id;

  INSERT INTO public.withdrawals (user_id, network, wallet_address, amount_usd, status)
  VALUES (v_user_id, p_network, lower(p_wallet_address), p_amount_usd, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
