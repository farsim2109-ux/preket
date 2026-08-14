-- Seed balances for admin and test user

UPDATE public.users
SET role = 'admin', balance_usd = 1000000
WHERE email = 'farsim2109@gmail.com';

INSERT INTO public.users (id, email, role, balance_usd)
SELECT id, email, 'user', 1000
FROM auth.users
WHERE email = '2262c0120rumc@gmail.com'
ON CONFLICT (id) DO UPDATE
SET role = 'user', balance_usd = 1000;

-- Ensure profile rows exist for seeded users
INSERT INTO public.profiles (id)
SELECT u.id FROM public.users u
WHERE u.email IN ('farsim2109@gmail.com', '2262c0120rumc@gmail.com')
ON CONFLICT (id) DO NOTHING;
