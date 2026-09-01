# Preket — AI Project Context

> Read this file before making changes. This document is intended to give any AI coding agent a fast, consistent understanding of the project.

## 1. Project identity

- Project: **Preket**
- GitHub repository: `farsim2109-ux/preket`
- Default branch: `master`
- Repository is currently public.
- Working directory used during local development: `C:\Users\Admin\preket`

## 2. Product

Preket is a centralized hybrid prediction-market platform with a Polymarket-inspired UI and a Web2 custodial USD ledger.

Core model:
- No smart contracts for trading.
- No gas fees for internal trading.
- Users deposit supported crypto assets on supported EVM networks.
- Verified deposits are credited to an internal USD balance.
- Users buy/sell YES/NO outcome shares.
- Resolution settles winning shares at $1, subject to the project's solvency rules.
- Withdrawals are requested in the app and processed manually by an admin off-platform.

## 3. Main stack

- Next.js App Router
- React
- TypeScript
- Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
- PostgreSQL / Supabase RPC functions
- viem for EVM-related functionality
- Zod for validation
- Lucide React for icons
- Tailwind CSS / PostCSS
- Vercel for deployment

### Important version note

`package.json` currently declares Next.js `^16.3.1` and React `^19.1.1`. Older documentation in `DECISIONS.md` says Next.js 14.2.x, so **treat `package.json` and the actual codebase as authoritative** and update stale documentation when appropriate.

## 4. Architecture

There is no separate Express backend.

Backend responsibilities are implemented through:
- Next.js Route Handlers
- Supabase/Postgres RPC functions
- Supabase Auth
- RLS policies

Authentication:
- Primary auth: Supabase email/password.
- `public.users.id` maps to `auth.users.id`.
- User records are created by a database trigger.
- Admin access is based on `public.users.role = 'admin'` and is protected by middleware/server-side checks/RLS.
- Wallet-connect is scaffolded in types but is not part of the MVP UI.

## 5. Current repository structure

Important top-level paths currently include:

- `.cursor/`
- `app/` — Next.js application routes/pages
- `components/` — reusable UI components
- `lib/` — shared application logic
- `scripts/` — maintenance scripts
- `supabase/` — Supabase migrations/configuration
- `proxy.ts` — auth/proxy behavior
- `auto-sync.ps1` — local synchronization helper
- `README.md` — setup/security/deployment notes
- `DECISIONS.md` — architecture decisions
- `package.json` — authoritative dependency/script versions
- `.env.example` — required environment variable names

Do not assume this list is exhaustive; inspect the repository before implementing a feature.

## 6. Database

Supabase project:
- Project ref: `eemggnjdknqutlidyvpa`
- Region: `ap-northeast-2`
- PostgreSQL major version: 17
- Current status: active/healthy

The public schema currently contains these main tables:

### `public.users`
- `id` UUID, primary key, linked to `auth.users.id`
- `email`
- `balance_usd` numeric, default 0, must be >= 0
- `role`: `user` or `admin`
- `created_at`

### `public.profiles`
- `id` UUID, primary key, linked to `auth.users.id`
- `username` (unique, validated)
- `display_name`
- `avatar_url`
- `bio`
- `created_at`
- `updated_at`

### `public.events`
- Event title/description/category
- `status`: active/resolved/cancelled
- `winning_outcome`: YES/NO when resolved
- YES/NO pool totals
- CPMM/source-related fields are also present

### `public.bets`
- User/event references
- Outcome: YES/NO
- USD amount, payout, entry price, shares
- Trade type
- Fee
- CPMM-related value
- Status: active/won/lost

### `public.deposits`
- User reference
- Network: polygon/bsc/arbitrum/base
- Unique transaction hash
- Crypto amount and USD amount
- Status: pending/verified/failed
- Token
- Confirmation timestamp

### `public.withdrawals`
- User reference
- Network
- Wallet address
- USD amount
- Status: pending/approved/rejected
- Created timestamp

### `public.withdrawal_timeouts`
- Withdrawal reference
- Requested/timeout timestamps
- Refund state

### `public.rate_limit_buckets`
- Rate-limiting key/window/count

### `public.audit_logs`
- Timestamp/user/action/table/record information
- Old/new JSON values
- IP/user-agent fields

All listed public tables currently have RLS enabled.

## 7. Money and trading rules

Currency:
- USD values use `numeric(18,2)`.
- Balance-changing operations are intended to be atomic and server-side.

Trading:
- Trade types: buy and sell.
- Users hold net shares per outcome.
- Trading fee: `$0.02` per buy/sell transaction according to current architecture decisions.
- Minimum buy: `$1`.
- Maximum trade: `$1,000,000`.
- Odds/pool behavior follows the project's current pool/CPMM implementation. **Inspect the current RPC/code before changing pricing logic; do not rely only on this summary.**

Resolution:
- Winning shares normally pay `$1` each.
- Insolvency/scaling rules may apply.
- Cancelled events refund net cash paid according to the current implementation.

## 8. Deposits

Supported networks:
- Polygon
- BSC
- Arbitrum
- Base

Supported token model currently documented:
- Native assets
- USDT
- USDC
- Bridged USDC.e on Polygon/Arbitrum where supported by the implementation

