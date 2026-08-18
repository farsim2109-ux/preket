-- Audit logging: balance changes, bets, withdrawals
-- Retention: 6 months (manual or cron cleanup)

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON public.audit_logs(table_name);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins read via RPC; block direct table access for clients
CREATE POLICY audit_logs_admin_select ON public.audit_logs
  FOR SELECT USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.audit_logs
  WHERE timestamp < NOW() - INTERVAL '6 months';
END;
$$;

CREATE OR REPLACE FUNCTION public.log_user_balance_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.balance_usd <> OLD.balance_usd THEN
    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id, old_value, new_value
    ) VALUES (
      NEW.id,
      'balance_update',
      'users',
      NEW.id,
      jsonb_build_object('balance_usd', OLD.balance_usd),
      jsonb_build_object('balance_usd', NEW.balance_usd)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_user_balance_change ON public.users;
CREATE TRIGGER trigger_log_user_balance_change
  AFTER UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.log_user_balance_change();

CREATE OR REPLACE FUNCTION public.log_bet_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, new_value
  ) VALUES (
    NEW.user_id,
    CASE WHEN NEW.trade_type = 'buy' THEN 'bet_placed' ELSE 'bet_sold' END,
    'bets',
    NEW.id,
    jsonb_build_object(
      'amount_usd', NEW.amount_usd,
      'outcome', NEW.outcome,
      'fee_usd', COALESCE(NEW.fee_usd, 0)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_bet_creation ON public.bets;
CREATE TRIGGER trigger_log_bet_creation
  AFTER INSERT ON public.bets
  FOR EACH ROW
  EXECUTE FUNCTION public.log_bet_creation();

CREATE OR REPLACE FUNCTION public.log_withdrawal_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, new_value
  ) VALUES (
    NEW.user_id,
    'withdrawal_requested',
    'withdrawals',
    NEW.id,
    jsonb_build_object(
      'amount_usd', NEW.amount_usd,
      'network', NEW.network,
      'wallet_address', NEW.wallet_address
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_withdrawal_request ON public.withdrawals;
CREATE TRIGGER trigger_log_withdrawal_request
  AFTER INSERT ON public.withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.log_withdrawal_request();

CREATE OR REPLACE FUNCTION public.log_withdrawal_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> OLD.status THEN
    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id, old_value, new_value
    ) VALUES (
      NEW.user_id,
      'withdrawal_' || NEW.status,
      'withdrawals',
      NEW.id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'amount_usd', NEW.amount_usd)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_withdrawal_status_change ON public.withdrawals;
CREATE TRIGGER trigger_log_withdrawal_status_change
  AFTER UPDATE ON public.withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.log_withdrawal_status_change();

CREATE OR REPLACE FUNCTION public.get_audit_logs(
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0,
  p_user_id_filter UUID DEFAULT NULL
)
RETURNS TABLE(
  id BIGINT,
  logged_at TIMESTAMPTZ,
  user_id UUID,
  action TEXT,
  table_name TEXT,
  old_value JSONB,
  new_value JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  RETURN QUERY
  SELECT
    al.id,
    al.timestamp AS logged_at,
    al.user_id,
    al.action,
    al.table_name,
    al.old_value,
    al.new_value
  FROM public.audit_logs al
  WHERE (p_user_id_filter IS NULL OR al.user_id = p_user_id_filter)
  ORDER BY al.timestamp DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
