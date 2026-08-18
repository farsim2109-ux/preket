-- These helpers are internal authorization/audit primitives, not public RPC endpoints.
REVOKE EXECUTE ON FUNCTION public.get_audit_logs(integer, integer, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_audit_logs(integer, integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_audit_logs(integer, integer, uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.is_admin() TO postgres;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;