Deposit verification:
- One receive-only EVM address is used via `DEPOSIT_ADDRESS`.
- RPC URLs can be configured per chain, with Alchemy fallback.
- Confirmation defaults documented by the project: Polygon/BSC 15; Arbitrum/Base 30.
- Duplicate transaction hashes must never credit twice.
- Pending deposits return a pending state and are polled by the frontend.

Before modifying deposit verification, inspect the relevant route handlers, validation code, RPC/database functions, and migrations together.

## 9. Withdrawals

- User balance is deducted when a withdrawal request is created according to current implementation.
- Admin manually sends crypto off-platform.
- App does **not** store private keys or sign outgoing blockchain transactions.
- Withdrawal requests are rate-limited and have timeout cleanup logic.
- Never add private keys, seed phrases, or signing secrets to the repository.

## 10. Security rules

Treat these as hard project rules:

1. Never commit secrets or private keys.
2. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
3. Preserve RLS protections.
4. Balance-changing operations must remain server-side/atomic.
5. Internal authorization/audit RPCs must not become callable by ordinary clients.
6. Preserve same-origin protections for auth callback redirects.
7. Preserve withdrawal rate limits and pending-request limits.
8. Do not weaken admin authorization to make a feature easier.
9. Do not perform destructive production database operations unless explicitly requested and verified.
10. Before changing money, auth, deposit, withdrawal, or resolution logic, inspect related migrations/RPCs/routes and test concurrency/security implications.

## 11. Environment variables

Use `.env.example` as the source of truth for variable names. Never place actual secret values in this file.

Important categories include:
- Supabase public URL/key
- Supabase service-role key
- Deposit address
- Per-chain RPC URLs / Alchemy configuration
- Other project-specific configuration present in `.env.example`

If an AI needs a secret, ask the user to configure it through the appropriate local/Vercel/Supabase secret mechanism rather than writing it into source control.

## 12. Vercel

Vercel team:
- Name: `Preket`
- Team slug: `preket`
- Team ID: `team_vNFlJagoJ27YR9TpvGTrYy8c`
- Plan: Hobby

Vercel project:
- Name: `preket`
- Project ID: `prj_Xi9qIaKQM5nlbUqoahzGfiMVv7yb`
- Git integration: `farsim2109-ux/preket`

When changing environment-dependent behavior, remember that local `.env.local` and Vercel environment variables are separate configuration surfaces.

## 13. Development workflow

Default workflow for an AI coding agent:

1. Read this file.
2. Read `README.md` and `DECISIONS.md`.
3. Inspect the relevant existing code before proposing changes.
4. Search for related routes/components/functions/migrations.
5. Make the smallest coherent change.
6. Preserve existing behavior outside the requested scope.
7. Run lint/build/tests that are available and relevant.
8. Inspect the diff for accidental changes or security regressions.
9. Commit changes with a clear message.
10. Prefer a feature branch and PR for non-trivial work rather than editing `master` directly.

## 14. AI collaboration rules

Multiple AI agents may work on this same repository.

### Branching

Preferred pattern:
- `master` = stable integration branch
- `ai/<agent-name>/<task>` = isolated work branch

Examples:
- `ai/frontend/event-page`
- `ai/backend/deposit-fix`
- `ai/database/rls-audit`

Do not blindly overwrite another agent's work. Before editing:
- inspect the current branch/status if available;
- inspect recent commits;
- inspect the files you intend to change;
- avoid broad rewrites when a focused edit is sufficient.

### Handoff

When finishing a task, report:
- what changed;
- files changed;
- migrations/RPCs changed;
- commands/tests run;
- known limitations;
- anything the next agent must verify.

## 15. What an AI should NOT do automatically

- Do not reset/drop production data.
- Do not delete migrations to fix a schema problem.
- Do not disable RLS.
- Do not expose service-role credentials.
- Do not change money/fee/payout semantics without inspecting existing implementation and stating the impact.
- Do not replace working architecture with a new framework without explicit instruction.
- Do not assume an old documentation statement is still true if the code/package configuration contradicts it.

## 16. Verification checklist

For UI-only changes:
- Verify affected routes/components.
- Run lint/build where practical.
- Check responsive behavior if relevant.

For backend/API changes:
- Validate authentication and authorization paths.
- Validate input with existing project conventions.
- Check error handling and status codes.
- Check service-role usage.

For database changes:
- Inspect existing migrations/RPCs first.
- Use a migration for DDL.
- Check RLS policies.
- Check foreign keys/constraints/indexes.
- Consider concurrent requests and transaction behavior.

For money/deposit/withdrawal/resolution changes:
- Treat as high risk.
- Test duplicate requests/replays.
- Test concurrent operations.
- Test insufficient balance/invalid input.
- Test authorization boundaries.
- Test failure/rollback behavior.

## 17. Authoritative-source rule

When this context file conflicts with the live code/database:

1. Live production safety/security constraints win.
2. Current source code and current database schema win over this summary.
3. Current `package.json` wins over stale version statements in documentation.
4. Existing migrations/RPC definitions win over assumptions.
5. Update this context file when a significant architecture decision changes.

## 18. First instruction to a new AI agent

Before doing any implementation, inspect the repository and say:

- what the current architecture is;
- what files are relevant to the requested task;
- what database/RPC dependencies are involved;
- what could break;
- what you intend to change.

Then implement only after understanding the existing system.
