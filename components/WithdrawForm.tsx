"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CHAINS } from "@/lib/blockchain/chains";
import type { NetworkId } from "@/lib/types";
import { isAddress } from "viem";

const NETWORKS = Object.values(CHAINS);

export function WithdrawForm({ balance }: { balance: number }) {
  const [network, setNetwork] = useState<NetworkId>("polygon");
  const [walletAddress, setWalletAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!isAddress(walletAddress)) {
      setError("Invalid EVM wallet address");
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Invalid amount");
      return;
    }
    if (numAmount > balance) {
      setError("Insufficient balance");
      return;
    }

    setLoading(true);
    const { error: rpcError } = await supabase.rpc("request_withdrawal", {
      p_network: network,
      p_wallet_address: walletAddress,
      p_amount_usd: numAmount,
    });

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setAmount("");
    setWalletAddress("");
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-3 text-sm text-green-400">
          Your withdrawal request has been submitted. Funds will be sent to your wallet within one hour.
        </div>
      )}

      <div>
        <label className="block text-sm mb-2">Network</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {NETWORKS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setNetwork(c.id)}
              className={`p-2 rounded-lg border text-sm ${
                network === c.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--card-border)] text-[var(--muted)]"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm mb-1.5">Destination Wallet</label>
        <input
          type="text"
          value={walletAddress}
          onChange={(e) => setWalletAddress(e.target.value)}
          placeholder="0x..."
          required
          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-4 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
      </div>

      <div>
        <label className="block text-sm mb-1.5">Amount (USD)</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          max={balance}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <p className="text-xs text-[var(--muted)] mt-1">Available: ${balance.toFixed(2)}</p>
      </div>

      <button
        type="submit"
        disabled={loading || balance <= 0}
        className="w-full bg-[var(--accent)] hover:bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium"
      >
        {loading ? "Submitting..." : "Request Withdrawal"}
      </button>
    </form>
  );
}
