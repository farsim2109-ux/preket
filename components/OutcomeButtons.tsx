"use client";

import { formatPercent } from "@/lib/types";
import { probToCents } from "@/lib/market-ui";

export function OutcomeButtons({
  yesProb,
  noProb,
  selected,
  onSelect,
  disabled,
}: {
  yesProb: number;
  noProb: number;
  selected?: "YES" | "NO";
  onSelect?: (o: "YES" | "NO") => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect?.("YES")}
        className={`group relative overflow-hidden rounded-xl border-2 p-4 text-left transition-all ${
          selected === "YES"
            ? "border-emerald-400 bg-emerald-500/20 shadow-lg shadow-emerald-500/20"
            : "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-400 hover:bg-emerald-500/15"
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-300/80">Yes</p>
        <p className="text-3xl font-black text-emerald-400">{probToCents(yesProb)}</p>
        <p className="text-sm text-emerald-300/70">{formatPercent(yesProb)} chance</p>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect?.("NO")}
        className={`group relative overflow-hidden rounded-xl border-2 p-4 text-left transition-all ${
          selected === "NO"
            ? "border-red-400 bg-red-500/20 shadow-lg shadow-red-500/20"
            : "border-red-500/30 bg-red-500/5 hover:border-red-400 hover:bg-red-500/15"
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-red-400/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <p className="text-xs font-bold uppercase tracking-wider text-red-300/80">No</p>
        <p className="text-3xl font-black text-red-400">{probToCents(noProb)}</p>
        <p className="text-sm text-red-300/70">{formatPercent(noProb)} chance</p>
      </button>
    </div>
  );
}
