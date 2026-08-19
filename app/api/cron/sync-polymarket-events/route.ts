import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchEventById,
  fetchNewTopEvents,
  getBinaryOutcomePrices,
  mapCategory,
} from "@/lib/polymarket/gamma";

const TOP_N = 100;

function checkCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get("authorization");
  const header = request.headers.get("x-cron-secret");
  const query = new URL(request.url).searchParams.get("secret");
  return authHeader === `Bearer ${secret}` || header === secret || query === secret;
}

async function resolveOpenPolymarketEvents(admin: ReturnType<typeof createAdminClient>) {
  const { data: openEvents, error: fetchError } = await admin
    .from("events")
    .select("id, source_event_id")
    .eq("status", "active")
    .eq("source_platform", "polymarket")
    .not("source_event_id", "is", null);

  if (fetchError) throw new Error(fetchError.message);

  const resolved: string[] = [];
  const stillOpen: string[] = [];
  const needsReview: string[] = [];
  const errors: { id: string; error: string }[] = [];

  // Keep external requests bounded so one daily Hobby cron does not create
  // an unbounded burst against Gamma.
  const CONCURRENCY = 10;
  const rows = openEvents ?? [];

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (row) => {
        const sourceId = row.source_event_id as string;
        try {
          const gammaEvent = await fetchEventById(sourceId);
          if (!gammaEvent || !gammaEvent.markets?.[0]) {
            return { kind: "error" as const, id: sourceId, error: "Not found on Polymarket" };
          }

          const market = gammaEvent.markets[0];
          if (!market.closed) return { kind: "open" as const, id: sourceId };

          const prices = getBinaryOutcomePrices(market);
          if (!prices) return { kind: "review" as const, id: sourceId };

          const isClearYes = prices.yes > 0.9 && prices.no < 0.1;
          const isClearNo = prices.no > 0.9 && prices.yes < 0.1;
          if (!isClearYes && !isClearNo) return { kind: "review" as const, id: sourceId };

          const { error } = await admin.rpc("resolve_external_event", {
            p_source_platform: "polymarket",
            p_source_event_id: sourceId,
            p_winning_outcome: isClearYes ? "YES" : "NO",
          });
          if (error) return { kind: "error" as const, id: sourceId, error: error.message };

          return { kind: "resolved" as const, id: sourceId };
        } catch (err) {
          return {
            kind: "error" as const,
            id: sourceId,
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      }),
    );

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
  if (!checkCronAuth(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  let events;
  try {
    events = await fetchNewTopEvents(TOP_N);
  } catch {
    return NextResponse.json({ error: "Failed to fetch Polymarket events" }, { status: 502 });
  }

  const results = {
    imported: [] as string[],
    skipped: [] as string[],
    importErrors: [] as { id: string; error: string }[],
    resolved: [] as string[],
    stillOpen: [] as string[],
    needsReview: [] as string[],
    resolutionErrors: [] as { id: string; error: string }[],
  };

  // Import only strictly binary Yes/No markets from the current top 100.
  for (const ev of events) {
    if (!ev.markets || ev.markets.length !== 1) {
      results.skipped.push(ev.id);
      continue;
    }

    const market = ev.markets[0];
    const prices = getBinaryOutcomePrices(market);
    if (!prices) {
      results.skipped.push(ev.id);
      continue;
    }

    const volume = Number(ev.volume) || 0;
    const initialLiquidity = Math.round((volume / 10) * 100) / 100;
    if (initialLiquidity < 50) {
      results.skipped.push(ev.id);
      continue;
    }

    try {
      const { data, error } = await admin.rpc("import_external_event", {
        p_source_platform: "polymarket",
        p_source_event_id: ev.id,
        p_source_condition_id: market.conditionId,
        p_title: ev.title,
        p_description: (ev.description || "").slice(0, 2000),
        p_category: mapCategory(ev.category),
        p_yes_price: prices.yes,
        p_no_price: prices.no,
        p_initial_liquidity_usd: initialLiquidity,
      });

      if (error) {
        results.importErrors.push({ id: ev.id, error: error.message });
      } else if (data) {
        results.imported.push(ev.id);
      } else {
        results.skipped.push(ev.id);
      }
    } catch (err) {
      results.importErrors.push({
        id: ev.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Hobby Vercel supports only daily cron scheduling, so the same daily run
  // also checks every currently-open Polymarket event for resolution.
  try {
    const resolution = await resolveOpenPolymarketEvents(admin);
    results.resolved = resolution.resolved;
    results.stillOpen = resolution.stillOpen;
    results.needsReview = resolution.needsReview;
    results.resolutionErrors = resolution.errors;
  } catch (err) {
    results.resolutionErrors.push({
      id: "_job",
      error: err instanceof Error ? err.message : "Resolution check failed",
    });
  }

  return NextResponse.json({ ...results, topN: TOP_N });
}
