"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHAINS, getVisibleTokens } from "@/lib/blockchain/chains";
import type { DepositTokenId } from "@/lib/blockchain/chains";
import type { NetworkId } from "@/lib/types";
import { Copy, Check, Loader2, AlertTriangle } from "lucide-react";

const NETWORKS = Object.values(CHAINS);
const POLL_MS = 10_000;
const MAX_POLLS = 36;

type VerifyStatus = "idle" | "verifying" | "pending" | "confirmed" | "error";

interface ChainInfo {
  address: string;
  nativeToken: string;
  requiredConfirmations: number;
  tokens: Array<{ id: string; symbol: string; address: string; decimals: number }>;
}

export function DepositForm() {
  const [network, setNetwork] = useState<NetworkId>("polygon");
  const [token, setToken] = useState<DepositTokenId>("USDC");
  const [txHash, setTxHash] = useState("");
  const [chainInfo, setChainInfo] = useState<ChainInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<VerifyStatus>("idle");
  const [message, setMessage] = useState("");
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
  const pollRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chain = CHAINS[network];
  const visibleTokens = getVisibleTokens(chain);

  const loadChainInfo = useCallback(async (net: NetworkId) => {
    const res = await fetch(`/api/deposits/wallet?network=${net}`);
    const data = await res.json();
    if (res.ok) {
      setChainInfo({
        address: data.address,
        nativeToken: data.nativeToken,
        requiredConfirmations: data.requiredConfirmations,
        tokens: data.tokens ?? [],
      });
    } else {
      setChainInfo(null);
      setMessage(data.error ?? "Failed to load deposit address");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    loadChainInfo(network);
  }, [network, loadChainInfo]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  function handleNetworkChange(net: NetworkId) {
    setNetwork(net);
    setStatus("idle");
    setMessage("");
    pollRef.current = 0;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    const tokens = getVisibleTokens(CHAINS[net]);
    setToken(tokens[0]?.id ?? "NATIVE");
  }

  async function copyAddress() {
    if (!chainInfo?.address) return;
    await navigator.clipboard.writeText(chainInfo.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function verifyOnce(hash: string): Promise<boolean> {
    const res = await fetch("/api/deposits/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        network,
        tx_hash: hash,
        token,
      }),
    });

    const data = await res.json();

    if (res.status === 202) {
      setStatus("pending");
      setMessage(data.error || "Waiting for blockchain confirmations…");
      return false;
    }

    if (res.ok && data.status === "verified") {
      setStatus("confirmed");
      setMessage(
        `Deposit confirmed! Credited $${data.amount_usd} (${data.amount_crypto} ${data.token})`
      );
      if (typeof data.balance_usd === "number") setBalanceUsd(data.balance_usd);
      setTxHash("");
      pollRef.current = 0;
      return true;
    }

    setStatus("error");
    setMessage(data.error || "Verification failed");
    return true;
  }

  async function runVerification(hash: string) {
    setStatus("verifying");
    setMessage("Checking transaction on-chain…");
    pollRef.current = 0;

    const done = await verifyOnce(hash);
    if (done) {
      setStatus((s) => (s === "verifying" ? "error" : s));
      return;
    }

    const schedulePoll = () => {
      pollRef.current += 1;
      if (pollRef.current >= MAX_POLLS) {
        setStatus("error");
        setMessage("Transaction not confirmed after extended polling. Check the hash or try again later.");
        return;
      }
      pollTimerRef.current = setTimeout(async () => {
        const finished = await verifyOnce(hash);
        if (!finished) schedulePoll();
      }, POLL_MS);
    };
    schedulePoll();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollRef.current = 0;
    await runVerification(txHash.trim());
  }

  const depositAddress = chainInfo?.address;
  const selectedTokenMeta =
    token === "NATIVE"
      ? { symbol: chain.nativeToken, address: null as string | null }
      : chainInfo?.tokens.find((t) => t.id === token || (token === "USDC" && t.id === "USDC"));

  const qrUrl = depositAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(depositAddress)}`
    : null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex gap-2 text-sm text-amber-200">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
        <p>
          Send only on the <strong>selected network</strong>. Wrong network deposits may be lost.
          Requires {chainInfo?.requiredConfirmations ?? chain.requiredConfirmations} confirmations
          before credit.
        </p>
      </div>

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

      <div>
        <label className="block text-sm mb-2">Asset</label>
        <div className="flex flex-wrap gap-2">
          <TokenPill
            active={token === "NATIVE"}
            label={chain.nativeToken}
            onClick={() => setToken("NATIVE")}
          />
          {visibleTokens.map((t) => (
            <TokenPill
              key={t.id}
              active={token === t.id || (token === "USDC" && t.id === "USDC")}
              label={t.symbol}
              onClick={() => setToken(t.id)}
            />
          ))}
        </div>
        {selectedTokenMeta?.address && (
          <p className="mt-2 text-xs text-zinc-500 font-mono break-all">
            Contract: {selectedTokenMeta.address}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-4">
        <p className="text-sm text-[var(--muted)]">
          Send {token === "NATIVE" ? chain.nativeToken : selectedTokenMeta?.symbol} to this address on{" "}
          {chain.name}:
        </p>
        {depositAddress ? (
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {qrUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrUrl}
                alt="Deposit address QR code"
                className="rounded-lg border border-[var(--card-border)] bg-white p-2 shrink-0"
                width={180}
                height={180}
              />
            )}
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono bg-[var(--background)] p-3 rounded-lg break-all">
                  {depositAddress}
                </code>
                <button
                  type="button"
                  onClick={copyAddress}
                  className="p-2 rounded-lg border border-[var(--card-border)] hover:bg-[var(--background)]"
                  aria-label="Copy address"
                >
                  {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">Loading deposit address…</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1.5">Transaction hash (after you send)</label>
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

        {message && (
          <div
            className={`rounded-lg p-3 text-sm border ${
              status === "confirmed"
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : status === "pending" || status === "verifying"
                  ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
            }`}
          >
            {status === "pending" || status === "verifying" ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {message}
              </span>
            ) : (
              message
            )}
            {status === "pending" && (
              <p className="text-xs mt-2 opacity-80">Auto-checking every 10 seconds…</p>
            )}
          </div>
        )}

        {balanceUsd !== null && (
          <p className="text-sm text-emerald-400">New balance: ${balanceUsd.toFixed(2)}</p>
        )}

        <button
          type="submit"
          disabled={status === "verifying" || status === "pending" || !txHash || !depositAddress}
          className="w-full bg-[var(--accent)] hover:bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2"
        >
          {(status === "verifying" || status === "pending") && <Loader2 className="h-4 w-4 animate-spin" />}
          {status === "pending" ? "Confirming on-chain…" : status === "verifying" ? "Verifying…" : "Verify deposit"}
        </button>
      </form>
    </div>
  );
}

function TokenPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/15 text-white"
          : "border-[var(--card-border)] text-[var(--muted)] hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}
