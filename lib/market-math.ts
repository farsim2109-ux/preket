import type { Outcome } from "@/lib/types";

export const MAX_BET_USD = 1_000_000;
export const TRADE_FEE_USD = 0.02;

/** Virtual AMM depth per side at market creation. */
export const PRICE_SEED = 500;

/** Total bid/ask spread. */
export const SPREAD = 0.02;

const MIN_PRICE = 0.01;
const MAX_PRICE = 0.99;

/** Numerical floor — reserves must stay positive, NOT the seed amount. */
const MIN_RESERVE = 1;

export interface CpmmState {
  ry: number;
  rn: number;
}

export function clampPrice(prob: number): number {
  return Math.min(MAX_PRICE, Math.max(MIN_PRICE, prob));
}

/** Minimum healthy reserve (below this = corrupted, auto-repair). */
export const MIN_HEALTHY_RESERVE = 50;

export function cpmmIsHealthy(ry: number, rn: number): boolean {
  return ry >= MIN_HEALTHY_RESERVE && rn >= MIN_HEALTHY_RESERVE && ry * rn >= 25000;
}

export function normalizeReserves(ry: number, rn: number): CpmmState {
  if (!cpmmIsHealthy(ry, rn)) {
    return { ry: PRICE_SEED, rn: PRICE_SEED };
  }
  return clampReserves(ry, rn);
}

export function clampReserves(ry: number, rn: number): CpmmState {
  return { ry: Math.max(MIN_RESERVE, ry), rn: Math.max(MIN_RESERVE, rn) };
}

export function reservesFromPools(yesPool: number, noPool: number): CpmmState {
  return clampReserves(yesPool + PRICE_SEED, noPool + PRICE_SEED);
}

export function poolsFromReserves(ry: number, rn: number) {
  return {
    yesPool: Math.max(0, ry - PRICE_SEED),
    noPool: Math.max(0, rn - PRICE_SEED),
  };
}

/** Mid probability from CPMM reserves. */
export function cpmmMid(ry: number, rn: number, outcome: Outcome): number {
  ({ ry, rn } = clampReserves(ry, rn));
  const total = ry + rn;
  const yesProb = clampPrice(ry / total);
  return outcome === "YES" ? yesProb : 1 - yesProb;
}

export function getMarketPricesFromReserves(ry: number, rn: number) {
  const yesProb = cpmmMid(ry, rn, "YES");
  return { yesProb, noProb: 1 - yesProb };
}

export function getMarketPrices(yesPool: number, noPool: number) {
  const { ry, rn } = reservesFromPools(yesPool, noPool);
  return getMarketPricesFromReserves(ry, rn);
}

function askFromReserves(ry: number, rn: number, outcome: Outcome) {
  return clampPrice(cpmmMid(ry, rn, outcome) + SPREAD / 2);
}

function bidFromReserves(ry: number, rn: number, outcome: Outcome) {
  return clampPrice(cpmmMid(ry, rn, outcome) - SPREAD / 2);
}

/** CPMM buy — moves curve, returns reserve-token delta (internal units). */
export function cpmmBuyRaw(amount: number, outcome: Outcome, ry: number, rn: number) {
  if (amount <= 0) return { cpmmShares: 0, ry, rn };
  ({ ry, rn } = clampReserves(ry, rn));
  const k = ry * rn;

  if (outcome === "YES") {
    const newRy = ry + amount;
    const newRn = Math.max(MIN_RESERVE, k / newRy);
    return { cpmmShares: Math.max(0, rn - newRn), ry: newRy, rn: newRn };
  }

  const newRn = rn + amount;
  const newRy = Math.max(MIN_RESERVE, k / newRn);
  return { cpmmShares: Math.max(0, ry - newRy), ry: newRy, rn: newRn };
}

/** CPMM sell — inverse of buy, cpmmShares in internal reserve units. */
export function cpmmSellRaw(cpmmShares: number, outcome: Outcome, ry: number, rn: number) {
  if (cpmmShares <= 0) return { proceeds: 0, ry, rn };
  ({ ry, rn } = clampReserves(ry, rn));
  const k = ry * rn;

  if (outcome === "YES") {
    const newRn = rn + cpmmShares;
    const newRy = Math.max(MIN_RESERVE, k / newRn);
    return { proceeds: Math.max(0, ry - newRy), ry: newRy, rn: newRn };
  }

  const newRy = ry + cpmmShares;
  const newRn = Math.max(MIN_RESERVE, k / newRy);
  return { proceeds: Math.max(0, rn - newRn), ry: newRy, rn: newRn };
}

