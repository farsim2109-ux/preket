-- RLS policy performance: evaluate auth.uid() once per statement.
DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users FOR SELECT USING ((select auth.uid()) = id OR is_admin());

DROP POLICY IF EXISTS users_update_own_email ON public.users;
CREATE POLICY users_update_own_email ON public.users FOR UPDATE USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id AND role = (SELECT u.role FROM public.users u WHERE u.id = (select auth.uid())));

DROP POLICY IF EXISTS bets_select_own ON public.bets;
CREATE POLICY bets_select_own ON public.bets FOR SELECT USING ((select auth.uid()) = user_id OR is_admin());

DROP POLICY IF EXISTS deposits_select_own ON public.deposits;
CREATE POLICY deposits_select_own ON public.deposits FOR SELECT USING ((select auth.uid()) = user_id OR is_admin());

DROP POLICY IF EXISTS withdrawals_select_own ON public.withdrawals;
CREATE POLICY withdrawals_select_own ON public.withdrawals FOR SELECT USING ((select auth.uid()) = user_id OR is_admin());

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

-- The unique constraint already provides the required unique index.
DROP INDEX IF EXISTS public.idx_deposits_tx_hash;

-- Keep old timeout records bounded automatically.
SELECT cron.schedule('preket_cleanup_withdrawal_timeouts', '15 3 * * *', $$SELECT public.cleanup_old_withdrawal_timeouts();$$)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'preket_cleanup_withdrawal_timeouts'
);
