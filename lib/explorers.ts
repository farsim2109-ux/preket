import type { NetworkId } from "@/lib/types";

const TX_EXPLORERS: Record<NetworkId, string> = {
  polygon: "https://polygonscan.com/tx/",
  bsc: "https://bscscan.com/tx/",
  arbitrum: "https://arbiscan.io/tx/",
  base: "https://basescan.org/tx/",
};

export function txExplorerUrl(network: NetworkId, txHash: string): string {
  return `${TX_EXPLORERS[network]}${txHash}`;
}

export function shortHex(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
