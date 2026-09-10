-- Store the real Polymarket source volume separately from Preket's internal liquidity/pools.
-- This is source metadata only; it must never be used as CPMM reserves or user ledger volume.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS polymarket_source_volume_usd NUMERIC(24, 2);

COMMENT ON COLUMN public.events.polymarket_source_volume_usd IS
  'Latest source-market volume reported by Polymarket in USD. Informational metadata only; not Preket trading volume or CPMM liquidity.';
