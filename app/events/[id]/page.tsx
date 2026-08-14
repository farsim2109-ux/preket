import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncAndGetProfile } from "@/lib/get-profile";
import { formatUsd } from "@/lib/types";
import { getMarketPricesFromReserves, realVolume, avgCpmmPerPmFromTrades, normalizeReserves, cpmmIsHealthy } from "@/lib/market-math";
import { netPositions } from "@/lib/positions";
import { BetForm } from "@/components/BetForm";
import { EventHero } from "@/components/MarketUI";
import { OutcomeDisplay } from "@/components/OutcomeDisplay";
import { getCategoryMeta } from "@/lib/market-ui";
import { ArrowLeft, Clock, DollarSign, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase.from("events").select("*").eq("id", id).single();
  if (!event) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let balance = 0;
  let yesShares = 0;
  let noShares = 0;
  let yesCpmmPerPm = 1;
  let noCpmmPerPm = 1;
  if (user?.email) {
    const profile = await syncAndGetProfile({ id: user.id, email: user.email });
    balance = Number(profile?.balance_usd ?? 0);

    const { data: trades } = await supabase
      .from("bets")
      .select("outcome, trade_type, shares, amount_usd, entry_price, cpmm_per_pm")
      .eq("event_id", id)
      .eq("user_id", user.id)
      .eq("status", "active");

    const positions = netPositions(trades ?? []);
    yesShares = positions.yes;
    noShares = positions.no;

    const cpmmRyNow = Number(event.cpmm_ry ?? 500);
    const cpmmRnNow = Number(event.cpmm_rn ?? 500);
    const yesTrades = (trades ?? []).filter((t) => t.outcome === "YES");
    const noTrades = (trades ?? []).filter((t) => t.outcome === "NO");
    yesCpmmPerPm = avgCpmmPerPmFromTrades(yesTrades, "YES", cpmmRyNow, cpmmRnNow);
    noCpmmPerPm = avgCpmmPerPmFromTrades(noTrades, "NO", cpmmRyNow, cpmmRnNow);
  }

  const yesPool = Number(event.total_yes_pool);
  const noPool = Number(event.total_no_pool);
  const cpmmRyRaw = Number(event.cpmm_ry ?? yesPool + 500);
  const cpmmRnRaw = Number(event.cpmm_rn ?? noPool + 500);
  const reservesHealthy = cpmmIsHealthy(cpmmRyRaw, cpmmRnRaw);
  const { ry: cpmmRy, rn: cpmmRn } = normalizeReserves(cpmmRyRaw, cpmmRnRaw);
  const { yesProb, noProb } = getMarketPricesFromReserves(cpmmRy, cpmmRn);
  const totalPool = realVolume(yesPool, noPool);
  const meta = getCategoryMeta(event.category);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <Link
          href="/events"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Markets
        </Link>

        <EventHero event={event} />

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 my-6">
          <StatCard icon={<DollarSign className="h-4 w-4 text-emerald-400" />} label="Total Volume" value={formatUsd(totalPool)} />
          <StatCard icon={<span className="text-sm">{meta.emoji}</span>} label="Category" value={meta.label} />
          <StatCard icon={<Clock className="h-4 w-4 text-blue-400" />} label="Status" value={event.status} capitalize />
        </div>

        {event.status === "resolved" && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 mb-6 flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-emerald-400 shrink-0" />
            <div>
              <p className="font-semibold text-emerald-300">Market Resolved</p>
              <p className="text-sm text-emerald-400/80">
                Winning outcome: <strong className="text-white">{event.winning_outcome}</strong>
              </p>
            </div>
          </div>
        )}

        {event.status === "cancelled" && (
          <div className="rounded-xl border border-zinc-600 bg-zinc-800/50 p-5 mb-6">
            <p className="font-semibold text-zinc-300">Market Cancelled</p>
            <p className="text-sm text-zinc-500">All bets have been refunded.</p>
          </div>
        )}

        {event.status === "active" && !reservesHealthy && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 mb-6 text-sm text-amber-200">
            Market liquidity was reset — quotes use default depth until your next trade syncs reserves.
          </div>
        )}

        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {event.status === "active" && (
              <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Live Odds</h2>
                <OutcomeDisplay yesProb={yesProb} noProb={noProb} />
              </div>
            )}

            <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                {event.status === "active" ? "Pool Breakdown" : "Final Pool"}
              </h2>
              <PoolRow label="Yes pool" amount={yesPool} color="text-emerald-400" barColor="bg-emerald-500" pct={totalPool > 0 ? yesPool / totalPool : 0.5} />
              <PoolRow label="No pool" amount={noPool} color="text-red-400" barColor="bg-red-500" pct={totalPool > 0 ? noPool / totalPool : 0.5} />
            </div>
          </div>

          <div className="lg:col-span-3">
            {event.status === "active" ? (
              user ? (
                <BetForm
                  eventId={event.id}
                  balance={balance}
                  yesPool={yesPool}
                  noPool={noPool}
                  cpmmRy={cpmmRy}
                  cpmmRn={cpmmRn}
                  yesCpmmPerPm={yesCpmmPerPm}
                  noCpmmPerPm={noCpmmPerPm}
                  yesShares={yesShares}
                  noShares={noShares}
                />
              ) : (
                <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/50 to-[var(--card)] p-8 text-center">
                  <p className="text-4xl mb-3">🔐</p>
                  <p className="text-lg font-semibold mb-2">Sign in to trade</p>
                  <p className="text-zinc-500 text-sm mb-6">Create a free account to place bets on this market</p>
                  <div className="flex gap-3 justify-center">
                    <Link href="/auth/login" className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors">
                      Log in
                    </Link>
                    <Link href="/auth/signup" className="px-6 py-2.5 rounded-xl border border-zinc-600 hover:border-zinc-400 text-white font-medium transition-colors">
                      Sign up
                    </Link>
                  </div>
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, capitalize: cap }: { icon: React.ReactNode; label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
      <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">{icon}{label}</div>
      <p className={`font-bold text-white ${cap ? "capitalize" : ""}`}>{value}</p>
    </div>
  );
}

function PoolRow({ label, amount, color, barColor, pct }: { label: string; amount: number; color: string; barColor: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className={color}>{label}</span>
        <span className="text-zinc-400">{formatUsd(amount)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
