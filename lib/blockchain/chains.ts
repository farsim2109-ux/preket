import type { NetworkId } from "@/lib/types";

export interface TokenConfig {
  symbol: string;
  address: string;
  decimals: number;
  coingeckoId: string;
}

export interface ChainConfig {
  id: NetworkId;
  chainId: number;
  name: string;
  nativeToken: string;
  nativeCoingeckoId: string;
  adminWalletEnv: string;
  alchemyNetwork: string;
  scannerApiUrl?: string;
  requiredConfirmations: number;
  tokens: TokenConfig[];
}

export const CHAINS: Record<NetworkId, ChainConfig> = {
  polygon: {
    id: "polygon",
    chainId: 137,
    name: "Polygon",
    nativeToken: "POL",
    nativeCoingeckoId: "polygon-ecosystem-token",
    adminWalletEnv: "ADMIN_WALLET_POLYGON",
    alchemyNetwork: "polygon-mainnet",
    requiredConfirmations: 12,
    tokens: [
      {
        symbol: "USDC",
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
    adminWalletEnv: "ADMIN_WALLET_BSC",
    alchemyNetwork: "bnb-mainnet",
    scannerApiUrl: "https://api.bscscan.com/api",
    requiredConfirmations: 12,
    tokens: [
      {
        symbol: "USDT",
        address: "0x55d398326f99059fF775485246999027B3197955",
        decimals: 18,
        coingeckoId: "tether",
      },
    ],
  },
  arbitrum: {
    id: "arbitrum",
    chainId: 42161,
    name: "Arbitrum",
    nativeToken: "ETH",
    nativeCoingeckoId: "ethereum",
    adminWalletEnv: "ADMIN_WALLET_ARBITRUM",
    alchemyNetwork: "arb-mainnet",
    requiredConfirmations: 6,
    tokens: [
      {
        symbol: "USDC",
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
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
    adminWalletEnv: "ADMIN_WALLET_BASE",
    alchemyNetwork: "base-mainnet",
    requiredConfirmations: 6,
    tokens: [
      {
        symbol: "USDC",
        address: "0x833589fCD6eDb6E08f4c7C32D6f7b9aD602a843",
        decimals: 6,
        coingeckoId: "usd-coin",
      },
    ],
  },
};

export function getAdminWallet(network: NetworkId): string {
  const chain = CHAINS[network];
  const address = process.env[chain.adminWalletEnv];
  if (!address) throw new Error(`Missing env var: ${chain.adminWalletEnv}`);
  return address;
}

export function getAlchemyUrl(network: NetworkId): string {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) throw new Error("Missing ALCHEMY_API_KEY");
  return `https://${CHAINS[network].alchemyNetwork}.g.alchemy.com/v2/${apiKey}`;
}

export const TRANSFER_EVENT_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
