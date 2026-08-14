import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyDepositTransaction } from "@/lib/blockchain/verify-tx";
import { CHAINS } from "@/lib/blockchain/chains";
import { cryptoToUsd, getTokenPriceUsd } from "@/lib/oracle/coingecko";
import type { NetworkId } from "@/lib/types";

const bodySchema = z.object({
  network: z.enum(["polygon", "bsc", "arbitrum", "base"]),
  tx_hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { network, tx_hash } = body;
  const admin = createAdminClient();

  // Replay attack prevention — check BEFORE any external API call
  const { data: existing } = await admin
    .from("deposits")
    .select("id, status")
    .eq("tx_hash", tx_hash.toLowerCase())
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Transaction hash already used", status: existing.status },
      { status: 409 }
    );
  }

  // Verify on-chain
  let verification;
  try {
    verification = await verifyDepositTransaction(network as NetworkId, tx_hash);
  } catch (err) {
    await admin.rpc("record_failed_deposit", {
      p_user_id: user.id,
      p_network: network,
      p_tx_hash: tx_hash.toLowerCase(),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed" },
      { status: 500 }
    );
  }

  if (!verification.ok) {
    if (verification.pending) {
      return NextResponse.json({ error: verification.error, status: "pending" }, { status: 202 });
    }

    await admin.rpc("record_failed_deposit", {
      p_user_id: user.id,
      p_network: network,
      p_tx_hash: tx_hash.toLowerCase(),
    });
    return NextResponse.json({ error: verification.error }, { status: 400 });
  }

  const { transfer } = verification;

  // Fetch USD price
  let amountUsd: number;
  try {
    const price = await getTokenPriceUsd(transfer.coingeckoId);
    amountUsd = cryptoToUsd(transfer.amountCrypto, price);
  } catch {
    return NextResponse.json({ error: "Failed to fetch token price" }, { status: 502 });
  }

  if (amountUsd <= 0) {
    await admin.rpc("record_failed_deposit", {
      p_user_id: user.id,
      p_network: network,
      p_tx_hash: tx_hash.toLowerCase(),
      p_amount_crypto: transfer.amountCrypto,
      p_amount_usd: 0,
    });
    return NextResponse.json({ error: "Deposit amount too small" }, { status: 400 });
  }

  // Credit atomically
  const { data: depositId, error: creditError } = await admin.rpc("credit_deposit", {
    p_user_id: user.id,
    p_network: network,
    p_tx_hash: tx_hash.toLowerCase(),
    p_amount_crypto: transfer.amountCrypto,
    p_amount_usd: amountUsd,
  });

  if (creditError) {
    if (creditError.message.includes("already used")) {
      return NextResponse.json({ error: "Transaction hash already used" }, { status: 409 });
    }
    return NextResponse.json({ error: creditError.message }, { status: 500 });
  }

  return NextResponse.json({
    deposit_id: depositId,
    amount_usd: amountUsd,
    amount_crypto: transfer.amountCrypto,
    token: transfer.tokenSymbol,
    network: CHAINS[network as NetworkId].name,
    status: "verified",
  });
}
