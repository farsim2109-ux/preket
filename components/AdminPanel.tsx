"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Event } from "@/lib/types";
import { formatUsd } from "@/lib/types";

interface WithdrawalRow {
  id: string;
  network: string;
  wallet_address: string;
  amount_usd: number;
  created_at: string;
  users: { email: string } | null;
}

async function callAdminRpc(fn: string, params: Record<string, unknown>) {
  const res = await fetch("/api/admin/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fn, params }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data.data;
}

export function AdminPanel({
  events,
  withdrawals,
}: {
  events: Event[];
  withdrawals: WithdrawalRow[];
}) {
  const [tab, setTab] = useState<"events" | "withdrawals">("events");
  const router = useRouter();

  return (
    <div>
      <div className="flex gap-2 mb-6 border-b border-[var(--card-border)]">
        {(["events", "withdrawals"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize border-b-2 -mb-px ${
              tab === t
                ? "border-[var(--accent)] text-white"
                : "border-transparent text-[var(--muted)]"
            }`}
          >
            {t}
            {t === "withdrawals" && withdrawals.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-xs">
                {withdrawals.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "events" ? (
        <EventsAdmin events={events} onRefresh={() => router.refresh()} />
      ) : (
        <WithdrawalsAdmin withdrawals={withdrawals} onRefresh={() => router.refresh()} />
      )}
    </div>
  );
}

function EventsAdmin({
  events,
  onRefresh,
}: {
  events: Event[];
  onRefresh: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [liquidityEventId, setLiquidityEventId] = useState<string | null>(null);
  const [yesLiquidity, setYesLiquidity] = useState("");
  const [noLiquidity, setNoLiquidity] = useState("");
  const [liquidityLoading, setLiquidityLoading] = useState(false);
  const [liquidityError, setLiquidityError] = useState("");

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await callAdminRpc("create_event", {
        p_title: title,
        p_description: description,
        p_category: category,
      });
      setTitle("");
      setDescription("");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    }
    setLoading(false);
  }

  async function resolveEvent(id: string, outcome: "YES" | "NO") {
    if (!confirm(`Resolve this event as ${outcome}?`)) return;
    try {
      await callAdminRpc("resolve_event", {
        p_event_id: id,
        p_winning_outcome: outcome,
      });
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Request failed");
    }
  }

  async function cancelEvent(id: string) {
    if (!confirm("Cancel this event and refund all bets?")) return;
    try {
      await callAdminRpc("cancel_event", { p_event_id: id });
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Request failed");
    }
  }

  function openLiquidity(eventId: string) {
    setLiquidityEventId(eventId);
    setYesLiquidity("");
    setNoLiquidity("");
    setLiquidityError("");
  }

  async function addLiquidity(e: React.FormEvent) {
    e.preventDefault();
    if (!liquidityEventId) return;

    const yesUsd = parseFloat(yesLiquidity) || 0;
    const noUsd = parseFloat(noLiquidity) || 0;
    if (yesUsd <= 0 && noUsd <= 0) {
      setLiquidityError("Enter a YES and/or NO amount");
      return;
    }

    setLiquidityLoading(true);
    setLiquidityError("");
    try {
      await callAdminRpc("admin_add_liquidity", {
        p_event_id: liquidityEventId,
        p_yes_usd: yesUsd,
        p_no_usd: noUsd,
      });
      setLiquidityEventId(null);
      setYesLiquidity("");
      setNoLiquidity("");
      onRefresh();
    } catch (err) {
      setLiquidityError(err instanceof Error ? err.message : "Request failed");
    }
    setLiquidityLoading(false);
  }

  function quickLiquidity(yesUsd: number, noUsd: number) {
    setYesLiquidity(String(yesUsd));
    setNoLiquidity(String(noUsd));
  }

  return (
    <div className="space-y-8">
      <form onSubmit={createEvent} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
        <h3 className="font-semibold">Create Event</h3>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Event title"
          required
          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-4 py-2"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          rows={3}
          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-4 py-2"
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category"
          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-4 py-2"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-[var(--accent)] text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Event"}
        </button>
      </form>

      <div className="space-y-3">
        <h3 className="font-semibold">All Events</h3>
        {events.map((event) => (
          <div
            key={event.id}
            className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4 space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-medium">{event.title}</p>
                <p className="text-xs text-[var(--muted)] capitalize">
                  {event.status} · {event.category}
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Yes pool {formatUsd(Number(event.total_yes_pool))} · No pool{" "}
                  {formatUsd(Number(event.total_no_pool))} · Total{" "}
                  {formatUsd(Number(event.total_yes_pool) + Number(event.total_no_pool))}
                </p>
              </div>
              {event.status === "active" && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openLiquidity(event.id)}
                    className="px-3 py-1 text-xs rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30"
                  >
                    Add Liquidity
                  </button>
                  <button
                    onClick={() => resolveEvent(event.id, "YES")}
                    className="px-3 py-1 text-xs rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30"
                  >
                    Resolve YES
                  </button>
                  <button
                    onClick={() => resolveEvent(event.id, "NO")}
                    className="px-3 py-1 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  >
                    Resolve NO
                  </button>
                  <button
                    onClick={() => cancelEvent(event.id)}
                    className="px-3 py-1 text-xs rounded-lg bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {liquidityEventId === event.id && (
              <form
                onSubmit={addLiquidity}
                className="rounded-lg border border-indigo-500/30 bg-indigo-950/20 p-4 space-y-3"
              >
                <p className="text-sm font-medium text-indigo-200">Inject fake volume / liquidity</p>
                <p className="text-xs text-zinc-500">
                  Adds USD to YES and/or NO pools. Does not charge balance or create bet rows.
                </p>
                {liquidityError && <p className="text-xs text-red-400">{liquidityError}</p>}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">YES liquidity ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={yesLiquidity}
                      onChange={(e) => setYesLiquidity(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">NO liquidity ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={noLiquidity}
                      onChange={(e) => setNoLiquidity(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "+$1K / +$1K", yes: 1000, no: 1000 },
                    { label: "+$10K / +$10K", yes: 10000, no: 10000 },
                    { label: "+$50K YES", yes: 50000, no: 0 },
                    { label: "+$50K NO", yes: 0, no: 50000 },
                    { label: "+$100K each", yes: 100000, no: 100000 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => quickLiquidity(preset.yes, preset.no)}
                      className="px-2.5 py-1 text-xs rounded-md border border-zinc-700 text-zinc-400 hover:border-indigo-500 hover:text-indigo-200"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={liquidityLoading}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
                  >
                    {liquidityLoading ? "Adding..." : "Add Liquidity"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLiquidityEventId(null)}
                    className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WithdrawalsAdmin({
  withdrawals,
  onRefresh,
}: {
  withdrawals: WithdrawalRow[];
  onRefresh: () => void;
}) {
  async function approve(id: string) {
    try {
      await callAdminRpc("approve_withdrawal", { p_withdrawal_id: id });
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Request failed");
    }
  }

  async function reject(id: string) {
    if (!confirm("Reject and refund this withdrawal?")) return;
    try {
      await callAdminRpc("reject_withdrawal", { p_withdrawal_id: id });
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Request failed");
    }
  }

  if (!withdrawals.length) {
    return <p className="text-[var(--muted)]">No pending withdrawals.</p>;
  }

  return (
    <div className="space-y-3">
      {withdrawals.map((w) => (
        <div
          key={w.id}
          className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div>
            <p className="font-medium">{formatUsd(Number(w.amount_usd))}</p>
            <p className="text-xs text-[var(--muted)]">
              {w.users?.email} · {w.network}
            </p>
            <p className="text-xs font-mono text-[var(--muted)]">{w.wallet_address}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => approve(w.id)}
              className="px-3 py-1 text-xs rounded-lg bg-green-500/20 text-green-400"
            >
              Approve
            </button>
            <button
              onClick={() => reject(w.id)}
              className="px-3 py-1 text-xs rounded-lg bg-red-500/20 text-red-400"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
