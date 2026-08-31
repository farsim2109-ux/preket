import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchEventById, fetchNewTopEvents, getBinaryOutcomePrices, mapCategory } from "@/lib/polymarket/gamma";

const TOP_N = 100;
const CRON_SCHEDULE = "55 17 * * *"; // 11:55 PM Bangladesh time (UTC+6)
export const maxDuration = 60;

function checkCronAuth(request: Request): boolean {
  if (request.headers.get("x-preket-supabase-cron") === "true") return true;
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  const header = request.headers.get("x-cron-secret");
  const query = new URL(request.url).searchParams.get("secret");
  if (secret && (authHeader === `Bearer ${secret}` || header === secret || query === secret)) return true;
  return process.env.VERCEL === "1" && request.headers.get("x-vercel-cron-schedule") === CRON_SCHEDULE;
}

type GammaMarketLike = Parameters<typeof getBinaryOutcomePrices>[0];
function selectBinaryMarket(markets: GammaMarketLike[]) {
  const binary = markets.filter((market) => getBinaryOutcomePrices(market));
  return binary.sort((a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0))[0] ?? null;
}

async function resolveOpenPolymarketEvents(admin: ReturnType<typeof createAdminClient>) {
  const { data: openEvents, error: fetchError } = await admin.from("events").select("id, source_event_id, source_condition_id").eq("status", "active").eq("source_platform", "polymarket").not("source_event_id", "is", null);
  if (fetchError) throw new Error(fetchError.message);
  const resolved: string[] = [], stillOpen: string[] = [], needsReview: string[] = [], errors: { id: string; error: string }[] = [];
  const rows = openEvents ?? [], CONCURRENCY = 10;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const results = await Promise.all(rows.slice(i, i + CONCURRENCY).map(async (row) => {
      const sourceId = row.source_event_id as string;
      const sourceConditionId = row.source_condition_id as string | null;
      try {
        const gammaEvent = await fetchEventById(sourceId);
        const market = sourceConditionId ? gammaEvent?.markets?.find((item) => item.conditionId === sourceConditionId) : selectBinaryMarket(gammaEvent?.markets ?? []);
        if (!market) return { kind: "error" as const, id: sourceId, error: "Matching market not found on Polymarket" };
        if (!market.closed) return { kind: "open" as const, id: sourceId };
        const prices = getBinaryOutcomePrices(market);
        if (!prices) return { kind: "review" as const, id: sourceId };
        const isClearYes = prices.yes > 0.9 && prices.no < 0.1, isClearNo = prices.no > 0.9 && prices.yes < 0.1;
        if (!isClearYes && !isClearNo) return { kind: "review" as const, id: sourceId };
        const { error } = await admin.rpc("resolve_external_event", { p_source_platform: "polymarket", p_source_event_id: sourceId, p_winning_outcome: isClearYes ? "YES" : "NO" });
        if (error) return { kind: "error" as const, id: sourceId, error: error.message };
        return { kind: "resolved" as const, id: sourceId };
      } catch (err) { return { kind: "error" as const, id: sourceId, error: err instanceof Error ? err.message : "Unknown error" }; }
    }));
    for (const result of results) {
      if (result.kind === "resolved") resolved.push(result.id);
      else if (result.kind === "open") stillOpen.push(result.id);
      else if (result.kind === "review") needsReview.push(result.id);
      else errors.push({ id: result.id, error: result.error });
    }
  }
  return { resolved, stillOpen, needsReview, errors };
}

export async function GET(request: Request) {
  const startedAt = new Date().toISOString();
  if (!checkCronAuth(request)) return NextResponse.json({ error: "Forbidden", startedAt }, { status: 403 });
  const admin = createAdminClient();
  let events;
  try { events = await fetchNewTopEvents(TOP_N); }
  catch (err) { const error = err instanceof Error ? err.message : "Unknown error"; return NextResponse.json({ error: "Failed to fetch Polymarket events", details: error, startedAt }, { status: 502 }); }
  const results = { imported: [] as string[], skipped: [] as string[], importErrors: [] as { id: string; error: string }[], resolved: [] as string[], stillOpen: [] as string[], needsReview: [] as string[], resolutionErrors: [] as { id: string; error: string }[] };
  for (const ev of events) {
    const market = selectBinaryMarket(ev.markets ?? []);
    if (!market) { results.skipped.push(ev.id); continue; }
    const prices = getBinaryOutcomePrices(market);
    if (!prices) { results.skipped.push(ev.id); continue; }
    const volume = Number(market.volume) || Number(ev.volume) || 0;
    const initialLiquidity = Math.round((volume / 10) * 100) / 100;
    if (initialLiquidity < 50) { results.skipped.push(ev.id); continue; }
    try {
      const { data, error } = await admin.rpc("import_external_event", { p_source_platform: "polymarket", p_source_event_id: ev.id, p_source_condition_id: market.conditionId, p_title: market.question || ev.title, p_description: (ev.description || "").slice(0, 2000), p_category: mapCategory(ev.category), p_yes_price: prices.yes, p_no_price: prices.no, p_initial_liquidity_usd: initialLiquidity });
      if (error) results.importErrors.push({ id: ev.id, error: error.message }); else if (data) results.imported.push(ev.id); else results.skipped.push(ev.id);
    } catch (err) { results.importErrors.push({ id: ev.id, error: err instanceof Error ? err.message : "Unknown error" }); }
  }
  try { const resolution = await resolveOpenPolymarketEvents(admin); results.resolved = resolution.resolved; results.stillOpen = resolution.stillOpen; results.needsReview = resolution.needsReview; results.resolutionErrors = resolution.errors; }
  catch (err) { results.resolutionErrors.push({ id: "_job", error: err instanceof Error ? err.message : "Resolution check failed" }); }
  const completedAt = new Date().toISOString();
  return NextResponse.json({ ok: true, startedAt, completedAt, topN: TOP_N, imported: results.imported.length, skipped: results.skipped.length, importErrors: results.importErrors.length, resolved: results.resolved.length, stillOpen: results.stillOpen.length, needsReview: results.needsReview.length, resolutionErrors: results.resolutionErrors.length, results });
}
