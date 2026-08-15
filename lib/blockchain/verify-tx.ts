import { createPublicClient, erc20Abi, formatUnits, http, parseEventLogs } from "viem";
import { arbitrum, base, bsc, polygon } from "viem/chains";
import { withRetry } from "@/lib/utils";
import {
  CHAINS,
  getDepositAddress,
  getRpcUrl,
  tokenMatchesSelection,
  type DepositTokenId,
} from "./chains";
import type { NetworkId } from "@/lib/types";
import { getAddress, isAddress } from "viem";

const VIEM_CHAINS = { polygon, bsc, arbitrum, base } as const;

export interface VerifiedTransfer {
  to: string;
  amountCrypto: number;
  tokenSymbol: string;
  tokenId: DepositTokenId;
  coingeckoId: string;
  confirmations: number;
  requiredConfirmations: number;
  isConfirmed: boolean;
}

function clientFor(network: NetworkId) {
  return createPublicClient({
    chain: VIEM_CHAINS[network],
    transport: http(getRpcUrl(network)),
  });
}

export async function verifyDepositTransaction(
  network: NetworkId,
  txHash: string,
  expectedToken?: DepositTokenId
): Promise<{ ok: true; transfer: VerifiedTransfer } | { ok: false; error: string; pending?: boolean }> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { ok: false, error: "Invalid transaction hash format" };
  }

  const chain = CHAINS[network];
  const deposit = getDepositAddress().toLowerCase();
  const hash = txHash as `0x${string}`;
  const publicClient = clientFor(network);

  let receipt;
  try {
    receipt = await withRetry(() => publicClient.getTransactionReceipt({ hash }));
  } catch {
    return { ok: false, error: "Transaction not found. It may still be pending.", pending: true };
  }

  if (!receipt) {
    return { ok: false, error: "Transaction not found. It may still be pending.", pending: true };
  }

  if (receipt.status !== "success") {
    return { ok: false, error: "Transaction failed on-chain" };
  }

  const latestBlock = await withRetry(() => publicClient.getBlockNumber());
  const confirmations = Number(latestBlock - receipt.blockNumber) + 1;
  const isConfirmed = confirmations >= chain.requiredConfirmations;

  if (!isConfirmed) {
    return {
      ok: false,
      error: `Transaction pending: ${confirmations}/${chain.requiredConfirmations} confirmations`,
      pending: true,
    };
  }

  const wantNative = !expectedToken || expectedToken === "NATIVE";
  const wantErc20 = !expectedToken || expectedToken !== "NATIVE";

  if (wantErc20) {
    const transfers = parseEventLogs({
      abi: erc20Abi,
      logs: receipt.logs,
      eventName: "Transfer",
    });

    for (const log of transfers) {
      const token = chain.tokens.find((t) => t.address.toLowerCase() === log.address.toLowerCase());
      if (!token) continue;
      if (expectedToken && !tokenMatchesSelection(token, expectedToken)) {
        continue;
      }

      const toAddr = log.args.to?.toLowerCase();
      if (toAddr !== deposit) continue;

      const amountCrypto = Number(formatUnits(log.args.value ?? BigInt(0), token.decimals));
      if (amountCrypto <= 0) continue;

      return {
        ok: true,
        transfer: {
          to: getAddress(log.args.to!),
          amountCrypto,
          tokenSymbol: token.symbol,
          tokenId: token.id,
          coingeckoId: token.coingeckoId,
          confirmations,
          requiredConfirmations: chain.requiredConfirmations,
          isConfirmed: true,
        },
      };
    }
  }

  if (wantNative) {
    let tx;
    try {
      tx = await withRetry(() => publicClient.getTransaction({ hash }));
    } catch {
      tx = null;
    }

    const to = tx?.to?.toLowerCase();
    const value = tx?.value ?? BigInt(0);
    if (to === deposit && value > BigInt(0)) {
      const amountCrypto = Number(formatUnits(value, 18));
      if (amountCrypto > 0) {
        return {
          ok: true,
          transfer: {
            to: getAddress(tx!.to!),
            amountCrypto,
            tokenSymbol: chain.nativeToken,
            tokenId: "NATIVE",
            coingeckoId: chain.nativeCoingeckoId,
            confirmations,
            requiredConfirmations: chain.requiredConfirmations,
            isConfirmed: true,
          },
        };
      }
    }
  }

  return {
    ok: false,
    error: `No valid ${expectedToken ?? "NATIVE/USDT/USDC"} transfer to deposit address found. Expected: ${getDepositAddress()}`,
  };
}

export function validateEvmAddress(address: string): boolean {
  return isAddress(address);
}
