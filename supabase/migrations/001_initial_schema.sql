-- Preket initial schema
-- Run via Supabase CLI or SQL editor

-- Users profile (extends auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  balance_usd NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (balance_usd >= 0),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Events
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'cancelled')),
  winning_outcome TEXT CHECK (winning_outcome IN ('YES', 'NO') OR winning_outcome IS NULL),
  total_yes_pool NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (total_yes_pool >= 0),
  total_no_pool NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (total_no_pool >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_category ON public.events(category);

-- Bets
CREATE TABLE IF NOT EXISTS public.bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('YES', 'NO')),
  amount_usd NUMERIC(18, 2) NOT NULL CHECK (amount_usd > 0),
  payout_usd NUMERIC(18, 2),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'lost')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bets_user_id ON public.bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_event_id ON public.bets(event_id);
CREATE INDEX IF NOT EXISTS idx_bets_status ON public.bets(status);

-- Deposits
CREATE TABLE IF NOT EXISTS public.deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  network TEXT NOT NULL CHECK (network IN ('polygon', 'bsc', 'arbitrum', 'base')),
  tx_hash TEXT NOT NULL UNIQUE,
  amount_crypto NUMERIC(28, 18) NOT NULL DEFAULT 0,
  amount_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON public.deposits(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_tx_hash ON public.deposits(tx_hash);

-- Withdrawals
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  network TEXT NOT NULL CHECK (network IN ('polygon', 'bsc', 'arbitrum', 'base')),
  wallet_address TEXT NOT NULL,
  amount_usd NUMERIC(18, 2) NOT NULL CHECK (amount_usd > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON public.withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON public.withdrawals(status);

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY users_select_own ON public.users
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY users_update_own_email ON public.users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.users WHERE id = auth.uid()));

-- Events policies
CREATE POLICY events_select_all ON public.events
  FOR SELECT USING (true);

CREATE POLICY events_insert_admin ON public.events
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY events_update_admin ON public.events
  FOR UPDATE USING (public.is_admin());

-- Bets policies
CREATE POLICY bets_select_own ON public.bets
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- Deposits policies
CREATE POLICY deposits_select_own ON public.deposits
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- Withdrawals policies
CREATE POLICY withdrawals_select_own ON public.withdrawals
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
