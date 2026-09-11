import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchNewTopEvents, fetchRecentlyClosedEvents, getBinaryOutcomePrices, mapCategory, toBinaryCompatibleMarket } from "@/lib/polymarket/gamma";

const POLYMARKET_CURSOR_KEY = "polymarket_cursor";
export const maxDuration = 60;

function checkCronAuth(request: Request) {
  if (request.headers.get("x-preket-supabase-cron") === "true") return true;
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  const header = request.headers.get("x-cron-secret");
  const query = new URL(request.url).searchParams.get("secret");
  return Boolean(secret && (auth === `Bearer ${secret}` || header === secret || query === secret));
}

type GammaMarketLike = Parameters<typeof getBinaryOutcomePrices>[0];
function selectBestMarket(markets: GammaMarketLike[]) {
  return [...markets].sort((a,b) => (Number(b.volume)||0) - (Number(a.volume)||0))[0] ?? null;
}

// Preket needs a local liquidity value for its CPMM reserves. Keep it deterministic;
// the old random value made the same market's reserves change on every cron run.
function calculateLiquidityUsd(volume: number) {
  return Math.max(1, Math.round(volume * 0.075 * 100) / 100);
}

async function resolveRecentlyClosedPolymarketEvents(admin: ReturnType<typeof createAdminClient>) {
  const closedEvents = await fetchRecentlyClosedEvents(50);
  const sourceIds = closedEvents.map(e => e.id).filter(Boolean);
  if (!sourceIds.length) return { resolved: [], needsReview: [], errors: [] as {id:string;error:string}[] };

  const { data: openRows, error } = await admin
    .from("events")
    .select("id, source_event_id, source_condition_id")
    .eq("status", "active")
    .eq("source_platform", "polymarket")
    .in("source_event_id", sourceIds);
  if (error) throw new Error(error.message);

  const openBySourceId = new Map((openRows ?? []).map(row => [row.source_event_id as string, row.source_condition_id as string | null]));
  const resolved: string[] = [];
  const needsReview: string[] = [];
  const errors: {id:string;error:string}[] = [];

  for (const gammaEvent of closedEvents) {
    const sourceId = gammaEvent.id;
    if (!openBySourceId.has(sourceId)) continue;
    try {
      const conditionId = openBySourceId.get(sourceId);
      const market = conditionId ? gammaEvent.markets?.find(item => item.conditionId === conditionId) : selectBestMarket(gammaEvent.markets ?? []);
      if (!market) { errors.push({id:sourceId,error:"Matching market not found on Polymarket"}); continue; }
      const compatible = toBinaryCompatibleMarket(market, gammaEvent.title);
      if (!compatible) { needsReview.push(sourceId); continue; }
      const prices = getBinaryOutcomePrices(compatible);
      if (!prices) { needsReview.push(sourceId); continue; }
      const yes = prices.yes > 0.9 && prices.no < 0.1;
      const no = prices.no > 0.9 && prices.yes < 0.1;
      if (!yes && !no) { needsReview.push(sourceId); continue; }
      const result = await admin.rpc("resolve_external_event", { p_source_platform:"polymarket", p_source_event_id:sourceId, p_winning_outcome:yes ? "YES" : "NO" });
      if (result.error) errors.push({id:sourceId,error:result.error.message}); else resolved.push(sourceId);
    } catch (err) { errors.push({id:sourceId,error:err instanceof Error ? err.message : "Unknown error"}); }
  }
  return { resolved, needsReview, errors };
}

