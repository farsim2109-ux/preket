import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchEventById, getBinaryOutcomePrices } from "@/lib/polymarket/gamma";

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

  const { data: openEvents, error: fetchError } = await admin
    .from("events")
    .select("id, source_event_id")
    .eq("status", "active")
    .eq("source_platform", "polymarket")
    .not("source_event_id", "is", null);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const results = {
    resolved: [] as string[],
    stillOpen: [] as string[],
    needsReview: [] as string[],
    errors: [] as { id: string; error: string }[],
  };

  for (const row of openEvents ?? []) {
    const sourceId = row.source_event_id as string;
    let gammaEvent;
    try {
      gammaEvent = await fetchEventById(sourceId);
    } catch {
      results.errors.push({ id: sourceId, error: "Fetch failed" });
      continue;
    }
    if (!gammaEvent || !gammaEvent.markets?.[0]) {
      results.errors.push({ id: sourceId, error: "Not found on Polymarket" });
      continue;
    }
    const market = gammaEvent.markets[0];
    if (!market.closed) {
      results.stillOpen.push(sourceId);
      continue;
    }
    const prices = getBinaryOutcomePrices(market);
    if (!prices) {
      results.needsReview.push(sourceId);
      continue;
    }
    const isClearYes = prices.yes > 0.9 && prices.no < 0.1;
    const isClearNo = prices.no > 0.9 && prices.yes < 0.1;

    if (!isClearYes && !isClearNo) {
      results.needsReview.push(sourceId);
      continue;
    }

    try {
      const { error } = await admin.rpc("resolve_external_event", {
        p_source_platform: "polymarket",
        p_source_event_id: sourceId,
        p_winning_outcome: isClearYes ? "YES" : "NO",
      });
      if (error) {
        results.errors.push({ id: sourceId, error: error.message });
      } else {
        results.resolved.push(sourceId);
      }
    } catch (err) {
      results.errors.push({ id: sourceId, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return NextResponse.json(results);
}
