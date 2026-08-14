/** Matches Postgres NUMERIC(18, 6) on bets.shares */
export const SHARE_DB_DECIMALS = 6;

/** Polymarket-style display / input precision */
export const SHARE_UI_DECIMALS = 2;

export function roundShares(value: number, decimals = SHARE_DB_DECIMALS): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Floor so sell amount never exceeds DB-held shares. */
export function floorShares(value: number, decimals = SHARE_DB_DECIMALS): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const factor = 10 ** decimals;
  return Math.floor(value * factor) / factor;
}

export function formatShareCount(value: number, decimals = SHARE_UI_DECIMALS): string {
  const n = roundShares(value, decimals);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/** String safe for number inputs (no float noise). */
export function sharesInputValue(value: number, decimals = SHARE_UI_DECIMALS): string {
  const n = roundShares(value, decimals);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}

export function parseShareInput(raw: string): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return roundShares(n, SHARE_DB_DECIMALS);
}

/** Percentage of held shares for quick sell buttons (25%, 50%, etc.). */
export function sharePctOfTotal(held: number, pct: number): number {
  if (!Number.isFinite(held) || held <= 0 || pct <= 0) return 0;
  return floorShares(held * pct, SHARE_DB_DECIMALS);
}

/** Full sellable amount — floored to DB precision, no float noise. */
export function maxSellInputValue(held: number): string {
  const floored = floorShares(held, SHARE_DB_DECIMALS);
  if (floored <= 0) return "0";
  const s = floored.toFixed(SHARE_DB_DECIMALS);
  return s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}