/**
 * Polymarket shares: $1 payout each if outcome wins.
 * CPMM internal units differ — convert via ratio at fill time.
 */
export function pmSharesFromBuy(amount: number, ask: number, cpmmShares: number) {
  const pm = amount / ask;
  const ratio = cpmmShares > 0 ? cpmmShares / pm : 1;
  return { pmShares: pm, cpmmPerPm: ratio };
}

export function cpmmUnitsFromPmShares(pmShares: number, cpmmPerPm: number) {
  return pmShares * cpmmPerPm;
}

/** Infer cpmm/pm ratio from avg entry (for legacy bets without ratio stored). */
export function inferCpmmPerPm(entryPrice: number, mid: number) {
  if (entryPrice <= 0 || mid <= 0) return 1;
  return mid / entryPrice;
}

export interface BuyFill {
  pmShares: number;
  cpmmPerPm: number;
  ask: number;
  bid: number;
  mid: number;
  ry: number;
  rn: number;
}

export function executeBuyFromReserves(
  amount: number,
  outcome: Outcome,
  ry: number,
  rn: number
): BuyFill {
  ({ ry, rn } = clampReserves(ry, rn));
  const mid = cpmmMid(ry, rn, outcome);
  const ask = askFromReserves(ry, rn, outcome);
  const bid = bidFromReserves(ry, rn, outcome);

  if (amount <= 0) {
    return { pmShares: 0, cpmmPerPm: 1, ask, bid, mid, ry, rn };
  }

  const raw = cpmmBuyRaw(amount, outcome, ry, rn);
  const { pmShares, cpmmPerPm } = pmSharesFromBuy(amount, ask, raw.cpmmShares);

  return {
    pmShares,
    cpmmPerPm,
    ask,
    bid,
    mid,
    ry: raw.ry,
    rn: raw.rn,
  };
}

export interface SellFill {
  proceeds: number;
  bid: number;
  mid: number;
  ry: number;
  rn: number;
}

export function executeSellFromReserves(
  pmShares: number,
  cpmmPerPm: number,
  outcome: Outcome,
  ry: number,
  rn: number
): SellFill {
  ({ ry, rn } = clampReserves(ry, rn));
  const mid = cpmmMid(ry, rn, outcome);
  const bid = bidFromReserves(ry, rn, outcome);

  if (pmShares <= 0) {
    return { proceeds: 0, bid, mid, ry, rn };
  }

  const cpmmUnits = cpmmUnitsFromPmShares(pmShares, cpmmPerPm);
  const raw = cpmmSellRaw(cpmmUnits, outcome, ry, rn);
  const proceeds = raw.proceeds * (bid / mid);

  return { proceeds: Math.max(0, proceeds), bid, mid, ry: raw.ry, rn: raw.rn };
}

export function quoteBuyFromReserves(amount: number, outcome: Outcome, ry: number, rn: number) {
  const fill = executeBuyFromReserves(amount, outcome, ry, rn);
  const priceAfter = cpmmMid(fill.ry, fill.rn, outcome);

  return {
    mid: fill.mid,
    ask: fill.ask,
    bid: fill.bid,
    shares: fill.pmShares,
    cpmmPerPm: fill.cpmmPerPm,
    cost: amount,
    fee: TRADE_FEE_USD,
    totalDebit: amount + TRADE_FEE_USD,
    payout: fill.pmShares,
    profit: fill.pmShares - amount - TRADE_FEE_USD,
    priceAfter,
  };
}

export function quoteSellFromReserves(
  pmShares: number,
  cpmmPerPm: number,
  outcome: Outcome,
  ry: number,
  rn: number
) {
  const fill = executeSellFromReserves(pmShares, cpmmPerPm, outcome, ry, rn);
  const priceAfter = cpmmMid(fill.ry, fill.rn, outcome);

  return {
    mid: fill.mid,
    ask: askFromReserves(ry, rn, outcome),
    bid: fill.bid,
    shares: pmShares,
    proceeds: fill.proceeds,
    fee: TRADE_FEE_USD,
    totalCredit: Math.max(0, fill.proceeds - TRADE_FEE_USD),
    priceAfter,
  };
}

