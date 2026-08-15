import {
  sellProceedsWithSpreadFromReserves,
  getMarketPricesFromReserves,
  avgCpmmPerPmFromTrades,
} from "@/lib/market-math";
import { floorShares } from "@/lib/shares";
import type { BetStatus, EventStatus, Outcome } from "@/lib/types";

export interface PortfolioBet {
  id: string;
  event_id: string;
  outcome: Outcome;
  amount_usd: number;
  entry_price: number | null;
  shares: number | null;
  trade_type: "buy" | "sell";
  fee_usd: number;
  cpmm_per_pm?: number | null;
  status: BetStatus;
  payout_usd?: number | null;
  created_at: string;
  events: {
    id: string;
    title: string;
    status: EventStatus;
    category: string;
    total_yes_pool: number;
    total_no_pool: number;
    cpmm_ry?: number;
    cpmm_rn?: number;
  } | null;
}

export interface PositionRow {
  key: string;
  eventId: string;
  title: string;
  category: string;
  outcome: Outcome;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  traded: number;
  toWin: number;
  value: number;
  costBasis: number;
  pnl: number;
  pnlPct: number;
}

export interface HistoryRow {
  id: string;
  eventId: string;
  title: string;
  category: string;
  outcome: Outcome;
  tradeType: "buy" | "sell";
  shares: number;
  price: number;
  amount: number;
  fee: number;
  status: BetStatus;
  payoutUsd: number | null;
  createdAt: string;
}

export interface DepositHistoryRow {
  id: string;
  network: string;
  token: string;
  amountCrypto: number;
  amountUsd: number;
  status: string;
  txHash: string;
  createdAt: string;
}

export interface WithdrawalHistoryRow {
  id: string;
  network: string;
  walletAddress: string;
  amountUsd: number;
  status: string;
  createdAt: string;
}

export interface PortfolioSummary {
  cash: number;
  positionsValue: number;
  totalValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
}

function groupKey(eventId: string, outcome: Outcome) {
  return `${eventId}:${outcome}`;
}

function accumulatePosition(trades: PortfolioBet[]) {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  let shares = 0;
  let costBasis = 0;
  let traded = 0;

  for (const t of sorted) {
    const sh = Number(t.shares ?? 0);
    const amt = Number(t.amount_usd);

    if (t.trade_type === "buy") {
      shares += sh;
      costBasis += amt;
      traded += amt;
    } else if (sh > 0 && shares > 0) {
      const sold = Math.min(sh, shares);
      costBasis -= (costBasis * sold) / shares;
      shares -= sold;
    }
  }

  return { shares, costBasis, traded };
}

export function buildPositions(bets: PortfolioBet[]): PositionRow[] {
  const groups = new Map<string, PortfolioBet[]>();

  for (const bet of bets) {
    if (bet.status !== "active" || !bet.events || bet.events.status !== "active") continue;
    const key = groupKey(bet.event_id, bet.outcome);
    const list = groups.get(key) ?? [];
    list.push(bet);
    groups.set(key, list);
  }

  const rows: PositionRow[] = [];

  for (const [key, trades] of Array.from(groups.entries())) {
    const { shares, costBasis, traded } = accumulatePosition(trades);
    if (shares <= 0.000001) continue;

    const heldShares = floorShares(shares);

    const sample = trades[0];
    const event = sample.events!;
    const yesPool = Number(event.total_yes_pool);
    const noPool = Number(event.total_no_pool);
    const cpmmRy = Number(event.cpmm_ry ?? yesPool + 500);
    const cpmmRn = Number(event.cpmm_rn ?? noPool + 500);
    const outcome = sample.outcome;

    const { yesProb, noProb } = getMarketPricesFromReserves(cpmmRy, cpmmRn);
    const currentPrice = outcome === "YES" ? yesProb : noProb;
    const cpmmPerPm = avgCpmmPerPmFromTrades(trades, outcome, cpmmRy, cpmmRn);
    const value = sellProceedsWithSpreadFromReserves(heldShares, cpmmPerPm, outcome, cpmmRy, cpmmRn).proceeds;
    const avgPrice = costBasis / heldShares;
    const pnl = value - costBasis;
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

    rows.push({
      key,
      eventId: event.id,
      title: event.title,
      category: event.category,
      outcome,
      shares: heldShares,
      avgPrice,
      currentPrice,
      traded,
      toWin: heldShares,
      value,
      costBasis,
      pnl,
      pnlPct,
    });
  }

  return rows.sort((a, b) => b.value - a.value);
}

export function buildHistory(bets: PortfolioBet[]): HistoryRow[] {
  return bets
    .map((bet) => ({
      id: bet.id,
      eventId: bet.event_id,
      title: bet.events?.title ?? "Unknown market",
      category: bet.events?.category ?? "general",
      outcome: bet.outcome,
      tradeType: bet.trade_type ?? "buy",
      shares: Number(bet.shares ?? 0),
      price: Number(bet.entry_price ?? 0),
      amount: Number(bet.amount_usd),
      fee: Number(bet.fee_usd ?? 0.02),
      status: bet.status,
      payoutUsd: bet.payout_usd != null ? Number(bet.payout_usd) : null,
      createdAt: bet.created_at,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function summarizePortfolio(cash: number, positions: PositionRow[]): PortfolioSummary {
  const positionsValue = positions.reduce((sum, p) => sum + p.value, 0);
  const costBasis = positions.reduce((sum, p) => sum + p.costBasis, 0);
  const unrealizedPnl = positionsValue - costBasis;
  const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;

  return {
    cash,
    positionsValue,
    totalValue: cash + positionsValue,
    unrealizedPnl,
    unrealizedPnlPct,
  };
}
