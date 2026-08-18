-- Lock down audit + withdrawal-timeout functions

REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_logs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_audit_logs(INT, INT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_audit_logs(INT, INT, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public._refund_pending_withdrawal(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._refund_pending_withdrawal(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.auto_refund_timed_out_withdrawals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_refund_timed_out_withdrawals() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_withdrawal_timeouts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_withdrawal_timeouts() TO service_role;

-- Internal trigger functions (not callable via RPC)
REVOKE EXECUTE ON FUNCTION public.log_user_balance_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_bet_creation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_withdrawal_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_withdrawal_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_withdrawal_timeout() FROM PUBLIC, anon, authenticated;
