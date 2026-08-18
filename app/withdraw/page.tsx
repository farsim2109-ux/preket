import { createClient } from "@/lib/supabase/server";
import { syncAndGetProfile } from "@/lib/get-profile";
import { redirect } from "next/navigation";
import { WithdrawForm } from "@/components/WithdrawForm";
import { formatUsd } from "@/lib/types";
import { MarketingTrustStrip } from "@/components/MarketingTrust";

export const dynamic = "force-dynamic";

export default async function WithdrawPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Keep the withdrawal page on the same canonical profile/balance source
  // used by the navbar and portfolio. The browser session may be blocked by
  // RLS from reading the users row directly, while syncAndGetProfile uses the
  // trusted server-side admin client and preserves the real account balance.
  const profile = await syncAndGetProfile({ id: user.id, email: user.email ?? undefined });
  const balance = Number(profile?.balance_usd ?? 0);

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Withdraw</h1>
      <p className="text-[var(--muted)] mb-2">
        Balance: {formatUsd(balance)}
      </p>
      <p className="text-sm text-[var(--muted)] mb-4">
        Submit a withdrawal request. An admin will manually send funds to your wallet.
      </p>
      <MarketingTrustStrip className="mb-8" />
      <WithdrawForm balance={balance} />
    </div>
  );
}
