import { NextResponse } from "next/server";
import { CHAINS, getDepositAddress, getVisibleTokens } from "@/lib/blockchain/chains";
import type { NetworkId } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const network = searchParams.get("network") as NetworkId | null;

  if (!network || !CHAINS[network]) {
    return NextResponse.json({ error: "Invalid network" }, { status: 400 });
  }

  try {
    const chain = CHAINS[network];
    const address = getDepositAddress();
    return NextResponse.json({
      address,
      network,
      chainId: chain.chainId,
      name: chain.name,
      nativeToken: chain.nativeToken,
      requiredConfirmations: chain.requiredConfirmations,
      tokens: getVisibleTokens(chain).map((t) => ({
        id: t.id,
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Deposit address not configured" },
      { status: 500 }
    );
  }
}
