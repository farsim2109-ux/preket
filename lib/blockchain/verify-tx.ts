import { withRetry } from "@/lib/utils";
import { CHAINS, getAdminWallet, getAlchemyUrl, TRANSFER_EVENT_TOPIC, type ChainConfig } from "./chains";
import type { NetworkId } from "@/lib/types";
import { getAddress, isAddress } from "viem";

export interface VerifiedTransfer {
  to: string;
  amountCrypto: number;
  tokenSymbol: string;
  coingeckoId: string;
  confirmations: number;
  requiredConfirmations: number;
  isConfirmed: boolean;
}

interface TxReceipt {
  status: string;
  blockNumber: string;
  to: string | null;
  value: string;
  logs: Array<{ address: string; topics: string[]; data: string }>;
}

async function getLatestBlockNumber(network: NetworkId): Promise<number> {
  const url = getAlchemyUrl(network);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  });
  const data = await res.json();
  return parseInt(data.result, 16);
}

async function getTransactionReceipt(network: NetworkId, txHash: string): Promise<TxReceipt | null> {
  const url = getAlchemyUrl(network);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionReceipt",
      params: [txHash],
    }),
  });
  const data = await res.json();
  return data.result ?? null;
}

function parseErc20Transfer(
  log: { address: string; topics: string[]; data: string },
  chain: ChainConfig
): { to: string; amount: bigint; token: (typeof chain.tokens)[0] } | null {
  if (log.topics[0]?.toLowerCase() !== TRANSFER_EVENT_TOPIC) return null;
  const token = chain.tokens.find((t) => t.address.toLowerCase() === log.address.toLowerCase());
  if (!token) return null;
  if (log.topics.length < 3) return null;

  const to = "0x" + log.topics[2].slice(26);
  const amount = BigInt(log.data);
  return { to, amount, token };
}

export async function verifyDepositTransaction(
  network: NetworkId,
  txHash: string
): Promise<{ ok: true; transfer: VerifiedTransfer } | { ok: false; error: string; pending?: boolean }> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { ok: false, error: "Invalid transaction hash format" };
  }

  const chain = CHAINS[network];
  const adminWallet = getAdminWallet(network).toLowerCase();

  let receipt: TxReceipt | null;
  try {
    receipt = await withRetry(() => getTransactionReceipt(network, txHash));
  } catch {
    return { ok: false, error: "Failed to fetch transaction from blockchain API" };
  }

  if (!receipt) {
    return { ok: false, error: "Transaction not found. It may still be pending.", pending: true };
  }

  if (receipt.status !== "0x1") {
    return { ok: false, error: "Transaction failed on-chain" };
  }

  const latestBlock = await withRetry(() => getLatestBlockNumber(network));
  const txBlock = parseInt(receipt.blockNumber, 16);
  const confirmations = latestBlock - txBlock + 1;
  const isConfirmed = confirmations >= chain.requiredConfirmations;

  if (!isConfirmed) {
    return {
      ok: false,
      error: `Transaction pending: ${confirmations}/${chain.requiredConfirmations} confirmations`,
      pending: true,
    };
  }

  // Check ERC-20 transfers in logs
  for (const log of receipt.logs) {
    const parsed = parseErc20Transfer(log, chain);
    if (!parsed) continue;

    const toAddr = parsed.to.toLowerCase();
    if (toAddr !== adminWallet) continue;

    const amountCrypto = Number(parsed.amount) / Math.pow(10, parsed.token.decimals);
    if (amountCrypto <= 0) continue;

    return {
      ok: true,
      transfer: {
        to: getAddress(parsed.to),
        amountCrypto,
        tokenSymbol: parsed.token.symbol,
        coingeckoId: parsed.token.coingeckoId,
        confirmations,
        requiredConfirmations: chain.requiredConfirmations,
        isConfirmed: true,
      },
    };
  }

  // Check native transfer
  if (receipt.to?.toLowerCase() === adminWallet) {
    const amountCrypto = parseInt(receipt.value, 16) / 1e18;
    if (amountCrypto > 0) {
      return {
        ok: true,
        transfer: {
          to: getAddress(receipt.to),
          amountCrypto,
          tokenSymbol: chain.nativeToken,
          coingeckoId: chain.nativeCoingeckoId,
          confirmations,
          requiredConfirmations: chain.requiredConfirmations,
          isConfirmed: true,
        },
      };
    }
  }

  return {
    ok: false,
    error: `No valid transfer to admin wallet found. Expected: ${getAdminWallet(network)}`,
  };
}

export function validateEvmAddress(address: string): boolean {
  return isAddress(address);
}
