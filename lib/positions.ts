import type { Outcome } from "@/lib/types";

export interface TradeRow {
  outcome: Outcome;
  trade_type: "buy" | "sell";
  shares: number | null;
}

export function netShares(trades: TradeRow[], outcome: Outcome): number {
  const raw = trades
    .filter((t) => t.outcome === outcome)
    .reduce((sum, t) => {
      const sh = Number(t.shares ?? 0);
      return sum + (t.trade_type === "buy" ? sh : -sh);
    }, 0);
  return Math.max(0, Math.floor(raw * 1e6) / 1e6);
}

export function netPositions(trades: TradeRow[]) {
  return {
    yes: Math.max(0, netShares(trades, "YES")),
    no: Math.max(0, netShares(trades, "NO")),
  };
}
