import type { Outcome } from "@/lib/types";

export interface TradeRow {
  outcome: Outcome;
  // Older rows may not have trade_type populated. Those rows are historical buys.
  trade_type?: "buy" | "sell" | null;
  shares: number | null;
}

export function netShares(trades: TradeRow[], outcome: Outcome): number {
  const raw = trades
    .filter((t) => t.outcome === outcome)
    .reduce((sum, t) => {
      const sh = Number(t.shares ?? 0);
      // Missing/null trade_type must never be interpreted as a sell.
      const type = t.trade_type ?? "buy";
      return sum + (type === "sell" ? -sh : sh);
    }, 0);
  return Math.max(0, Math.floor(raw * 1e6) / 1e6);
}

export function netPositions(trades: TradeRow[]) {
  return { yes: netShares(trades, "YES"), no: netShares(trades, "NO") };
}
