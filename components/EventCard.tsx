import Link from "next/link";
import type { Event } from "@/lib/types";
import { formatUsd } from "@/lib/types";
import { getMarketPricesFromReserves, realVolume } from "@/lib/market-math";
import { getCategoryMeta } from "@/lib/market-ui";
import { StatusPill } from "@/components/MarketUI";
import { MarketOdds } from "@/components/MarketOdds";
import { ArrowRight, Ban, CheckCircle2, Users } from "lucide-react";

export function EventCard({ event }: { event: Event }) {
  const meta = getCategoryMeta(event.category);
  const Icon = meta.icon;
  const isActive = event.status === "active";
  const isResolved = event.status === "resolved";
  const isCancelled = event.status === "cancelled";

  const yesPool = Number(event.total_yes_pool);
  const noPool = Number(event.total_no_pool);
  const cpmmRy = Number(event.cpmm_ry ?? yesPool + 500);
  const cpmmRn = Number(event.cpmm_rn ?? noPool + 500);
  const { yesProb, noProb } = getMarketPricesFromReserves(cpmmRy, cpmmRn);
  const totalPool = realVolume(yesPool, noPool);

  return (
    <Link
      href={`/events/${event.id}`}
      className={`group block overflow-hidden rounded-2xl border bg-[var(--card)] transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40 ${
        isActive ? meta.border : "border-zinc-700/60 opacity-80 hover:opacity-100"
      }`}
    >
      {/* Category banner */}
      <div
        className={`relative h-20 border-b ${
          isActive
            ? `bg-gradient-to-br ${meta.gradient} ${meta.border}`
            : "bg-zinc-900/80 border-zinc-700/50"
        }`}
      >
        {!isActive && <div className="absolute inset-0 bg-zinc-950/40 z-10" />}
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] bg-[length:24px_24px]" />
        <div className="relative z-20 flex h-full items-center justify-between px-4">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold backdrop-blur-sm ${
              isActive ? `${meta.border} ${meta.bg} ${meta.accent}` : "border-zinc-600 bg-zinc-800 text-zinc-400"
            }`}
          >
            <span className="text-base">{meta.emoji}</span>
            <Icon className="h-3.5 w-3.5" />
            {meta.label}
          </span>
          <StatusPill status={event.status} />
        </div>
      </div>

      <div className="p-5">
        <h3
          className={`font-bold text-lg leading-snug line-clamp-2 mb-2 transition-colors ${
            isActive ? "group-hover:text-white" : "text-zinc-400"
          }`}
        >
          {event.title}
        </h3>
        <p className="text-sm text-zinc-500 line-clamp-2 mb-4">{event.description}</p>

        {/* Active: show live odds */}
        {isActive && (
          <>
            <div className="flex h-2.5 overflow-hidden rounded-full mb-3 ring-1 ring-white/5">
              <div className="bg-gradient-to-r from-emerald-500 to-green-400" style={{ width: `${yesProb * 100}%` }} />
              <div className="bg-gradient-to-r from-rose-500 to-red-400" style={{ width: `${noProb * 100}%` }} />
            </div>
            <div className="mb-4">
              <MarketOdds yesProb={yesProb} noProb={noProb} size="sm" />
            </div>
          </>
        )}

        {/* Resolved: show winner */}
        {isResolved && (
          <div
            className={`rounded-xl border p-4 mb-4 flex items-center gap-3 ${
              event.winning_outcome === "YES"
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-red-500/30 bg-red-500/10"
            }`}
          >
            <CheckCircle2
              className={`h-5 w-5 shrink-0 ${event.winning_outcome === "YES" ? "text-emerald-400" : "text-red-400"}`}
            />
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Resolved</p>
              <p
                className={`font-bold ${event.winning_outcome === "YES" ? "text-emerald-400" : "text-red-400"}`}
              >
                {event.winning_outcome} won
              </p>
            </div>
          </div>
        )}

        {/* Cancelled: show notice */}
        {isCancelled && (
          <div className="rounded-xl border border-zinc-600/50 bg-zinc-800/50 p-4 mb-4 flex items-center gap-3">
            <Ban className="h-5 w-5 text-zinc-500 shrink-0" />
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Cancelled</p>
              <p className="text-sm text-zinc-400">All bets refunded · Trading closed</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            Vol. {formatUsd(totalPool)}
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-blue-400 group-hover:gap-2 transition-all">
            {isActive ? "Trade" : "View"} <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
