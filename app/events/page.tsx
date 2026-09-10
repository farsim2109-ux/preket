import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/EventCard";
import { getCategoryMeta } from "@/lib/market-ui";
import type { EventStatus } from "@/lib/types";
import { Flame, TrendingUp, CheckCircle2, LayoutGrid, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { MarketingTrustStrip } from "@/components/MarketingTrust";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;
const MARKET_CATEGORIES = ["sports", "politics", "crypto", "tech", "entertainment", "finance", "business", "world", "general"];

type StatusFilter = EventStatus | "all";

function buildUrl(status: StatusFilter, category?: string, search?: string, page?: number) {
  const params = new URLSearchParams();
  if (status !== "active") params.set("status", status);
  if (category) params.set("category", category);
  if (search?.trim()) params.set("q", search.trim());
  if (page && page > 1) params.set("page", String(page));
  const q = params.toString();
  return `/events${q ? `?${q}` : ""}`;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const statusFilter: StatusFilter =
    params.status === "resolved" || params.status === "all"
      ? params.status
      : "active";

  const categoryFilter = params.category?.toLowerCase().trim();
  const searchQuery = (params.q ?? "").trim().slice(0, 100);
  const safeSearch = searchQuery.replace(/[%,_]/g, " ").replace(/\s+/g, " ").trim();
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let eventsQuery = supabase
    .from("events")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (statusFilter !== "all") eventsQuery = eventsQuery.eq("status", statusFilter);
  if (categoryFilter) eventsQuery = eventsQuery.ilike("category", categoryFilter);
  if (safeSearch) {
    eventsQuery = eventsQuery.or(
      `title.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%,category.ilike.%${safeSearch}%`,
    );
  }

  // Never fetch thousands of category rows just to calculate badges. Exact
  // counts are cheap and, unlike a normal select, are not capped at 1,000 rows.
  const activeCountQuery = supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const categoryCountQueries = MARKET_CATEGORIES.map((category) =>
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .ilike("category", category),
  );

  const [{ data: events, count: eventsCount }, { count: activeCount }, ...categoryResults] = await Promise.all([
    eventsQuery,
    activeCountQuery,
    ...categoryCountQueries,
  ]);

  const categories = MARKET_CATEGORIES.filter((category, index) => (categoryResults[index]?.count ?? 0) > 0);
  const categoryCounts = new Map(
    MARKET_CATEGORIES.map((category, index) => [category, categoryResults[index]?.count ?? 0]),
  );

  const totalPages = Math.max(1, Math.ceil((eventsCount ?? 0) / PAGE_SIZE));
  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

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
        <div className="flex flex-wrap gap-2 mb-5">
          {statusTabs.map((tab) => (
            <Link
              key={tab.id}
              href={buildUrl(tab.id, params.category, searchQuery)}
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

        <form action="/events" method="get" className="mb-6">
          {categoryFilter && <input type="hidden" name="category" value={categoryFilter} />}
          {statusFilter !== "active" && <input type="hidden" name="status" value={statusFilter} />}
          <div className="relative max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              name="q"
              defaultValue={searchQuery}
              placeholder="Search any market..."
              aria-label="Search markets"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900/70 py-3 pl-11 pr-11 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            {searchQuery && (
              <Link
                href={buildUrl(statusFilter, categoryFilter, "")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Link>
            )}
          </div>
        </form>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <CategoryPill
              href={buildUrl(statusFilter, undefined, searchQuery)}
              label="All categories"
              count={activeCount ?? 0}
              active={!params.category}
            />
            {categories.map((cat) => {
              const meta = getCategoryMeta(cat);
              return (
                <CategoryPill
                  key={cat}
                  href={buildUrl(statusFilter, cat, searchQuery)}
                  label={`${meta.emoji} ${meta.label}`}
                  count={categoryCounts.get(cat) ?? 0}
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
            <p className="text-sm text-zinc-600 mt-1">{safeSearch ? `No markets matched “${safeSearch}”.` : emptyMessages[statusFilter].sub}</p>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-10 flex items-center justify-between gap-4">
                {hasPrevious ? (
                  <Link
                    href={buildUrl(statusFilter, categoryFilter, searchQuery, currentPage - 1)}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-sm text-zinc-500">
                  Page {currentPage} of {totalPages} · {eventsCount ?? 0} markets
                </span>
                {hasNext ? (
                  <Link
                    href={buildUrl(statusFilter, categoryFilter, searchQuery, currentPage + 1)}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CategoryPill({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
        active
          ? "bg-indigo-600 text-white border-indigo-500"
          : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white bg-zinc-900/50"
      }`}
    >
      <span>{label}</span>
      <span
        className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] leading-none ${
          active ? "bg-white/15 text-white" : "bg-zinc-800 text-zinc-400"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}
