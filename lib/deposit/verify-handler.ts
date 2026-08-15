import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyDepositTransaction } from "@/lib/blockchain/verify-tx";
import { CHAINS, type DepositTokenId } from "@/lib/blockchain/chains";
import { cryptoToUsd, getTokenPriceUsd } from "@/lib/oracle/coingecko";
import { rateLimit } from "@/lib/rate-limit";
import type { NetworkId } from "@/lib/types";

const bodySchema = z.object({
  network: z.enum(["polygon", "bsc", "arbitrum", "base"]),
  tx_hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  token: z.enum(["NATIVE", "USDT", "USDC", "USDC.e"]).optional(),
});

export async function processDepositVerification(
  userId: string,
  body: z.infer<typeof bodySchema>
) {
  const { network, tx_hash, token } = body;
  const normalizedHash = tx_hash.toLowerCase();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("deposits")
    .select("id, status, user_id")
    .eq("tx_hash", normalizedHash)
    .maybeSingle();

  if (existing) {
    if (existing.status === "verified") {
      return NextResponse.json(
        { error: "Transaction hash already used", status: "verified" },
        { status: 409 }
      );
    }
    if (existing.user_id !== userId) {
      return NextResponse.json(
        { error: "Transaction hash already used by another account", status: existing.status },
        { status: 409 }
      );
    }
    if (existing.status === "failed") {
      return NextResponse.json(
        { error: "This transaction was already marked failed. Contact support if this is wrong.", status: "failed" },
        { status: 409 }
      );
    }
  }

  let verification;
  try {
    verification = await verifyDepositTransaction(
      network as NetworkId,
      normalizedHash,
      token as DepositTokenId | undefined
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed" },
      { status: 500 }
    );
  }

  if (!verification.ok) {
    if (verification.pending) {
      return NextResponse.json(
        {
          error: verification.error,
          status: "pending",
          confirmations: verification.error.match(/(\d+)\/(\d+)/)?.[0],
        },
        { status: 202 }
      );
    }

    return NextResponse.json({ error: verification.error, status: "failed" }, { status: 400 });
  }

  const { transfer } = verification;

  let amountUsd: number;
  try {
    const price = await getTokenPriceUsd(transfer.coingeckoId);
    amountUsd = cryptoToUsd(transfer.amountCrypto, price);
  } catch {
    return NextResponse.json({ error: "Failed to fetch token price" }, { status: 502 });
  }

  if (amountUsd <= 0) {
    return NextResponse.json({ error: "Deposit amount too small" }, { status: 400 });
  }

  const { data: depositId, error: creditError } = await admin.rpc("credit_deposit", {
    p_user_id: userId,
    p_network: network,
    p_tx_hash: normalizedHash,
    p_amount_crypto: transfer.amountCrypto,
    p_amount_usd: amountUsd,
    p_token: transfer.tokenId,
  });

  if (creditError) {
    if (creditError.message.includes("already used")) {
      return NextResponse.json({ error: "Transaction hash already used", status: "verified" }, { status: 409 });
    }
    return NextResponse.json({ error: creditError.message }, { status: 500 });
  }

  const { data: userRow } = await admin.from("users").select("balance_usd").eq("id", userId).single();

  return NextResponse.json({
    deposit_id: depositId,
    amount_usd: amountUsd,
    amount_crypto: transfer.amountCrypto,
    token: transfer.tokenSymbol,
    token_id: transfer.tokenId,
    network: CHAINS[network as NetworkId].name,
    status: "verified",
    balance_usd: Number(userRow?.balance_usd ?? 0),
  });
}

export async function handleDepositVerifyRequest(request: Request, userId: string | undefined) {
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!rateLimit(`deposit-verify:${userId}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many verification attempts. Try again in a minute." }, { status: 429 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  return processDepositVerification(userId, body);
}
