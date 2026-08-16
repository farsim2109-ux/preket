-- Lock down SECURITY DEFINER RPC execute privileges.
-- Postgres grants EXECUTE to PUBLIC on every new function signature by default.

-- Drop obsolete 5-arg credit_deposit (superseded by 020; bypasses token + confirmed_at).
DROP FUNCTION IF EXISTS public.credit_deposit(UUID, TEXT, TEXT, NUMERIC, NUMERIC);

-- Rate limiter used by deposit verify API (service role only)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  count INT NOT NULL DEFAULT 0 CHECK (count >= 0),
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_limit INT,
  p_window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_count INT;
  v_window_start TIMESTAMPTZ;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 OR p_limit <= 0 OR p_window_seconds <= 0 THEN
    RETURN TRUE;
  END IF;

  SELECT count, window_start
  INTO v_count, v_window_start
  FROM public.rate_limits
  WHERE key = p_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.rate_limits (key, count, window_start)
    VALUES (p_key, 1, v_now);
    RETURN TRUE;
  END IF;

  IF v_now > v_window_start + make_interval(secs => p_window_seconds) THEN
    UPDATE public.rate_limits
    SET count = 1, window_start = v_now
    WHERE key = p_key;
    RETURN TRUE;
  END IF;

  IF v_count >= p_limit THEN
    RETURN FALSE;
  END IF;

  UPDATE public.rate_limits SET count = count + 1 WHERE key = p_key;
  RETURN TRUE;
END;
$$;

-- ========== Service-role only ==========
REVOKE EXECUTE ON FUNCTION public.credit_deposit(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_deposit(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.record_failed_deposit(UUID, TEXT, TEXT, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_failed_deposit(UUID, TEXT, TEXT, NUMERIC, NUMERIC) TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) TO service_role;

-- ========== Authenticated user RPCs ==========
REVOKE EXECUTE ON FUNCTION public.place_bet(UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_bet(UUID, TEXT, NUMERIC) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sell_shares(UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_shares(UUID, TEXT, NUMERIC) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.request_withdrawal(TEXT, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(TEXT, TEXT, NUMERIC) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_profile(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_profile(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ========== Admin RPCs (is_admin() enforced inside) ==========
REVOKE EXECUTE ON FUNCTION public.create_event(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_event(TEXT, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.resolve_event(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_event(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_event(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_event(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.approve_withdrawal(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_withdrawal(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reject_withdrawal(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_withdrawal(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_add_liquidity(UUID, NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_liquidity(UUID, NUMERIC, NUMERIC) TO authenticated;

-- ========== Internal helpers (no direct client RPC) ==========
REVOKE EXECUTE ON FUNCTION public.repair_event_cpmm(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_event_pools_from_cpmm(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_net_shares(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_cpmm_per_pm(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
