import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { syncAndGetProfile } from "@/lib/get-profile";
import { redirect } from "next/navigation";
import { PortfolioDashboard } from "@/components/PortfolioDashboard";
import {
  buildHistory,
  buildPositions,
  summarizePortfolio,
  type PortfolioBet,
} from "@/lib/portfolio";
import { User } from "lucide-react";
import { MarketingTrustStrip } from "@/components/MarketingTrust";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const profile = await syncAndGetProfile({ id: user.id, email: user.email ?? undefined });

  const { data: bets } = await supabase
    .from("bets")
    .select(
      "id, event_id, outcome, amount_usd, entry_price, shares, trade_type, fee_usd, cpmm_per_pm, status, created_at, events(id, title, status, category, total_yes_pool, total_no_pool, cpmm_ry, cpmm_rn)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const portfolioBets: PortfolioBet[] = (bets ?? []).map((bet) => {
    const ev = bet.events;
    const event = Array.isArray(ev) ? ev[0] : ev;
    return { ...bet, events: event } as PortfolioBet;
  });
  const positions = buildPositions(portfolioBets);
  const history = buildHistory(portfolioBets);
  const cash = Number(profile?.balance_usd ?? 0);
  const summary = summarizePortfolio(cash, positions);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Portfolio</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {profile?.display_name || profile?.username
              ? `@${profile.username ?? profile.display_name}`
              : user.email}
          </p>
        </div>
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-2 text-sm hover:border-zinc-500 transition-colors"
        >
          <User className="h-4 w-4" />
          Edit profile
        </Link>
      </div>

      <MarketingTrustStrip className="mb-8" />

      <PortfolioDashboard summary={summary} positions={positions} history={history} />
    </div>
  );
}
