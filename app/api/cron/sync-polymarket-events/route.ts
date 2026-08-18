import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchNewTopEvents, mapCategory, getBinaryOutcomePrices } from "@/lib/polymarket/gamma";

const TOP_N = 150;

function checkCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get("authorization");
  const header = request.headers.get("x-cron-secret");
  const query = new URL(request.url).searchParams.get("secret");
  return authHeader === `Bearer ${secret}` || header === secret || query === secret;
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
    errors: [] as { id: string; error: string }[],
  };

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
        results.errors.push({ id: ev.id, error: error.message });
      } else if (data) {
        results.imported.push(ev.id);
      } else {
        results.skipped.push(ev.id);
      }
    } catch (err) {
      results.errors.push({ id: ev.id, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return NextResponse.json(results);
}
