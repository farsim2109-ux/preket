import Link from "next/link";
import type { Event } from "@/lib/types";
import { formatUsd, formatPercent, getDisplayVolume } from "@/lib/types";
import { getMarketPricesFromReserves } from "@/lib/market-math";
import { getCategoryMeta } from "@/lib/market-ui";
import { StatusPill } from "@/components/MarketUI";
import { ArrowUpRight, Ban, CheckCircle2, Clock3, Users } from "lucide-react";

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
  const displayVolume = getDisplayVolume(event.polymarket_source_volume_usd, event.source_event_id ?? event.id);

  return (
    <Link href={`/events/${event.id}`} className="group block min-w-0 overflow-hidden rounded-xl border border-zinc-800 bg-[var(--card)] transition duration-200 hover:border-zinc-700 hover:bg-[#17171f] hover:shadow-lg hover:shadow-black/20">
      <div className="p-4 sm:p-[18px]">
        <div className="mb-3 flex items-start gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${meta.bg} ${meta.border}`}>
            <span className="text-base leading-none">{meta.emoji}</span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
              <Icon className="h-3 w-3" />{meta.label}
              {isActive && <span className="ml-1 inline-flex items-center gap-1 text-emerald-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Live</span>}
            </div>
            <h3 className="line-clamp-2 text-[14px] font-semibold leading-[1.35] text-zinc-100 transition-colors group-hover:text-white">{event.title}</h3>
          </div>
          {isResolved || isCancelled ? <StatusPill status={event.status} /> : <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-700 transition group-hover:text-zinc-400" />}
        </div>

        {isActive ? (
          <>
            <div className="mb-3 h-1 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-emerald-500" style={{ width: `${yesProb * 100}%` }} /><div className="hidden" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-emerald-500/[0.08] px-3 py-2.5 transition group-hover:bg-emerald-500/[0.12]">
                <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-medium text-zinc-500">Yes</span><span className="text-[15px] font-bold tabular-nums text-emerald-400">{formatPercent(yesProb)}</span></div>
              </div>
              <div className="rounded-lg bg-rose-500/[0.07] px-3 py-2.5 transition group-hover:bg-rose-500/[0.11]">
                <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-medium text-zinc-500">No</span><span className="text-[15px] font-bold tabular-nums text-rose-400">{formatPercent(noProb)}</span></div>
              </div>
            </div>
          </>
        ) : isResolved ? (
          <div className={`mb-3 flex items-center gap-2 rounded-lg border px-3 py-2.5 ${event.winning_outcome === "YES" ? "border-emerald-500/20 bg-emerald-500/[0.06]" : "border-rose-500/20 bg-rose-500/[0.06]"}`}>
            <CheckCircle2 className={`h-4 w-4 shrink-0 ${event.winning_outcome === "YES" ? "text-emerald-400" : "text-rose-400"}`} />
            <div><p className="text-[10px] uppercase tracking-wide text-zinc-600">Resolved</p><p className={`text-xs font-bold ${event.winning_outcome === "YES" ? "text-emerald-400" : "text-rose-400"}`}>{event.winning_outcome} won</p></div>
          </div>
        ) : (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5"><Ban className="h-4 w-4 text-zinc-600" /><span className="text-xs text-zinc-500">Trading closed · bets refunded</span></div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-zinc-800/70 pt-3 text-[11px] text-zinc-600">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate"><Users className="h-3.5 w-3.5 shrink-0" />Vol. {formatUsd(displayVolume)}</span>
          <span className="inline-flex shrink-0 items-center gap-1">{isActive ? <><Clock3 className="h-3 w-3" /> Trade</> : "View market"}</span>
        </div>
      </div>
    </Link>
  );
}
