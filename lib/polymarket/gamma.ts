const GAMMA_BASE = "https://gamma-api.polymarket.com";

export interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  closed: boolean;
  active: boolean;
  outcomes: string;
  outcomePrices: string;
  volume: string;
}

export interface GammaEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  active: boolean;
  closed: boolean;
  volume: number;
  markets: GammaMarket[];
}

export async function fetchNewTopEvents(limit: number): Promise<GammaEvent[]> {
  const url = `${GAMMA_BASE}/events?active=true&closed=false&order=volume&ascending=false&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Gamma API error: ${res.status}`);
  return res.json();
}

export async function fetchEventById(id: string): Promise<GammaEvent | null> {
  const url = `${GAMMA_BASE}/events?id=${encodeURIComponent(id)}&limit=1`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

export function mapCategory(gammaCategory: string): string {
  const c = (gammaCategory || "").toLowerCase();
  if (c.includes("sport")) return "sports";
  if (c.includes("crypto")) return "crypto";
  if (c.includes("politic") || c.includes("election")) return "politics";
  if (c.includes("tech") || c.includes("science")) return "tech";
  if (c.includes("pop") || c.includes("entertain") || c.includes("culture")) return "entertainment";
  if (c.includes("business") || c.includes("economy")) return "business";
  return "general";
}

export function getBinaryOutcomePrices(market: GammaMarket): { yes: number; no: number } | null {
  let outcomes: string[] = [];
  let prices: number[] = [];
  try {
    outcomes = JSON.parse(market.outcomes);
    prices = JSON.parse(market.outcomePrices).map(Number);
  } catch {
    return null;
  }
  if (outcomes.length !== 2) return null;
  const yesIdx = outcomes.findIndex((o) => o.toLowerCase() === "yes");
  const noIdx = outcomes.findIndex((o) => o.toLowerCase() === "no");
  if (yesIdx === -1 || noIdx === -1) return null;
  return { yes: prices[yesIdx], no: prices[noIdx] };
}
