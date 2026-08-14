# Preket

A centralized hybrid prediction market platform — Polymarket-style UI with a Web2 custodial USD ledger. No smart contracts, no gas fees for trading.

## Features

- **Multi-chain deposits:** Polygon, BSC, Arbitrum, Base — verified on-chain via Alchemy, credited in USD
- **Pari-mutuel betting:** Dynamic odds from pool sizes
- **Atomic ledger:** All balance operations in Postgres transactions
- **Admin dashboard:** Create/resolve events, approve withdrawals
- **Supabase Auth:** Email/password with Row Level Security

## Setup

### 1. Clone and install

```bash
cd preket
npm install
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run migrations in order via SQL Editor or Supabase CLI:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_functions.sql`
3. Copy your project URL and keys

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in all values:

```bash
cp .env.example .env.local
```

Required:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_WALLET_*` — receive-only addresses per chain (no private keys)
- `ALCHEMY_API_KEY` — for deposit verification

### 4. Create an admin user

1. Sign up via the app
2. In Supabase SQL Editor:
   ```sql
   UPDATE public.users SET role = 'admin' WHERE email = 'your@email.com';
   ```

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy (Vercel)

1. Push to GitHub
2. Import in Vercel
3. Add all env vars from `.env.example`
4. Deploy

## Architecture

See [DECISIONS.md](./DECISIONS.md) for design choices and defaults.

## Security Notes

- Private keys are **never** stored in this codebase
- Withdrawals are processed manually by admin off-platform
- `tx_hash` uniqueness enforced at DB + application level
- All balance changes go through Postgres RPC functions with row locks
