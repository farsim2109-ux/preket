-- Fix duplicate user rows (run once in Supabase SQL Editor)
-- Problem: admin role on one row, app reads a different row by auth id

DELETE FROM public.users WHERE email = 'farsim2109@gmail.com';

INSERT INTO public.users (id, email, role, balance_usd)
SELECT id, email, 'admin', 0
FROM auth.users
WHERE email = 'farsim2109@gmail.com';

-- Prevent duplicate emails in future
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON public.users (email);
