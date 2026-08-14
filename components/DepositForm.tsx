"use client";

import { useState, useEffect } from "react";
import { CHAINS } from "@/lib/blockchain/chains";
import type { NetworkId } from "@/lib/types";
import { Copy, Check, Loader2 } from "lucide-react";

const NETWORKS = Object.values(CHAINS);

export function DepositForm() {
  const [network, setNetwork] = useState<NetworkId>("polygon");
  const [txHash, setTxHash] = useState("");
  const [adminWallet, setAdminWallet] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error" | "pending"; message: string } | null>(null);

  async function loadAdminWallet(net: NetworkId) {
    const res = await fetch(`/api/deposits/wallet?network=${net}`);
    const data = await res.json();
    setAdminWallet(data.address ?? null);
  }

  useEffect(() => {
    loadAdminWallet(network);
  }, [network]);

  function handleNetworkChange(net: NetworkId) {
    setNetwork(net);
    setResult(null);
  }

  async function copyAddress() {
    if (!adminWallet) return;
    await navigator.clipboard.writeText(adminWallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const res = await fetch("/api/deposits/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network, tx_hash: txHash }),
    });

    const data = await res.json();

    if (res.status === 202) {
      setResult({ type: "pending", message: data.error || "Transaction pending confirmations" });
    } else if (res.ok) {
      setResult({ type: "success", message: `Deposit verified! Credited $${data.amount_usd}` });
      setTxHash("");
    } else {
      setResult({ type: "error", message: data.error || "Verification failed" });
    }

    setLoading(false);
  }

  const chain = CHAINS[network];
  const tokens = [chain.nativeToken, ...chain.tokens.map((t) => t.symbol)].join(", ");

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm mb-2">Network</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {NETWORKS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleNetworkChange(c.id)}
              className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                network === c.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-white"
                  : "border-[var(--card-border)] text-[var(--muted)] hover:text-white"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
        <p className="text-sm text-[var(--muted)] mb-2">
          Send {tokens} to this address on {chain.name}:
        </p>
        {adminWallet ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm font-mono bg-[var(--background)] p-3 rounded-lg break-all">
              {adminWallet}
            </code>
            <button
              type="button"
              onClick={copyAddress}
              className="p-2 rounded-lg border border-[var(--card-border)] hover:bg-[var(--background)]"
            >
              {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">Loading address...</p>
        )}
        <p className="text-xs text-[var(--muted)] mt-2">
          Requires {chain.requiredConfirmations} confirmations before credit.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1.5">Transaction Hash</label>
          <input
            type="text"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder="0x..."
            required
            pattern="0x[a-fA-F0-9]{64}"
            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-4 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>

        {result && (
          <div
            className={`rounded-lg p-3 text-sm border ${
              result.type === "success"
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : result.type === "pending"
                  ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
            }`}
          >
            {result.message}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !txHash}
          className="w-full bg-[var(--accent)] hover:bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Verifying..." : "Verify Deposit"}
        </button>
      </form>
    </div>
  );
}
