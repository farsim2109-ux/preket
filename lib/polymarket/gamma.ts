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

async function fetchEvents(url: string): Promise<GammaEvent[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Gamma API error: ${res.status}`);
  return res.json();
}

export async function fetchNewTopEvents(): Promise<GammaEvent[]> {
  const pageSize = 100;
  const events: GammaEvent[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const url = `${GAMMA_BASE}/events?active=true&closed=false&order=volume&ascending=false&limit=${pageSize}&offset=${offset}`;
    const page = await fetchEvents(url);
    events.push(...page);

    if (page.length < pageSize) break;
  }

  return events;
}

export function toProxyYesNoMarket(
  market: GammaMarket,
  originalEventTitle: string,
): GammaMarket | null {
  let outcomes: string[] = [];
  let prices: number[] = [];

  try {
    outcomes = JSON.parse(market.outcomes);
    prices = JSON.parse(market.outcomePrices).map(Number);
  } catch {
    return null;
  }

  const pricedOutcomes = outcomes
    .map((outcome, index) => ({ outcome, price: prices[index] }))
    .filter((item) => item.outcome && Number.isFinite(item.price));

  if (pricedOutcomes.length < 2) return null;

  pricedOutcomes.sort((a, b) => b.price - a.price);

  const yesOutcome = pricedOutcomes[0];
  const noOutcome = pricedOutcomes[1];

  return {
    ...market,
    question: `Will ${yesOutcome.outcome} win? (from: ${originalEventTitle})`,
    outcomes: JSON.stringify(["Yes", "No"]),
    outcomePrices: JSON.stringify([yesOutcome.price, noOutcome.price]),
  };
}

export function toBinaryCompatibleMarket(
  market: GammaMarket,
  originalEventTitle: string,
): GammaMarket | null {
  if (getBinaryOutcomePrices(market)) return market;
  return toProxyYesNoMarket(market, originalEventTitle);
}

/**
 * Fetch recently closed events using Gamma's supported date ordering.
 * Keep a compatibility fallback because Gamma has changed accepted order
 * fields over time; a 422 from one ordering must not take down the scheduler.
 */
export async function fetchRecentlyClosedEvents(limit: number): Promise<GammaEvent[]> {
  const urls = [
    `${GAMMA_BASE}/events?closed=true&order=endDate&ascending=false&limit=${limit}`,
    `${GAMMA_BASE}/events?closed=true&order=updatedAt&ascending=false&limit=${limit}`,
    `${GAMMA_BASE}/events?closed=true&limit=${limit}`,
  ];

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      return await fetchEvents(url);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Unknown Gamma API error");
    }
  }

  throw lastError ?? new Error("Gamma API error while fetching closed events");
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
