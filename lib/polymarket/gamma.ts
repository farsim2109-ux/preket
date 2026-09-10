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

export interface PolymarketEventsPage {
  events: GammaEvent[];
  nextCursor: string | null;
}

export async function fetchNewTopEvents(
  afterCursor: string | null,
): Promise<PolymarketEventsPage> {
  const params = new URLSearchParams({
    active: "true",
    closed: "false",
    limit: "50",
  });
  if (afterCursor) params.set("after_cursor", afterCursor);

  const res = await fetch(`${GAMMA_BASE}/events/keyset?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gamma API error: ${res.status}`);

  const data = await res.json();
  return {
    events: Array.isArray(data?.events) ? data.events : [],
    nextCursor: typeof data?.next_cursor === "string" ? data.next_cursor : null,
  };
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

/**
 * Normalize Gamma's category into Preket's UI taxonomy.
 * When Gamma returns an empty/generic category, use the event text as a
 * deterministic fallback so older/existing imports don't all collapse into
 * General. The fallback is intentionally conservative.
 */
export function mapCategory(gammaCategory: string, title = "", description = ""): string {
  const category = (gammaCategory || "").toLowerCase().trim();
  const text = `${title} ${description}`.toLowerCase();

  if (category.includes("sport")) return "sports";
  if (category.includes("crypto") || category.includes("blockchain")) return "crypto";
  if (category.includes("politic") || category.includes("election") || category.includes("government")) return "politics";
  if (category.includes("tech") || category.includes("science") || category.includes("ai") || category.includes("technology")) return "tech";
  if (category.includes("pop") || category.includes("entertain") || category.includes("culture")) return "entertainment";
  if (category.includes("business") || category.includes("economy") || category.includes("economic")) return "business";
  if (category.includes("finance") || category.includes("financial") || category.includes("market")) return "finance";
  if (category.includes("world") || category.includes("international") || category.includes("global")) return "world";

  if (/\b(nfl|nba|nhl|mlb|ncaa|ufc|mma|fifa|soccer|football|basketball|baseball|tennis|golf|boxing|cricket|formula 1|f1|racing|match|game|tournament|league)\b/.test(text)) return "sports";
  if (/\b(bitcoin|btc|ethereum|eth|solana|sol|crypto|cryptocurrency|token|memecoin|dogecoin|xrp)\b/.test(text)) return "crypto";
  if (/\b(trump|president|presidential|election|senate|congress|governor|mayor|democrat|republican|vote|voting|government|prime minister|parliament)\b/.test(text)) return "politics";
  if (/\b(ai|artificial intelligence|openai|google|apple|microsoft|nvidia|robot|technology|tech|software|chip|semiconductor|spacex)\b/.test(text)) return "tech";
  if (/\b(movie|film|music|song|album|actor|actress|celebrity|grammy|oscar|emmy|tv|television|entertainment)\b/.test(text)) return "entertainment";
  if (/\b(stock|stocks|nasdaq|s&p|dow|fed|interest rate|inflation|gdp|recession|economy|economic|business|company|earnings)\b/.test(text)) return "finance";

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
