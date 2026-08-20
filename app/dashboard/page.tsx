import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAndGetProfile } from "@/lib/get-profile";
import { redirect } from "next/navigation";
import { PortfolioDashboard } from "@/components/PortfolioDashboard";
import { WithdrawalStatusToast } from "@/components/WithdrawalStatusToast";
import { buildHistory, buildPositions, summarizePortfolio, type PortfolioBet } from "@/lib/portfolio";
import { User } from "lucide-react";
import { MarketingTrustStrip } from "@/components/MarketingTrust";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const profile = await syncAndGetProfile({ id: user.id, email: user.email ?? undefined });
  const admin = createAdminClient();

  // Trades are scoped to the authenticated user's verified id but read by the
  // trusted server client so an RLS read policy cannot hide positions that were
  // successfully created by the trade RPC.
  const [{ data: bets, error: betsError }, { data: deposits }, { data: withdrawals }] = await Promise.all([
    admin.from("bets").select("id, event_id, outcome, amount_usd, entry_price, shares, trade_type, fee_usd, cpmm_per_pm, payout_usd, status, created_at, events(id, title, status, category, total_yes_pool, total_no_pool, cpmm_ry, cpmm_rn)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    admin.from("deposits").select("id, network, token, amount_crypto, amount_usd, status, tx_hash, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    admin.from("withdrawals").select("id, network, wallet_address, amount_usd, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  if (betsError) console.error("[portfolio] failed to load bets", { userId: user.id, error: betsError.message });

  const portfolioBets: PortfolioBet[] = (bets ?? []).map((bet) => {
    const ev = bet.events;
    const event = Array.isArray(ev) ? ev[0] : ev;
    return { ...bet, events: event } as PortfolioBet;
  });
  const positions = buildPositions(portfolioBets);
  const history = buildHistory(portfolioBets);
  const depositHistory = (deposits ?? []).map((d) => ({ id: d.id, network: d.network, token: d.token ?? "NATIVE", amountCrypto: Number(d.amount_crypto), amountUsd: Number(d.amount_usd), status: d.status, txHash: d.tx_hash, createdAt: d.created_at }));
  const withdrawalHistory = (withdrawals ?? []).map((w) => ({ id: w.id, network: w.network, walletAddress: w.wallet_address, amountUsd: Number(w.amount_usd), status: w.status, createdAt: w.created_at }));
  const cash = Number(profile?.balance_usd ?? 0);
  const summary = summarizePortfolio(cash, positions);
  const latestWithdrawal = withdrawalHistory[0] ?? null;

  return <div className="mx-auto max-w-6xl px-4 py-8">
    <WithdrawalStatusToast withdrawal={latestWithdrawal} />
    <div className="flex items-center justify-between mb-8"><div><h1 className="text-2xl font-bold">Portfolio</h1><p className="text-sm text-zinc-500 mt-1">{profile?.display_name || profile?.username ? `@${profile.username ?? profile.display_name}` : user.email}</p></div><Link href="/profile" className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-2 text-sm hover:border-zinc-500 transition-colors"><User className="h-4 w-4" />Edit profile</Link></div>
    <MarketingTrustStrip className="mb-8" />
    <PortfolioDashboard summary={summary} positions={positions} history={history} deposits={depositHistory} withdrawals={withdrawalHistory} />
  </div>;
}
