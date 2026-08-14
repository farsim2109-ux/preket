import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/EventCard";
import { getCategoryMeta } from "@/lib/market-ui";
import type { EventStatus } from "@/lib/types";
import { Flame, TrendingUp, CheckCircle2, LayoutGrid } from "lucide-react";
import { MarketingTrustStrip } from "@/components/MarketingTrust";

export const dynamic = "force-dynamic";

type StatusFilter = EventStatus | "all";

function buildUrl(status: StatusFilter, category?: string) {
  const params = new URLSearchParams();
  if (status !== "active") params.set("status", status);
  if (category) params.set("category", category);
  const q = params.toString();
  return `/events${q ? `?${q}` : ""}`;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const statusFilter: StatusFilter =
    params.status === "resolved" || params.status === "all"
      ? params.status
      : "active";

  const categoryFilter = params.category?.toLowerCase().trim();

  let eventsQuery = supabase.from("events").select("*").order("created_at", { ascending: false });
  if (statusFilter !== "all") eventsQuery = eventsQuery.eq("status", statusFilter);
  if (categoryFilter) eventsQuery = eventsQuery.ilike("category", categoryFilter);

  let categoriesQuery = supabase.from("events").select("category");
  if (statusFilter !== "all") categoriesQuery = categoriesQuery.eq("status", statusFilter);

  const [{ data: events }, { data: categoryRows }] = await Promise.all([
    eventsQuery,
    categoriesQuery,
  ]);

  const categories = Array.from(
    new Set((categoryRows ?? []).map((r) => r.category.toLowerCase().trim()))
  ).sort();

  const { count: activeCount } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  const statusTabs = [
    { id: "active" as const, label: "Active", icon: <Flame className="h-4 w-4" /> },
    { id: "resolved" as const, label: "Resolved", icon: <CheckCircle2 className="h-4 w-4" /> },
    { id: "all" as const, label: "All", icon: <LayoutGrid className="h-4 w-4" /> },
  ];

  const emptyMessages: Record<StatusFilter, { title: string; sub: string }> = {
    active: { title: "No active markets", sub: "New markets will appear here when an admin creates them." },
    resolved: { title: "No resolved markets", sub: "Completed markets will show here after admin resolution." },
    cancelled: { title: "No cancelled markets", sub: "Cancelled markets are archived here for reference." },
    all: { title: "No markets yet", sub: "Create one from the Admin dashboard." },
  };

  return (
    <div className="min-h-screen">
      <div className="border-b border-[var(--card-border)] bg-gradient-to-b from-indigo-950/40 to-transparent">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="h-5 w-5 text-orange-400" />
            <span className="text-sm font-medium text-orange-400">Live Prediction Markets</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2">Markets</h1>
          <p className="text-zinc-400 max-w-xl">
            Trade on real-world outcomes. Buy Yes or No — prices move with the crowd.
          </p>
          <div className="mt-4 flex gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-emerald-400">
              <TrendingUp className="h-4 w-4" />
              {activeCount ?? 0} active
            </span>
          </div>
          <MarketingTrustStrip className="mt-6" />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Status tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {statusTabs.map((tab) => (
            <Link
              key={tab.id}
              href={buildUrl(tab.id, params.category)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                statusFilter === tab.id
                  ? "bg-white text-black border-white shadow-lg shadow-white/10"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white bg-zinc-900/50"
              }`}
            >
              {tab.icon}
              {tab.label}
            </Link>
          ))}
        </div>

        {/* Category filters */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <CategoryPill
              href={buildUrl(statusFilter)}
              label="All categories"
              active={!params.category}
            />
            {categories.map((cat) => {
              const meta = getCategoryMeta(cat);
              return (
                <CategoryPill
                  key={cat}
                  href={buildUrl(statusFilter, cat)}
                  label={`${meta.emoji} ${meta.label}`}
                  active={categoryFilter === cat}
                />
              );
            })}
          </div>
        )}

        {!events?.length ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-zinc-700">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-zinc-400 font-medium">{emptyMessages[statusFilter].title}</p>
            <p className="text-sm text-zinc-600 mt-1">{emptyMessages[statusFilter].sub}</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryPill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
        active
          ? "bg-indigo-600 text-white border-indigo-500"
          : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white bg-zinc-900/50"
      }`}
    >
      {label}
    </Link>
  );
}
