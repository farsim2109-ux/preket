import { withRetry } from "@/lib/utils";

export async function getTokenPriceUsd(coingeckoId: string): Promise<number> {
  const apiKey = process.env.COINGECKO_API_KEY;
  const baseUrl = "https://api.coingecko.com/api/v3/simple/price";
  const params = new URLSearchParams({
    ids: coingeckoId,
    vs_currencies: "usd",
  });
  if (apiKey) params.set("x_cg_demo_api_key", apiKey);

  const price = await withRetry(async () => {
    const res = await fetch(`${baseUrl}?${params}`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
    const data = await res.json();
    const usd = data[coingeckoId]?.usd;
    if (typeof usd !== "number" || usd <= 0) throw new Error("Invalid price from CoinGecko");
    return usd;
  });

  return price;
}

export function cryptoToUsd(amountCrypto: number, priceUsd: number): number {
  return Math.round(amountCrypto * priceUsd * 100) / 100;
}
