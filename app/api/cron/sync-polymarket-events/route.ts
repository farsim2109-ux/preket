import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchNewTopEvents,
  fetchRecentlyClosedEvents,
  getBinaryOutcomePrices,
  mapCategory,
} from "@/lib/polymarket/gamma";

const TOP_N = 100;
const MAX_INITIAL_LIQUIDITY_USD = 500;
const MIN_INITIAL_LIQUIDITY_USD = 50;
// Resolution is intentionally checked on every scheduler invocation.
// The primary scheduler runs once per minute.
const RESOLUTION_CHECK_INTERVAL_MINUTES = 1;
export const maxDuration = 60;

function checkCronAuth(request: Request): boolean {
  if (request.headers.get("x-preket-supabase-cron") === "true") return true;
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  const header = request.headers.get("x-cron-secret");
  const query = new URL(request.url).searchParams.get("secret");
  return Boolean(
    secret &&
      (authHeader === `Bearer ${secret}` || header === secret || query === secret),
  );
}

type GammaMarketLike = Parameters<typeof getBinaryOutcomePrices>[0];

function selectBinaryMarket(markets: GammaMarketLike[]) {
  const binary = markets.filter((market) => getBinaryOutcomePrices(market));
  return (
    binary.sort((a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0))[0] ??
    null
  );
}