export function avgCpmmPerPmFromTrades(
  trades: Array<{
    trade_type: string;
    shares: number | null;
    amount_usd?: number;
    entry_price?: number | null;
    cpmm_per_pm?: number | null;
  }>,
  outcome: Outcome,
  ry: number,
  rn: number
) {
  let pmHeld = 0;
  let cpmmHeld = 0;

  for (const t of trades) {
    const sh = Number(t.shares ?? 0);
    if (sh <= 0) continue;

    if (t.trade_type === "buy") {
      let ratio = Number(t.cpmm_per_pm ?? 0);
      if (ratio <= 0.0001 || ratio > 1000) {
        ratio = inferCpmmPerPm(Number(t.entry_price ?? 0), cpmmMid(ry, rn, outcome));
      }
      if (ratio <= 0.0001 || ratio > 1000) ratio = 1;
      pmHeld += sh;
      cpmmHeld += sh * ratio;
    } else if (pmHeld > 0) {
      const sold = Math.min(sh, pmHeld);
      cpmmHeld -= (cpmmHeld * sold) / pmHeld;
      pmHeld -= sold;
    }
  }

  if (pmHeld <= 0) return 1;
  return cpmmHeld / pmHeld;
}

// --- Legacy pool-based helpers (cards / fallback) ---

export function getAskPrice(yesPool: number, noPool: number, outcome: Outcome) {
  const { ry, rn } = reservesFromPools(yesPool, noPool);
  return askFromReserves(ry, rn, outcome);
}

export function getBidPrice(yesPool: number, noPool: number, outcome: Outcome) {
  const { ry, rn } = reservesFromPools(yesPool, noPool);
  return bidFromReserves(ry, rn, outcome);
}

export function quoteBuy(amount: number, outcome: Outcome, yesPool: number, noPool: number) {
  const { ry, rn } = reservesFromPools(yesPool, noPool);
  return quoteBuyFromReserves(amount, outcome, ry, rn);
}

export function quoteSell(
  pmShares: number,
  outcome: Outcome,
  yesPool: number,
  noPool: number,
  cpmmPerPm = 1
) {
  const { ry, rn } = reservesFromPools(yesPool, noPool);
  return quoteSellFromReserves(pmShares, cpmmPerPm, outcome, ry, rn);
}

export function sellProceedsWithSpreadFromReserves(
  pmShares: number,
  cpmmPerPm: number,
  outcome: Outcome,
  ry: number,
  rn: number
) {
  return executeSellFromReserves(pmShares, cpmmPerPm, outcome, ry, rn);
}

export function realVolume(yesPool: number, noPool: number) {
  return yesPool + noPool;
}

export function maxBetAmount(balance: number) {
  return Math.min(Math.max(0, balance - TRADE_FEE_USD), MAX_BET_USD);
}

export function computeSellProceeds(
  pmShares: number,
  outcome: Outcome,
  yesPool: number,
  noPool: number,
  cpmmPerPm = 1
) {
  const { ry, rn } = reservesFromPools(yesPool, noPool);
  return executeSellFromReserves(pmShares, cpmmPerPm, outcome, ry, rn).proceeds;
}

export function poolsAfterBuy(yesPool: number, noPool: number, outcome: Outcome, amount: number) {
  return outcome === "YES"
    ? { yesPool: yesPool + amount, noPool }
    : { yesPool, noPool: noPool + amount };
}

export function poolsAfterSell(yesPool: number, noPool: number, outcome: Outcome, proceeds: number) {
  return outcome === "YES"
    ? { yesPool: Math.max(0, yesPool - proceeds), noPool }
    : { yesPool, noPool: Math.max(0, noPool - proceeds) };
}

/** @deprecated */
export function quoteTrade(amount: number, outcome: Outcome, yesPool: number, noPool: number) {
  const q = quoteBuy(amount, outcome, yesPool, noPool);
  const { yesProb, noProb } = getMarketPrices(yesPool, noPool);
  return {
    spotPrice: q.ask,
    avgPrice: q.ask,
    shares: q.shares,
    payout: q.payout,
    profit: q.profit,
    priceAfter: q.priceAfter,
    yesProb,
    noProb,
  };
}

/** @deprecated */
export function entryPrice(yesPool: number, noPool: number, outcome: Outcome) {
  return getAskPrice(yesPool, noPool, outcome);
}
