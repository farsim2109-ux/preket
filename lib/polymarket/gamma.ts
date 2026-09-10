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

export async function fetchNewTopEvents(afterCursor: string | null): Promise<PolymarketEventsPage> {
  const params = new URLSearchParams({ active: "true", closed: "false", limit: "50" });
  if (afterCursor) params.set("after_cursor", afterCursor);
  const res = await fetch(`${GAMMA_BASE}/events/keyset?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Gamma API error: ${res.status}`);
  const data = await res.json();
  return {
    events: Array.isArray(data?.events) ? data.events : [],
    nextCursor: typeof data?.next_cursor === "string" ? data.next_cursor : null,
  };
}

export function toProxyYesNoMarket(market: GammaMarket, originalEventTitle: string): GammaMarket | null {
  let outcomes: string[] = [];
  let prices: number[] = [];
  try {
    outcomes = JSON.parse(market.outcomes);
    prices = JSON.parse(market.outcomePrices).map(Number);
  } catch { return null; }
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

export function toBinaryCompatibleMarket(market: GammaMarket, originalEventTitle: string): GammaMarket | null {
  if (getBinaryOutcomePrices(market)) return market;
  return toProxyYesNoMarket(market, originalEventTitle);
}

export async function fetchRecentlyClosedEvents(limit: number): Promise<GammaEvent[]> {
  const urls = [
    `${GAMMA_BASE}/events?closed=true&order=endDate&ascending=false&limit=${limit}`,
    `${GAMMA_BASE}/events?closed=true&order=updatedAt&ascending=false&limit=${limit}`,
    `${GAMMA_BASE}/events?closed=true&limit=${limit}`,
  ];
  let lastError: Error | null = null;
  for (const url of urls) {
    try { return await fetchEvents(url); }
    catch (err) { lastError = err instanceof Error ? err : new Error("Unknown Gamma API error"); }
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
 * Explicit Gamma metadata wins only when it maps to a known taxonomy.
 * Generic metadata is intentionally ignored and title/description are scored
 * with domain-specific rules so existing and newly imported events don't all
 * collapse into General.
 */
export function mapCategory(gammaCategory: string, title = "", description = ""): string {
  const category = (gammaCategory || "").toLowerCase().trim();
  const text = `${title} ${description}`.toLowerCase();

  if (category.includes("sport")) return "sports";
  if (category.includes("crypto") || category.includes("blockchain")) return "crypto";
  if (category.includes("politic") || category.includes("election") || category.includes("government")) return "politics";
  if (category.includes("tech") || category.includes("science") || category.includes("ai") || category.includes("technology")) return "tech";
  if (category.includes("pop") || category.includes("entertain") || category.includes("culture")) return "entertainment";
  if (category.includes("finance") || category.includes("financial") || category.includes("market")) return "finance";
  if (category.includes("business") || category.includes("economy") || category.includes("economic")) return "business";
  if (category.includes("world") || category.includes("international") || category.includes("global")) return "world";

  const rules: Array<[string, RegExp]> = [
    ["sports", /\b(nfl|nba|wnba|nhl|mlb|ncaa|ufc|mma|fifa|soccer|football|basketball|baseball|tennis|golf|boxing|cricket|formula\s*1|f1|racing|match|tournament|league|championship|playoffs?|world series|super bowl|grand prix|olympics?)\b/],
    ["crypto", /\b(bitcoin|btc|ethereum|eth|solana|sol|crypto|cryptocurrency|blockchain|token|memecoin|dogecoin|xrp|bnb|defi|nft|stablecoin|usdc|usdt)\b/],
    ["tech", /\b(ai|artificial intelligence|openai|chatgpt|gpt[- ]?\d|anthropic|claude|gemini|google|apple|microsoft|nvidia|meta|robot|robotics|technology|tech|software|chip|semiconductor|spacex|tesla|quantum computing|iphone|android)\b/],
    ["entertainment", /\b(movie|film|music|song|album|actor|actress|celebrity|grammy|oscar|emmy|tv|television|netflix|youtube|streaming|entertainment|box office|concert)\b/],
    ["finance", /\b(stock|stocks|nasdaq|s&p|dow jones|fed|federal reserve|interest rate|interest rates|inflation|cpi|gdp|recession|economy|economic|treasury|bond yield|unemployment|jobs report|earnings|revenue|ipo|forex|currency|dollar|euro|pound|yen)\b/],
    ["business", /\b(business|corporate|merger|acquisition|startup|ceo|company launches|retail sales|sales forecast|industry|company)\b/],
    ["politics", /\b(president|presidential|election|senate|congress|governor|mayor|democrat|republican|vote|voting|government|prime minister|parliament|cabinet|supreme court|political party|legislation|bill passes|referendum|politics)\b/],
    ["world", /\b(ukraine|russia|israel|iran|china|taiwan|north korea|south korea|gaza|palestine|nato|united nations|war|warfare|ceasefire|invasion|military conflict|geopolitic|international|global|country|earthquake|hurricane|climate)\b/],
  ];

  for (const [name, pattern] of rules) {
    if (pattern.test(text)) return name;
  }
  return "general";
}

export function getBinaryOutcomePrices(market: GammaMarket): { yes: number; no: number } | null {
  let outcomes: string[] = [];
  let prices: number[] = [];
  try {
    outcomes = JSON.parse(market.outcomes);
    prices = JSON.parse(market.outcomePrices).map(Number);
  } catch { return null; }
  if (outcomes.length !== 2) return null;
  const yesIdx = outcomes.findIndex((o) => o.toLowerCase() === "yes");
  const noIdx = outcomes.findIndex((o) => o.toLowerCase() === "no");
  if (yesIdx === -1 || noIdx === -1) return null;
  return { yes: prices[yesIdx], no: prices[noIdx] };
}
