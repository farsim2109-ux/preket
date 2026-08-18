-- Withdrawal auto-refund after 1-hour timeout (uses shared refund helper)

CREATE TABLE IF NOT EXISTS public.withdrawal_timeouts (
  withdrawal_id UUID PRIMARY KEY REFERENCES public.withdrawals(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timeout_at TIMESTAMPTZ NOT NULL,
  refunded BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_timeouts_timeout_at ON public.withdrawal_timeouts(timeout_at);
CREATE INDEX IF NOT EXISTS idx_withdrawal_timeouts_refunded ON public.withdrawal_timeouts(refunded);

ALTER TABLE public.withdrawal_timeouts ENABLE ROW LEVEL SECURITY;

-- Internal helper: refund a pending withdrawal (service_role / triggers only)
CREATE OR REPLACE FUNCTION public._refund_pending_withdrawal(p_withdrawal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  SELECT user_id, amount_usd, status INTO r
  FROM public.withdrawals
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'Withdrawal is not pending';
  END IF;

  UPDATE public.users
  SET balance_usd = balance_usd + r.amount_usd
  WHERE id = r.user_id;

  UPDATE public.withdrawals
  SET status = 'rejected'
  WHERE id = p_withdrawal_id;
END;
$$;

-- Admin reject now delegates to shared helper
CREATE OR REPLACE FUNCTION public.reject_withdrawal(p_withdrawal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  PERFORM public._refund_pending_withdrawal(p_withdrawal_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_withdrawal_timeout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.withdrawal_timeouts (withdrawal_id, requested_at, timeout_at)
  VALUES (NEW.id, NOW(), NOW() + INTERVAL '1 hour')
  ON CONFLICT (withdrawal_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_create_withdrawal_timeout ON public.withdrawals;
CREATE TRIGGER trigger_create_withdrawal_timeout
  AFTER INSERT ON public.withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.create_withdrawal_timeout();

CREATE OR REPLACE FUNCTION public.auto_refund_timed_out_withdrawals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT w.id, w.user_id, w.amount_usd
    FROM public.withdrawals w
    JOIN public.withdrawal_timeouts wt ON w.id = wt.withdrawal_id
    WHERE w.status = 'pending'
      AND wt.timeout_at < NOW()
      AND wt.refunded = FALSE
    FOR UPDATE OF w, wt
  LOOP
    PERFORM public._refund_pending_withdrawal(r.id);

    UPDATE public.withdrawal_timeouts
    SET refunded = TRUE
    WHERE withdrawal_id = r.id;

    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id, new_value
    ) VALUES (
      r.user_id,
      'withdrawal_auto_refunded',
      'withdrawals',
      r.id,
      jsonb_build_object('amount_usd', r.amount_usd, 'reason', 'timeout_1_hour')
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_withdrawal_timeouts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.withdrawal_timeouts
  WHERE timeout_at < NOW() - INTERVAL '7 days' AND refunded = TRUE;
END;
$$;

-- Schedule auto-refund every 5 minutes via pg_cron (Supabase: enable pg_cron in dashboard)
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'preket_auto_refund_withdrawals';

    PERFORM cron.schedule(
      'preket_auto_refund_withdrawals',
      '*/5 * * * *',
      $$SELECT public.auto_refund_timed_out_withdrawals()$$
    );

    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'preket_cleanup_audit_logs';

    PERFORM cron.schedule(
      'preket_cleanup_audit_logs',
      '0 3 * * 0',
      $$SELECT public.cleanup_old_audit_logs()$$
    );
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_object THEN
    NULL;
END;
$cron$;
