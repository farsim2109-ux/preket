-- Restore the original configured admin email as a permanent admin fallback.
-- Keep the database role authoritative while also allowing the configured
-- owner account to retain admin access if its users row is ever stale.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
  OR lower(coalesce(auth.jwt()->>'email','')) = 'farsim2109@gmail.com';
$$;

UPDATE public.users
SET role = 'admin'
WHERE lower(email) = 'farsim2109@gmail.com';
