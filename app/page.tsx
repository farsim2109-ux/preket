import Link from "next/link";
import { ArrowRight, Zap, Shield, Coins } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  MarketingAuditorBadges,
  MarketingHeroStats,
  MarketingHighlightCards,
  MarketingMarquee,
} from "@/components/MarketingTrust";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let activeCount = 0;
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");
    activeCount = count ?? 0;
  } catch {
    // Supabase not configured yet
  }

  return (
    <div>
      <section className="relative overflow-hidden border-b border-[var(--card-border)]">
        <div className="mx-auto max-w-6xl px-4 py-24 text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Predict the future.
            <br />
            <span className="text-[var(--accent)]">Trade with confidence.</span>
          </h1>
          <p className="text-lg text-[var(--muted)] max-w-2xl mx-auto mb-8">
            Preket is a hybrid prediction market platform. Deposit crypto, bet in USD,
            and win — no gas fees, no smart contracts, instant pari-mutuel payouts.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/events"
              className="inline-flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium"
            >
              Browse Markets
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/auth/signup"
              className="inline-flex items-center justify-center gap-2 border border-[var(--card-border)] hover:bg-[var(--card)] px-6 py-3 rounded-lg font-medium"
            >
              Get Started
            </Link>
          </div>
          {activeCount > 0 && (
            <p className="mt-8 text-sm text-[var(--muted)]">
              {activeCount} active market{activeCount !== 1 ? "s" : ""} live now
            </p>
          )}
          <div className="mt-10">
            <MarketingHeroStats />
          </div>
        </div>
      </section>

      <MarketingMarquee />

      <MarketingHighlightCards />

      <MarketingAuditorBadges />

      <div className="pb-16" />

      <section className="mx-auto max-w-6xl px-4 py-16 grid md:grid-cols-3 gap-8">
        <FeatureCard
          icon={<Zap className="h-6 w-6 text-yellow-400" />}
          title="No Gas Fees"
          description="Trade entirely off-chain with a custodial USD ledger. Your bets settle instantly."
        />
        <FeatureCard
          icon={<Coins className="h-6 w-6 text-[var(--accent)]" />}
          title="Multi-Chain Deposits"
          description="Fund your account via Polygon, BSC, Arbitrum, or Base. Verified on-chain, credited in USD."
        />
        <FeatureCard
          icon={<Shield className="h-6 w-6 text-[var(--yes)]" />}
          title="Secure Ledger"
          description="Every balance change is atomic in Postgres. No race conditions, no double-spending."
        />
      </section>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
      <div className="mb-4">{icon}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-[var(--muted)]">{description}</p>
    </div>
  );
}
