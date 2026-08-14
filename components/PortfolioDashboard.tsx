"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatUsd } from "@/lib/types";
import { probToCents, getCategoryMeta } from "@/lib/market-ui";
import type { HistoryRow, PortfolioSummary, PositionRow } from "@/lib/portfolio";
import { cn } from "@/lib/utils";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

type Tab = "positions" | "history";

interface PortfolioDashboardProps {
  summary: PortfolioSummary;
  positions: PositionRow[];
  history: HistoryRow[];
}

function formatShares(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PnlBadge({ value, pct }: { value: number; pct?: number }) {
  const up = value >= 0;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-medium", up ? "text-emerald-400" : "text-red-400")}>
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {formatUsd(Math.abs(value))}
      {pct !== undefined && (
        <span className="text-xs opacity-80">
          ({up ? "+" : ""}
          {pct.toFixed(1)}%)
        </span>
      )}
    </span>
  );
}

export function PortfolioDashboard({ summary, positions, history }: PortfolioDashboardProps) {
  const [tab, setTab] = useState<Tab>("positions");
  const [query, setQuery] = useState("");

  const filteredPositions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return positions;
    return positions.filter((p) => p.title.toLowerCase().includes(q));
  }, [positions, query]);

  const filteredHistory = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history;
    return history.filter((h) => h.title.toLowerCase().includes(q));
  }, [history, query]);

  return (
    <div className="space-y-6">
      {/* Portfolio header — Polymarket style */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-500 mb-1">Portfolio</p>
              <p className="text-4xl font-bold tracking-tight">{formatUsd(summary.totalValue)}</p>
              <p className="text-sm text-zinc-500 mt-2">
                Cash {formatUsd(summary.cash)} · Positions {formatUsd(summary.positionsValue)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500 mb-1">Available to trade</p>
              <p className="text-lg font-semibold">{formatUsd(summary.cash)}</p>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <Link
              href="/deposit"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
            >
              <ArrowDownLeft className="h-4 w-4" />
              Deposit
            </Link>
            <Link
              href="/withdraw"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 hover:border-zinc-500 px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              <ArrowUpRight className="h-4 w-4" />
              Withdraw
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6">
          <p className="text-sm text-zinc-500 mb-1">Profit / Loss</p>
          <p className="text-2xl font-bold mb-2">
            {summary.unrealizedPnl >= 0 ? "+" : "−"}
            {formatUsd(Math.abs(summary.unrealizedPnl))}
          </p>
          <PnlBadge value={summary.unrealizedPnl} pct={summary.unrealizedPnlPct} />
          <p className="text-xs text-zinc-600 mt-4">Unrealized on open positions</p>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-[var(--card-border)]">
          <div className="flex gap-1">
            {(
              [
                ["positions", "Positions"],
                ["history", "History"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                  tab === id ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-white"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search markets"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {tab === "positions" ? (
          filteredPositions.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 text-sm">
              No open positions.{" "}
              <Link href="/events" className="text-blue-400 hover:underline">
                Browse markets
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500 border-b border-[var(--card-border)]">
                    <th className="px-4 py-3 font-medium min-w-[220px]">Market</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Avg → Now</th>
                    <th className="px-4 py-3 font-medium text-right">Traded</th>
                    <th className="px-4 py-3 font-medium text-right">To win</th>
                    <th className="px-4 py-3 font-medium text-right">Value</th>
                    <th className="px-4 py-3 font-medium text-right">P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPositions.map((p) => {
                    const meta = getCategoryMeta(p.category);
                    const Icon = meta.icon;
                    const priceUp = p.currentPrice >= p.avgPrice;

                    return (
                      <tr
                        key={p.key}
                        className="border-b border-[var(--card-border)]/60 hover:bg-zinc-900/40 transition-colors"
                      >
                        <td className="px-4 py-4">
                          <Link href={`/events/${p.eventId}`} className="flex items-start gap-3 group">
                            <div
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                                meta.border,
                                meta.bg
                              )}
                            >
                              <Icon className={cn("h-4 w-4", meta.accent)} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-white group-hover:text-blue-400 transition-colors line-clamp-2">
                                {p.title}
                              </p>
                              <p className="text-xs mt-0.5">
                                <span
                                  className={cn(
                                    "font-bold",
                                    p.outcome === "YES" ? "text-emerald-400" : "text-red-400"
                                  )}
                                >
                                  {p.outcome}
                                </span>
                                <span className="text-zinc-600 mx-1.5">·</span>
                                <span className="text-zinc-500">{formatShares(p.shares)} shares</span>
                              </p>
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="text-zinc-400">{probToCents(p.avgPrice)}</span>
                          <span className="text-zinc-600 mx-1.5">→</span>
                          <span className={cn("font-semibold", priceUp ? "text-emerald-400" : "text-red-400")}>
                            {probToCents(p.currentPrice)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right text-zinc-300">{formatUsd(p.traded)}</td>
                        <td className="px-4 py-4 text-right">
                          <span className="text-emerald-400 font-medium">{formatUsd(p.toWin)}</span>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold">{formatUsd(p.value)}</td>
                        <td className="px-4 py-4 text-right">
                          <PnlBadge value={p.pnl} pct={p.pnlPct} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : filteredHistory.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-sm">No trades yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500 border-b border-[var(--card-border)]">
                  <th className="px-4 py-3 font-medium min-w-[200px]">Market</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Side</th>
                  <th className="px-4 py-3 font-medium text-right">Shares</th>
                  <th className="px-4 py-3 font-medium text-right">Price</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium text-right">Fee</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((h) => {
                  const meta = getCategoryMeta(h.category);
                  const Icon = meta.icon;
                  const isBuy = h.tradeType === "buy";

                  return (
                    <tr
                      key={h.id}
                      className="border-b border-[var(--card-border)]/60 hover:bg-zinc-900/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link href={`/events/${h.eventId}`} className="flex items-center gap-2 group">
                          <div
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                              meta.border,
                              meta.bg
                            )}
                          >
                            <Icon className={cn("h-3.5 w-3.5", meta.accent)} />
                          </div>
                          <span className="font-medium group-hover:text-blue-400 transition-colors line-clamp-1">
                            {h.title}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "text-xs font-bold uppercase px-2 py-0.5 rounded",
                            isBuy ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                          )}
                        >
                          {isBuy ? "Buy" : "Sell"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "font-bold text-xs",
                            h.outcome === "YES" ? "text-emerald-400" : "text-red-400"
                          )}
                        >
                          {h.outcome}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-300">{formatShares(h.shares)}</td>
                      <td className="px-4 py-3 text-right">{h.price > 0 ? probToCents(h.price) : "—"}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatUsd(h.amount)}</td>
                      <td className="px-4 py-3 text-right text-zinc-500">{formatUsd(h.fee)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full capitalize",
                            h.status === "won"
                              ? "bg-green-500/20 text-green-400"
                              : h.status === "lost"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-blue-500/20 text-blue-400"
                          )}
                        >
                          {h.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500 text-xs whitespace-nowrap">
                        {formatDate(h.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
