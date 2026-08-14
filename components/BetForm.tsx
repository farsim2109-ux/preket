"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatUsd } from "@/lib/types";
import { MarketOdds } from "@/components/MarketOdds";
import { probToCents } from "@/lib/market-ui";
import {
  getMarketPricesFromReserves,
  maxBetAmount,
  MAX_BET_USD,
  quoteBuyFromReserves,
  quoteSellFromReserves,
  TRADE_FEE_USD,
} from "@/lib/market-math";
import {
  formatShareCount,
  maxSellInputValue,
  parseShareInput,
  roundShares,
  sharePctOfTotal,
  sharesInputValue,
} from "@/lib/shares";
import { Wallet, Zap } from "lucide-react";

type TradeMode = "buy" | "sell";

interface BetFormProps {
  eventId: string;
  balance: number;
  yesPool: number;
  noPool: number;
  cpmmRy: number;
  cpmmRn: number;
  yesCpmmPerPm: number;
  noCpmmPerPm: number;
  yesShares: number;
  noShares: number;
}

export function BetForm({
  eventId,
  balance,
  cpmmRy,
  cpmmRn,
  yesCpmmPerPm,
  noCpmmPerPm,
  yesShares,
  noShares,
}: Omit<BetFormProps, "yesPool" | "noPool"> & Partial<Pick<BetFormProps, "yesPool" | "noPool">>) {
  const { yesProb, noProb } = getMarketPricesFromReserves(cpmmRy, cpmmRn);
  const [mode, setMode] = useState<TradeMode>("buy");
  const [outcome, setOutcome] = useState<"YES" | "NO">("YES");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const heldShares = outcome === "YES" ? yesShares : noShares;
  const heldCpmmPerPm = outcome === "YES" ? yesCpmmPerPm : noCpmmPerPm;
  const betCap = maxBetAmount(balance);
  const quickAmounts = [1, 5, 10, 50, 100].filter((a) => a <= betCap);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    setLoading(true);

    if (mode === "buy") {
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount < 1) {
        setError("Minimum buy is $1.00");
        setLoading(false);
        return;
      }
      if (numAmount + TRADE_FEE_USD > balance) {
        setError("Insufficient balance (includes $0.02 fee)");
        setLoading(false);
        return;
      }
      if (numAmount > betCap) {
        setError(`Maximum buy is ${formatUsd(MAX_BET_USD)}`);
        setLoading(false);
        return;
      }

      const { error: rpcError } = await supabase.rpc("place_bet", {
        p_event_id: eventId,
        p_outcome: outcome,
        p_amount_usd: numAmount,
      });
      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }
    } else {
      const numShares = parseShareInput(amount);
      if (numShares <= 0) {
        setError("Enter shares to sell");
        setLoading(false);
        return;
      }
      if (numShares > heldShares + 1e-9) {
        setError(`You only hold ${formatShareCount(heldShares)} ${outcome} shares`);
        setLoading(false);
        return;
      }

      const { error: rpcError } = await supabase.rpc("sell_shares", {
        p_event_id: eventId,
        p_outcome: outcome,
        p_shares: numShares,
      });
      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }
    }

    router.refresh();
    setAmount("");
    setLoading(false);
  }

  const numVal = mode === "buy" ? parseFloat(amount) || 0 : parseShareInput(amount);
  const validVal = !isNaN(numVal) && numVal > 0;
  const buyQuote = validVal && mode === "buy" ? quoteBuyFromReserves(numVal, outcome, cpmmRy, cpmmRn) : null;
  const sellQuote =
    validVal && mode === "sell"
      ? quoteSellFromReserves(numVal, heldCpmmPerPm, outcome, cpmmRy, cpmmRn)
      : null;
  const displayPrice =
    mode === "buy"
      ? buyQuote?.ask ?? (outcome === "YES" ? yesProb : noProb)
      : sellQuote?.bid ?? (outcome === "YES" ? yesProb : noProb);

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden"
    >
      <div className="border-b border-[var(--card-border)] bg-gradient-to-r from-indigo-950/60 to-transparent px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-400" />
          <h3 className="font-bold text-lg">Trade</h3>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-zinc-400">
          <Wallet className="h-4 w-4" />
          {formatUsd(balance)}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Buy / Sell tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
          {(["buy", "sell"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setAmount("");
                setError("");
              }}
              className={`py-2.5 rounded-lg text-sm font-bold capitalize transition-all ${
                mode === m
                  ? m === "buy"
                    ? "bg-emerald-600 text-white shadow"
                    : "bg-red-600 text-white shadow"
                  : "text-zinc-500 hover:text-white"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">{error}</div>
        )}

        {/* Your position */}
        <div className="flex gap-4 text-xs text-zinc-500">
          <span>
            Yes held: <strong className="text-emerald-400">{formatShareCount(yesShares)}</strong>
          </span>
          <span>
            No held: <strong className="text-red-400">{formatShareCount(noShares)}</strong>
          </span>
        </div>

        <MarketOdds yesProb={yesProb} noProb={noProb} selected={outcome} onSelect={setOutcome} />

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">
            {mode === "buy" ? "Amount (USD)" : "Shares to sell"}
          </label>
          <div className="relative">
            {mode === "buy" && (
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-medium">$</span>
            )}
            <input
              type="number"
              step={mode === "buy" ? "0.01" : "any"}
              min={mode === "buy" ? "1" : "0.000001"}
              max={mode === "buy" ? betCap : heldShares}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => {
                if (!amount) return;
                if (mode === "buy") {
                  const n = parseFloat(amount);
                  if (Number.isFinite(n)) setAmount(roundShares(n, 2).toFixed(2));
                } else {
                  const n = parseShareInput(amount);
                  if (n > 0) setAmount(maxSellInputValue(Math.min(n, heldShares)));
                }
              }}
              placeholder={mode === "buy" ? "0.00" : "0"}
              required
              className={`w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] ${
                mode === "buy" ? "pl-8" : "pl-4"
              } pr-4 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
          </div>
          {mode === "buy" ? (
            quickAmounts.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {quickAmounts.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAmount(String(a))}
                    className="px-3 py-1 rounded-lg text-xs font-medium border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors"
                  >
                    ${a}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAmount(roundShares(betCap, 2).toFixed(2))}
                  className="px-3 py-1 rounded-lg text-xs font-medium border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors"
                >
                  Max
                </button>
              </div>
            )
          ) : (
            heldShares > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setAmount(sharesInputValue(sharePctOfTotal(heldShares, pct)))}
                    className="px-3 py-1 rounded-lg text-xs font-medium border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors"
                  >
                    {pct}%
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAmount(maxSellInputValue(heldShares))}
                  className="px-3 py-1 rounded-lg text-xs font-medium border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors"
                >
                  Max
                </button>
              </div>
            )
          )}
        </div>

        <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">{mode === "buy" ? "Ask (buy)" : "Bid (sell)"}</span>
            <span className={outcome === "YES" ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
              {outcome} @ {probToCents(displayPrice)}
            </span>
          </div>
          <div className="flex justify-between text-xs text-zinc-600">
            <span>Mid price</span>
            <span>
              {probToCents(
                (mode === "buy" ? buyQuote?.mid : sellQuote?.mid) ??
                  (outcome === "YES" ? yesProb : noProb)
              )}
            </span>
          </div>

          {mode === "buy" && buyQuote && (
            <>
              <div className="flex justify-between">
                <span className="text-zinc-500">Shares</span>
                <span className="text-white">{formatShareCount(buyQuote.shares)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Cost</span>
                <span className="text-white">{formatUsd(buyQuote.cost)}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-800 pt-2">
                <span className="text-zinc-500">To win if {outcome}</span>
                <span className="text-emerald-400 font-bold">{formatUsd(buyQuote.payout)}</span>
              </div>
              <p className="text-xs text-zinc-600">Payout at resolution — not instant sell value</p>
            </>
          )}

          {mode === "sell" && sellQuote && (
            <>
              <div className="flex justify-between">
                <span className="text-zinc-500">Shares</span>
                <span className="text-white">{formatShareCount(sellQuote.shares)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Proceeds</span>
                <span className="text-white">{formatUsd(sellQuote.proceeds)}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-800 pt-2">
                <span className="text-zinc-500">You receive</span>
                <span className="text-emerald-400 font-bold">{formatUsd(sellQuote.totalCredit)}</span>
              </div>
            </>
          )}

        </div>

        <button
          type="submit"
          disabled={loading || (mode === "buy" ? balance < 1.02 : heldShares <= 0)}
          className={`w-full py-4 rounded-xl font-bold text-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            mode === "buy"
              ? outcome === "YES"
                ? "bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white shadow-lg shadow-emerald-500/25"
                : "bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white shadow-lg shadow-red-500/25"
              : "bg-gradient-to-r from-zinc-700 to-zinc-600 hover:from-zinc-600 hover:to-zinc-500 text-white"
          }`}
        >
          {loading
            ? "Processing..."
            : mode === "buy"
              ? `Buy ${outcome} · ${probToCents(displayPrice)}`
              : `Sell ${outcome} · ${probToCents(displayPrice)}`}
        </button>
      </div>
    </form>
  );
}
