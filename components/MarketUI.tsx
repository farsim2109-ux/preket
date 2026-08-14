import { formatPercent, formatUsd } from "@/lib/types";
import { getMarketPricesFromReserves } from "@/lib/market-math";
import { getCategoryMeta, probToCents } from "@/lib/market-ui";
import type { Event } from "@/lib/types";

export function ProbabilityBar({
  yesProb,
  yesPool,
  noPool,
  size = "md",
}: {
  yesProb: number;
  yesPool: number;
  noPool: number;
  size?: "sm" | "md" | "lg";
}) {
  const noProb = 1 - yesProb;
  const height = size === "sm" ? "h-2" : size === "lg" ? "h-4" : "h-3";

  return (
    <div>
      <div className={`flex overflow-hidden rounded-full ${height} bg-zinc-800/80 ring-1 ring-white/5`}>
        <div
          className="bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-500"
          style={{ width: `${yesProb * 100}%` }}
        />
        <div
          className="bg-gradient-to-r from-rose-500 to-red-400 transition-all duration-500"
          style={{ width: `${noProb * 100}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <span className="font-semibold text-emerald-400">
          Yes {formatPercent(yesProb)} · {probToCents(yesProb)}
        </span>
        <span className="font-semibold text-red-400">
          No {formatPercent(noProb)} · {probToCents(noProb)}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Vol. {formatUsd(yesPool + noPool)} · Yes {formatUsd(yesPool)} · No {formatUsd(noPool)}
      </p>
    </div>
  );
}

export function EventHero({ event }: { event: Event }) {
  const meta = getCategoryMeta(event.category);
  const Icon = meta.icon;
  const isActive = event.status === "active";
  const yesPool = Number(event.total_yes_pool);
  const noPool = Number(event.total_no_pool);
  const cpmmRy = Number(event.cpmm_ry ?? yesPool + 500);
  const cpmmRn = Number(event.cpmm_rn ?? noPool + 500);
  const yesProb = getMarketPricesFromReserves(cpmmRy, cpmmRn).yesProb;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-[var(--card)] ${
        isActive ? meta.border : "border-zinc-700/60"
      }`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${isActive ? meta.gradient : "from-zinc-800/50 to-transparent"}`} />
      {!isActive && <div className="absolute inset-0 bg-zinc-950/30" />}
      <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
      <div className="relative p-6 md:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
              isActive ? `${meta.border} ${meta.bg} ${meta.accent}` : "border-zinc-600 bg-zinc-800 text-zinc-400"
            }`}
          >
            <span>{meta.emoji}</span>
            <Icon className="h-3.5 w-3.5" />
            {meta.label}
          </span>
          <StatusPill status={event.status} />
          {isActive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Live
            </span>
          )}
        </div>
        <h1 className="text-2xl md:text-4xl font-bold leading-tight text-white mb-3">{event.title}</h1>
        <p className="text-zinc-400 max-w-2xl leading-relaxed">{event.description}</p>
        {isActive ? (
          <div className="mt-6 max-w-xl">
            <ProbabilityBar
              yesProb={yesProb}
              yesPool={Number(event.total_yes_pool)}
              noPool={Number(event.total_no_pool)}
              size="lg"
            />
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-zinc-700/50 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-400">
            {event.status === "cancelled"
              ? "This market was cancelled. All bets have been refunded. Trading is closed."
              : `Market resolved — ${event.winning_outcome} won. Trading is closed.`}
          </div>
        )}
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    resolved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    cancelled: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  };
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${styles[status] ?? styles.active}`}>
      {status}
    </span>
  );
}