async function syncActiveEvents(admin: ReturnType<typeof createAdminClient>, events: Awaited<ReturnType<typeof fetchNewTopEvents>>["events"]) {
  const results = { imported:[] as string[], updated:[] as string[], skipped:[] as string[], importErrors:[] as {id:string;error:string}[], skipReasons:{noBinaryMarket:[] as string[],noPrices:[] as string[],unchangedExisting:[] as string[],rpcReturnedFalse:[] as string[]} };
  const CONCURRENCY = 5;
  const sourceIds = [...new Set(events.map(e => e.id))];
  const { data: existingRows, error } = await admin.from("events").select("id, source_event_id, source_condition_id, title, description, category").eq("source_platform","polymarket").in("source_event_id",sourceIds);
  if (error) throw new Error(error.message);
  const existingBySourceId = new Map((existingRows ?? []).map(row => [row.source_event_id as string, row]));

  const processEvent = async (event: (typeof events)[number]) => {
    const market = selectBestMarket(event.markets ?? []);
    if (!market) { results.skipped.push(event.id); results.skipReasons.noBinaryMarket.push(event.id); return; }
    const compatible = toBinaryCompatibleMarket(market, event.title);
    if (!compatible) { results.skipped.push(event.id); results.skipReasons.noBinaryMarket.push(event.id); return; }
    const prices = getBinaryOutcomePrices(compatible);
    if (!prices) { results.skipped.push(event.id); results.skipReasons.noPrices.push(event.id); return; }
    const volume = Number(compatible.volume) || Number(event.volume) || 0;
    const liquidity = calculateLiquidityUsd(volume);
    const existing = existingBySourceId.get(event.id);
    try {
      if (existing) {
        const title = compatible.question || event.title;
        const description = (event.description || "").slice(0,2000);
        const category = mapCategory(event.category,event.title,event.description);
        // Keep local CPMM reserves aligned with the latest Polymarket Yes/No prices.
        const yesPool = Math.max(0.01, Math.round(liquidity * prices.yes * 100) / 100);
        const noPool = Math.max(0.01, Math.round(liquidity * prices.no * 100) / 100);
        const result = await admin.from("events").update({title,description,category,source_condition_id:compatible.conditionId,total_yes_pool:yesPool,total_no_pool:noPool,polymarket_source_volume_usd:Math.round(volume*100)/100}).eq("id",existing.id);
        if (result.error) results.importErrors.push({id:event.id,error:result.error.message});
        else if (existing.title !== title || existing.description !== description || existing.category !== category || existing.source_condition_id !== compatible.conditionId) results.updated.push(event.id);
        else results.skipped.push(event.id);
        return;
      }
      const result = await admin.rpc("import_external_event", {p_source_platform:"polymarket",p_source_event_id:event.id,p_source_condition_id:compatible.conditionId,p_title:compatible.question || event.title,p_description:(event.description || "").slice(0,2000),p_category:mapCategory(event.category,event.title,event.description),p_yes_price:prices.yes,p_no_price:prices.no,p_initial_liquidity_usd:liquidity});
      if (result.error) results.importErrors.push({id:event.id,error:result.error.message});
      else if (result.data) {
        const volumeResult = await admin.from("events").update({polymarket_source_volume_usd:Math.round(volume*100)/100}).eq("source_platform","polymarket").eq("source_event_id",event.id);
        if (volumeResult.error) results.importErrors.push({id:event.id,error:volumeResult.error.message}); else results.imported.push(event.id);
      } else { results.skipped.push(event.id); results.skipReasons.rpcReturnedFalse.push(event.id); }
    } catch (err) { results.importErrors.push({id:event.id,error:err instanceof Error ? err.message : "Unknown error"}); }
  };
  for (let i=0;i<events.length;i+=CONCURRENCY) await Promise.all(events.slice(i,i+CONCURRENCY).map(processEvent));
  return results;
}

async function runSync(request: Request) {
  const startedAt = new Date().toISOString();
  if (!checkCronAuth(request)) return NextResponse.json({error:"Forbidden",startedAt},{status:403});
  const admin = createAdminClient();
  try {
    const {data:state,error:stateError}=await admin.from("sync_state").select("value").eq("key",POLYMARKET_CURSOR_KEY).maybeSingle();
    if(stateError) throw new Error(stateError.message);

    // Always scan the newest page so newly-created/changed Polymarket markets are picked up
    // immediately. In parallel with that, continue the cursor through older active markets so
    // the whole catalogue still gets refreshed over time.
    const newestPage = await fetchNewTopEvents(null);
    const cursorPage = state?.value ? await fetchNewTopEvents(state.value) : newestPage;
    const byId = new Map<string, (typeof newestPage.events)[number]>();
    for (const event of newestPage.events) byId.set(event.id,event);
    for (const event of cursorPage.events) byId.set(event.id,event);
    const events = [...byId.values()];

    const sync=await syncActiveEvents(admin,events);
    const resolution=await resolveRecentlyClosedPolymarketEvents(admin);
    const nextCursor = cursorPage.nextCursor;
    const r=await admin.from("sync_state").upsert({key:POLYMARKET_CURSOR_KEY,value:nextCursor,updated_at:new Date().toISOString()});
    if(r.error)throw new Error(r.error.message);

    const durationMs=Date.now()-new Date(startedAt).getTime();
    const skipSummary=Object.fromEntries(Object.entries(sync.skipReasons).map(([k,v])=>[k,v.length]));
    console.log(`[Polymarket Sync] ${new Date().toISOString()} | status=OK | newest=${newestPage.events.length} | cursor_page=${cursorPage.events.length} | fetched_unique=${events.length} | imported=${sync.imported.length} | updated=${sync.updated.length} | skipped=${sync.skipped.length} | import_errors=${sync.importErrors.length} | resolved=${resolution.resolved.length} | needs_review=${resolution.needsReview.length} | resolution_errors=${resolution.errors.length} | duration_ms=${durationMs}`);
    console.log(`[Polymarket Sync] cursor=${nextCursor ?? "null"}`);
    console.log(`[Polymarket Sync] skip_reasons=${JSON.stringify(skipSummary)}`);
    return NextResponse.json({ok:true,startedAt,completedAt:new Date().toISOString(),cursor:nextCursor,newestScanned:newestPage.events.length,cursorPageScanned:cursorPage.events.length,fetched:events.length,imported:sync.imported.length,updated:sync.updated.length,skipped:sync.skipped.length,importErrors:sync.importErrors.length,resolutionChecked:true,resolved:resolution.resolved.length,needsReview:resolution.needsReview.length,resolutionErrors:resolution.errors.length,skipReasons:skipSummary});
  } catch(err) {
    const error=err instanceof Error?err.message:"Unknown error";
    console.error(`[Polymarket Sync] ${new Date().toISOString()} | status=FAILED | error=${error}`);
    return NextResponse.json({error:"Polymarket sync failed",details:error,startedAt},{status:500});
  }
}
export async function GET(request:Request){return runSync(request);}
export async function POST(request:Request){return runSync(request);}
