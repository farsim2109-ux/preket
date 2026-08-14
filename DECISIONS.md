# Preket — Architecture Decisions

## General

- **Project location:** `C:\Users\Admin\preket` (user home; no ~/Projects folder existed).
- **Next.js version:** 14.2.x with App Router, no `src/` directory.
- **No separate Express server:** All backend logic lives in Route Handlers and Postgres RPC functions.

## Auth

- **Primary auth:** Supabase email/password. Wallet-connect is scaffolded in types but not implemented in MVP UI.
- **User profile:** `public.users` table keyed to `auth.users.id`, created via database trigger on signup.
- **Admin promotion:** First admin must be set manually in Supabase (`UPDATE users SET role = 'admin' WHERE email = '...'`).

## Money & Ledger

- **Currency storage:** `numeric(18,2)` for all USD amounts; all balance math runs server-side in Postgres functions.
- **Atomic operations:** Bets, deposits, resolution, and withdrawals use `SECURITY DEFINER` RPC functions with row locks.

## Deposits

- **Confirmation defaults:** Polygon 12, BSC 12, Arbitrum 6, Base 6 (L2s use lower threshold).
- **Replay prevention:** Unique constraint on `deposits.tx_hash` + application check before any external API call.
- **Pending txs:** Return HTTP 202 with `status: pending` when confirmations are insufficient.
- **Token support:** Native token + one primary stablecoin per chain (POL/USDC on Polygon, BNB/USDT on BSC, USDC on Arbitrum/Base).
- **Price oracle:** CoinGecko free API; optional API key for higher rate limits.

## Betting

- **Trade types:** Buy and Sell (Polymarket-style). Users hold net shares per outcome.
- **Fee:** $0.02 silently deducted on every buy (cost + fee) and sell (proceeds − fee).
- **Odds model:** Real pool ratio — `yes_pool / total_pool`. Empty market = 50/50.
- **Buy:** Pay cost + $0.02 → receive shares at current price ($1/share if outcome wins).
- **Sell:** Sell shares at current price → receive proceeds − $0.02.
- **Bet limits:** Min buy $1 · Max **$1,000,000** per trade.

## Resolution

- **Payout:** Net shares held on winning outcome × $1 (scaled if pool insolvent).
- **Cancelled events:** Refund net cash paid (buys − sells including fees).

## Withdrawals

- **Flow:** Deduct balance immediately on request; admin manually sends crypto off-platform and marks approved/rejected.
- **No private keys:** App never signs outgoing transactions.

## UI

- **Design:** Dark Polymarket-inspired theme with green/red outcome accents.
- **Icons:** Lucide React.

## Security

- **RLS:** Enforced on all tables; balance-changing writes only via RPC or service-role API routes.
- **Admin routes:** Gated by `role = 'admin'` in middleware + server-side checks + RLS policies.
