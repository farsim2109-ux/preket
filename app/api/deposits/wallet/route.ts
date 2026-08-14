import { NextResponse } from "next/server";
import { CHAINS, getAdminWallet } from "@/lib/blockchain/chains";
import type { NetworkId } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const network = searchParams.get("network") as NetworkId | null;

  if (!network || !CHAINS[network]) {
    return NextResponse.json({ error: "Invalid network" }, { status: 400 });
  }

  try {
    const address = getAdminWallet(network);
    return NextResponse.json({ address, network });
  } catch {
    return NextResponse.json({ error: "Admin wallet not configured" }, { status: 500 });
  }
}
