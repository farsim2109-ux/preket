-- Required when Supabase "Automatically expose new tables" is DISABLED
-- Without these grants, the app service_role client cannot read/write users table

GRANT USAGE ON SCHEMA public TO service_role, authenticated, anon;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role, authenticated;

-- Default for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;

-- Ensure admin profile exists (replace email if needed)
INSERT INTO public.users (id, email, role, balance_usd)
SELECT id, email, 'admin', 100
FROM auth.users
WHERE email = 'farsim2109@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin', balance_usd = 100;

-- Prevent duplicate emails
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON public.users (email);
