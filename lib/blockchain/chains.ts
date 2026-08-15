import type { NetworkId } from "@/lib/types";

export type DepositTokenId = "NATIVE" | "USDT" | "USDC" | "USDC.e";

export interface TokenConfig {
  id: DepositTokenId;
  symbol: string;
  address: string;
  decimals: number;
  coingeckoId: string;
  /** Hide from token picker but still accept on-chain (bridged / legacy). */
  hidden?: boolean;
}

export interface ChainConfig {
  id: NetworkId;
  chainId: number;
  name: string;
  nativeToken: string;
  nativeCoingeckoId: string;
  rpcEnv: string;
  alchemyNetwork: string;
  requiredConfirmations: number;
  tokens: TokenConfig[];
}

/**
 * Official mainnet contracts (Circle / Tether / chain explorers).
 * Decimals: 6 on Polygon/Arbitrum/Base; 18 on BSC for USDT and USDC.
 */
export const CHAINS: Record<NetworkId, ChainConfig> = {
  polygon: {
    id: "polygon",
    chainId: 137,
    name: "Polygon",
    nativeToken: "POL",
    nativeCoingeckoId: "polygon-ecosystem-token",
    rpcEnv: "POLYGON_RPC_URL",
    alchemyNetwork: "polygon-mainnet",
    requiredConfirmations: 15,
    tokens: [
      {
        id: "USDT",
        symbol: "USDT",
        address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        decimals: 6,
        coingeckoId: "tether",
      },
      {
        id: "USDC",
        symbol: "USDC",
        address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        decimals: 6,
        coingeckoId: "usd-coin",
      },
      {
        id: "USDC.e",
        symbol: "USDC.e",
        address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        decimals: 6,
        coingeckoId: "usd-coin",
      },
    ],
  },
  bsc: {
    id: "bsc",
    chainId: 56,
    name: "BNB Smart Chain",
    nativeToken: "BNB",
    nativeCoingeckoId: "binancecoin",
    rpcEnv: "BSC_RPC_URL",
    alchemyNetwork: "bnb-mainnet",
    requiredConfirmations: 15,
    tokens: [
      {
        id: "USDT",
        symbol: "USDT",
        address: "0x55d398326f99059fF775485246999027B3197955",
        decimals: 18,
        coingeckoId: "tether",
      },
      {
        id: "USDC",
        symbol: "USDC",
        address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        decimals: 18,
        coingeckoId: "usd-coin",
      },
    ],
  },
  arbitrum: {
    id: "arbitrum",
    chainId: 42161,
    name: "Arbitrum",
    nativeToken: "ETH",
    nativeCoingeckoId: "ethereum",
    rpcEnv: "ARBITRUM_RPC_URL",
    alchemyNetwork: "arb-mainnet",
    requiredConfirmations: 30,
    tokens: [
      {
        id: "USDT",
        symbol: "USDT",
        address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        decimals: 6,
        coingeckoId: "tether",
      },
      {
        id: "USDC",
        symbol: "USDC",
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        decimals: 6,
        coingeckoId: "usd-coin",
      },
      {
        id: "USDC.e",
        symbol: "USDC.e",
        address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
        decimals: 6,
        coingeckoId: "usd-coin",
      },
    ],
  },
  base: {
    id: "base",
    chainId: 8453,
    name: "Base",
    nativeToken: "ETH",
    nativeCoingeckoId: "ethereum",
    rpcEnv: "BASE_RPC_URL",
    alchemyNetwork: "base-mainnet",
    requiredConfirmations: 30,
    tokens: [
      {
        id: "USDT",
        symbol: "USDT",
        address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
        decimals: 6,
        coingeckoId: "tether",
      },
      {
        id: "USDC",
        symbol: "USDC",
        address: "0x833589fCD6eDb6E08f4c7C32D6f7b9aD602a8433",
        decimals: 6,
        coingeckoId: "usd-coin",
      },
    ],
  },
};

export function getDepositAddress(): string {
  const unified = process.env.DEPOSIT_ADDRESS;
  if (unified && /^0x[a-fA-F0-9]{40}$/.test(unified)) return unified;

  const fallbacks = [
    process.env.ADMIN_WALLET_POLYGON,
    process.env.ADMIN_WALLET_BSC,
    process.env.ADMIN_WALLET_ARBITRUM,
    process.env.ADMIN_WALLET_BASE,
  ];
  const found = fallbacks.find((a) => a && /^0x[a-fA-F0-9]{40}$/.test(a));
  if (found) return found;

  throw new Error("Missing env var: DEPOSIT_ADDRESS");
}

export function getAdminWallet(network?: NetworkId): string {
  void network;
  return getDepositAddress();
}

export function getRpcUrl(network: NetworkId): string {
  const chain = CHAINS[network];
  const fromEnv = process.env[chain.rpcEnv]?.trim();
  if (fromEnv) return fromEnv;

  const apiKey = process.env.ALCHEMY_API_KEY;
  if (apiKey) {
    return `https://${chain.alchemyNetwork}.g.alchemy.com/v2/${apiKey}`;
  }

  throw new Error(`Missing ${chain.rpcEnv} (or ALCHEMY_API_KEY fallback)`);
}

export function getVisibleTokens(chain: ChainConfig): TokenConfig[] {
  return chain.tokens.filter((t) => !t.hidden);
}

export function tokenMatchesSelection(token: TokenConfig, selected: DepositTokenId | undefined): boolean {
  if (!selected || selected === "NATIVE") return false;
  if (selected === "USDC") return token.id === "USDC" || token.id === "USDC.e";
  return token.id === selected;
}

export const TRANSFER_EVENT_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
