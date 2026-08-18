-- Restrict the internal position helper to trusted database callers.
-- User-facing code should obtain positions through authenticated server-side flows.
REVOKE EXECUTE ON FUNCTION public.get_net_shares(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_net_shares(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_net_shares(uuid, uuid, text) TO postgres;
