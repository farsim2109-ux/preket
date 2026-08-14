"use client";

import { probToCents } from "@/lib/market-ui";
import { formatPercent } from "@/lib/types";

/** Shared Yes/No odds display — same everywhere (cards, live odds, bet form). */
export function MarketOdds({
  yesProb,
  noProb,
  size = "md",
  selected,
  onSelect,
}: {
  yesProb: number;
  noProb: number;
  size?: "sm" | "md" | "lg";
  selected?: "YES" | "NO";
  onSelect?: (o: "YES" | "NO") => void;
}) {
  const interactive = !!onSelect;
  const textSize = size === "lg" ? "text-3xl" : size === "sm" ? "text-xl" : "text-2xl";
  const pad = size === "lg" ? "p-4" : "p-3";

  const yesClass = interactive
    ? selected === "YES"
      ? "border-emerald-400 bg-emerald-500/20 shadow-lg shadow-emerald-500/20"
      : "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-400 hover:bg-emerald-500/15 cursor-pointer"
    : "border-emerald-500/30 bg-emerald-500/10";

  const noClass = interactive
    ? selected === "NO"
      ? "border-red-400 bg-red-500/20 shadow-lg shadow-red-500/20"
      : "border-red-500/30 bg-red-500/5 hover:border-red-400 hover:bg-red-500/15 cursor-pointer"
    : "border-red-500/30 bg-red-500/10";

  const Wrapper = ({ side, className, children }: {
    side: "YES" | "NO";
    className: string;
    children: React.ReactNode;
  }) =>
    interactive ? (
      <button type="button" onClick={() => onSelect!(side)} className={`rounded-xl border-2 text-left transition-all ${pad} ${className}`}>
        {children}
      </button>
    ) : (
      <div className={`rounded-xl border-2 ${pad} ${className}`}>{children}</div>
    );

  return (
    <div className="grid grid-cols-2 gap-3">
      <Wrapper side="YES" className={yesClass}>
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-300/80">Yes</p>
        <p className={`${textSize} font-black text-emerald-400`}>{probToCents(yesProb)}</p>
        <p className="text-sm text-emerald-300/70">{formatPercent(yesProb)} chance</p>
      </Wrapper>
      <Wrapper side="NO" className={noClass}>
        <p className="text-xs font-bold uppercase tracking-wider text-red-300/80">No</p>
        <p className={`${textSize} font-black text-red-400`}>{probToCents(noProb)}</p>
        <p className="text-sm text-red-300/70">{formatPercent(noProb)} chance</p>
      </Wrapper>
    </div>
  );
}
