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
const RESOLUTION_CHECK_INTERVAL_MINUTES = 5;
export const maxDuration = 60;

function checkCronAuth(request: Request): boolean {
  // Primary scheduler: Supabase pg_cron -> pg_net.
  if (request.headers.get("x-preket-supabase-cron") === "true") return true;

  // Keep the existing secret-based path available for manual/operational triggers.
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
        errors.push({
          id: sourceId,
          error: "Matching market not found on Polymarket",
        });
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
      errors.push({
        id: sourceId,
        error: err instanceof Error ? err.message : "Unknown error",
      });
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
  };

  const sourceIds = events.map((event) => event.id);
  const { data: existingRows, error: existingError } = await admin
    .from("events")
    .select(
      "id, source_event_id, source_condition_id, title, description, category",
    )
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
      continue;
    }

    const prices = getBinaryOutcomePrices(market);
    if (!prices) {
      results.skipped.push(event.id);
      continue;
    }

    const existing = existingBySourceId.get(event.id);

    // Existing markets are never re-funded. We only refresh safe metadata so
    // user betting pools and CPMM state remain untouched.
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
      else results.skipped.push(event.id);
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
    return NextResponse.json(
      { error: "Forbidden", startedAt },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  let events;
  try {
    events = await fetchNewTopEvents(TOP_N);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to fetch Polymarket events",
        details: error,
        startedAt,
      },
      { status: 502 },
    );
  }

  try {
    const sync = await syncActiveEvents(admin, events);
    const minute = new Date().getUTCMinutes();
    const shouldResolve = minute % RESOLUTION_CHECK_INTERVAL_MINUTES === 0;

    let resolved: string[] = [];
    let needsReview: string[] = [];
    let resolutionErrors: { id: string; error: string }[] = [];

    if (shouldResolve) {
      const resolution = await resolveRecentlyClosedPolymarketEvents(admin);
      resolved = resolution.resolved;
      needsReview = resolution.needsReview;
      resolutionErrors = resolution.errors;
    }

    const completedAt = new Date().toISOString();
    return NextResponse.json({
      ok: true,
      startedAt,
      completedAt,
      topN: TOP_N,
      imported: sync.imported.length,
      updated: sync.updated.length,
      skipped: sync.skipped.length,
      importErrors: sync.importErrors.length,
      resolutionChecked: shouldResolve,
      resolved: resolved.length,
      needsReview: needsReview.length,
      resolutionErrors: resolutionErrors.length,
      maxInitialLiquidityUsd: MAX_INITIAL_LIQUIDITY_USD,
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
    return NextResponse.json(
      {
        error: "Polymarket sync failed",
        details: err instanceof Error ? err.message : "Unknown error",
        startedAt,
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return runSync(request);
}

export async function POST(request: Request) {
  return runSync(request);
}