async function resolveRecentlyClosedPolymarketEvents(
  admin: ReturnType<typeof createAdminClient>,
) {
  const { data: openEvents, error: fetchError } = await admin
    .from("events")
    .select("id, source_event_id, source_condition_id")
    .eq("status", "active")
    .eq("source_platform", "polymarket")
    .not("source_event_id", "is", null);

  if (fetchError) throw new Error(fetchError.message);

  const rows = openEvents ?? [];
  const openBySourceId = new Map(
    rows.map((row) => [
      row.source_event_id as string,
      row.source_condition_id as string | null,
    ]),
  );
  const resolved: string[] = [];
  const needsReview: string[] = [];
  const errors: { id: string; error: string }[] = [];

  const closedEvents = await fetchRecentlyClosedEvents(TOP_N);

  for (const gammaEvent of closedEvents) {
    const sourceId = gammaEvent.id;
    const sourceConditionId = openBySourceId.get(sourceId);
    if (!openBySourceId.has(sourceId)) continue;

    try {
      const market = sourceConditionId
        ? gammaEvent.markets?.find(
            (item) => item.conditionId === sourceConditionId,
          )
        : selectBinaryMarket(gammaEvent.markets ?? []);

      if (!market) {
        errors.push({ id: sourceId, error: "Matching market not found on Polymarket" });
        continue;
      }

      const prices = getBinaryOutcomePrices(market);
      if (!prices) {
        needsReview.push(sourceId);
        continue;
      }

      const isClearYes = prices.yes > 0.9 && prices.no < 0.1;
      const isClearNo = prices.no > 0.9 && prices.yes < 0.1;
      if (!isClearYes && !isClearNo) {
        needsReview.push(sourceId);
        continue;
      }

      const { error } = await admin.rpc("resolve_external_event", {
        p_source_platform: "polymarket",
        p_source_event_id: sourceId,
        p_winning_outcome: isClearYes ? "YES" : "NO",
      });

      if (error) errors.push({ id: sourceId, error: error.message });
      else resolved.push(sourceId);
    } catch (err) {
      errors.push({ id: sourceId, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return { resolved, needsReview, errors };
}

async function syncActiveEvents(
  admin: ReturnType<typeof createAdminClient>,
  events: Awaited<ReturnType<typeof fetchNewTopEvents>>,
) {
  const results = {
    imported: [] as string[],
    updated: [] as string[],
    skipped: [] as string[],
    importErrors: [] as { id: string; error: string }[],
    skipReasons: {
      noBinaryMarket: [] as string[],
      noPrices: [] as string[],
      unchangedExisting: [] as string[],
      rpcReturnedFalse: [] as string[],
    },
  };

  const sourceIds = events.map((event) => event.id);
  const { data: existingRows, error: existingError } = await admin
    .from("events")
    .select("id, source_event_id, source_condition_id, title, description, category")
    .eq("source_platform", "polymarket")
    .in("source_event_id", sourceIds);

  if (existingError) throw new Error(existingError.message);

  const existingBySourceId = new Map(
    (existingRows ?? []).map((row) => [row.source_event_id as string, row]),
  );

  for (const event of events) {
    const market = selectBinaryMarket(event.markets ?? []);
    if (!market) {
      results.skipped.push(event.id);
      results.skipReasons.noBinaryMarket.push(event.id);
      continue;
    }

    const prices = getBinaryOutcomePrices(market);
    if (!prices) {
      results.skipped.push(event.id);
      results.skipReasons.noPrices.push(event.id);
      continue;
    }

    const existing = existingBySourceId.get(event.id);

    if (existing) {
      const nextTitle = market.question || event.title;
      const nextDescription = (event.description || "").slice(0, 2000);
      const nextCategory = mapCategory(event.category);
      const nextConditionId = market.conditionId;

      const changed =
        existing.title !== nextTitle ||
        existing.description !== nextDescription ||
        existing.category !== nextCategory ||
        existing.source_condition_id !== nextConditionId;

      if (!changed) {
        results.skipped.push(event.id);
        results.skipReasons.unchangedExisting.push(event.id);
        continue;
      }

      const { error } = await admin
        .from("events")
        .update({
          title: nextTitle,
          description: nextDescription,
          category: nextCategory,
          source_condition_id: nextConditionId,
        })
        .eq("id", existing.id);

      if (error) results.importErrors.push({ id: event.id, error: error.message });
      else results.updated.push(event.id);
      continue;
    }

    const volume = Number(market.volume) || Number(event.volume) || 0;
    const volumeBasedLiquidity = Math.round((volume / 10) * 100) / 100;
    const initialLiquidity = Math.min(
      Math.max(volumeBasedLiquidity, MIN_INITIAL_LIQUIDITY_USD),
      MAX_INITIAL_LIQUIDITY_USD,
    );

    try {
      const { data, error } = await admin.rpc("import_external_event", {
        p_source_platform: "polymarket",
        p_source_event_id: event.id,
        p_source_condition_id: market.conditionId,
        p_title: market.question || event.title,
        p_description: (event.description || "").slice(0, 2000),
        p_category: mapCategory(event.category),
        p_yes_price: prices.yes,
        p_no_price: prices.no,
        p_initial_liquidity_usd: initialLiquidity,
      });

      if (error) results.importErrors.push({ id: event.id, error: error.message });
      else if (data) results.imported.push(event.id);
      else {
        results.skipped.push(event.id);
        results.skipReasons.rpcReturnedFalse.push(event.id);
      }
    } catch (err) {
      results.importErrors.push({
        id: event.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return results;
}

async function runSync(request: Request) {
  const startedAt = new Date().toISOString();
  if (!checkCronAuth(request)) {
    return NextResponse.json({ error: "Forbidden", startedAt }, { status: 403 });
  }

  const admin = createAdminClient();
  let events;
  try {
    events = await fetchNewTopEvents(TOP_N);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Polymarket Sync] ${startedAt} | FETCH_FAILED | error=${error}`);
    return NextResponse.json({ error: "Failed to fetch Polymarket events", details: error, startedAt }, { status: 502 });
  }

  try {
    const sync = await syncActiveEvents(admin, events);
    const resolution = await resolveRecentlyClosedPolymarketEvents(admin);
    const resolved = resolution.resolved;
    const needsReview = resolution.needsReview;
    const resolutionErrors = resolution.errors;

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(startedAt).getTime();
    const skipSummary = Object.fromEntries(
      Object.entries(sync.skipReasons).map(([key, ids]) => [key, ids.length]),
    );

    console.log(
      `[Polymarket Sync] ${completedAt} | status=OK | fetched=${events.length} | imported=${sync.imported.length} | updated=${sync.updated.length} | skipped=${sync.skipped.length} | import_errors=${sync.importErrors.length} | resolved=${resolved.length} | needs_review=${needsReview.length} | resolution_errors=${resolutionErrors.length} | duration_ms=${durationMs}`,
    );
    console.log(`[Polymarket Sync] skip_reasons=${JSON.stringify(skipSummary)}`);

    if (sync.imported.length) console.log(`[Polymarket Sync] imported_ids=${sync.imported.join(",")}`);
    if (sync.updated.length) console.log(`[Polymarket Sync] updated_ids=${sync.updated.join(",")}`);
    if (resolved.length) console.log(`[Polymarket Sync] resolved_ids=${resolved.join(",")}`);
    if (sync.importErrors.length) console.error(`[Polymarket Sync] import_errors=${JSON.stringify(sync.importErrors)}`);
    if (resolutionErrors.length) console.error(`[Polymarket Sync] resolution_errors=${JSON.stringify(resolutionErrors)}`);

    return NextResponse.json({
      ok: true,
      startedAt,
      completedAt,
      topN: TOP_N,
      imported: sync.imported.length,
      updated: sync.updated.length,
      skipped: sync.skipped.length,
      importErrors: sync.importErrors.length,
      resolutionChecked: true,
      resolved: resolved.length,
      needsReview: needsReview.length,
      resolutionErrors: resolutionErrors.length,
      maxInitialLiquidityUsd: MAX_INITIAL_LIQUIDITY_USD,
      skipReasons: skipSummary,
      results: {
        imported: sync.imported,
        updated: sync.updated,
        skipped: sync.skipped,
        importErrors: sync.importErrors,
        resolved,
        needsReview,
        resolutionErrors,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - new Date(startedAt).getTime();
    console.error(`[Polymarket Sync] ${new Date().toISOString()} | status=FAILED | duration_ms=${durationMs} | error=${error}`);
    return NextResponse.json({ error: "Polymarket sync failed", details: error, startedAt }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runSync(request);
}

export async function POST(request: Request) {
  return runSync(request);
}
