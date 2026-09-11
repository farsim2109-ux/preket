import Link from "next/link";
import type { Event } from "@/lib/types";
import { formatUsd, getDisplayVolume } from "@/lib/types";
import { getMarketPricesFromReserves } from "@/lib/market-math";
import { getCategoryMeta } from "@/lib/market-ui";
import { StatusPill } from "@/components/MarketUI";
import { MarketOdds } from "@/components/MarketOdds";
import { ArrowUpRight, Ban, CheckCircle2, Users } from "lucide-react";

export function EventCard({ event }: { event: Event }) {
  const meta = getCategoryMeta(event.category);
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
    <Link href={`/events/${event.id}`} className="pm-market-card group block min-w-0 overflow-hidden rounded-xl border border-zinc-800/80 bg-[#141414] transition-[transform,border-color,background,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-zinc-600 hover:bg-[#181818] hover:shadow-[0_10px_30px_rgba(0,0,0,.28)]">
      <div className="flex min-h-[118px] gap-3 p-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-2 flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="truncate">{meta.label}</span>
            <span className="text-zinc-700">•</span>
            <span className="truncate">{isActive ? "Live market" : event.status}</span>
            {isActive && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.7)]" />}
          </div>
          <h3 className="line-clamp-3 text-[15px] font-semibold leading-[1.35] tracking-[-0.01em] text-zinc-100 transition-colors group-hover:text-white">{event.title}</h3>
          {event.description && <p className="mt-1 line-clamp-1 text-xs leading-5 text-zinc-500">{event.description}</p>}
        </div>

        {isActive && (
          <div className="flex w-[148px] shrink-0 flex-col justify-center gap-2 sm:w-[178px]">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-600">Yes</div>
                <div className="text-xl font-semibold tabular-nums text-emerald-400">{Math.round(yesProb * 100)}%</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-zinc-600">No</div>
                <div className="text-xl font-semibold tabular-nums text-rose-400">{Math.round(noProb * 100)}%</div>
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-rose-500/70">
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${yesProb * 100}%` }} />
            </div>
            <MarketOdds yesProb={yesProb} noProb={noProb} size="sm" />
          </div>
        )}
      </div>

      {isResolved && (
        <div className={`mx-4 mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 ${event.winning_outcome === "YES" ? "border-emerald-500/20 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5"}`}>
          <CheckCircle2 className={`h-4 w-4 ${event.winning_outcome === "YES" ? "text-emerald-400" : "text-rose-400"}`} />
          <span className="text-xs text-zinc-500">Resolved</span>
          <span className={`text-xs font-semibold ${event.winning_outcome === "YES" ? "text-emerald-400" : "text-rose-400"}`}>{event.winning_outcome} won</span>
        </div>
      )}

      {isCancelled && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
          <Ban className="h-4 w-4 text-zinc-500" />
          <span className="text-xs text-zinc-500">Cancelled · Trading closed</span>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-zinc-800/70 px-4 py-2.5 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5"><Users className="h-3 w-3" />{formatUsd(displayVolume)} Vol.</span>
        <span className="inline-flex items-center gap-1 text-zinc-400 transition-colors group-hover:text-white">Trade <ArrowUpRight className="h-3 w-3" /></span>
      </div>
    </Link>
  );
}
