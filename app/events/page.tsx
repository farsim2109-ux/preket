import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/EventCard";
import { Flame, TrendingUp, CheckCircle2, LayoutGrid, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { MarketingTrustStrip } from "@/components/MarketingTrust";
import type { EventStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

type StatusFilter = EventStatus | "all";

type Topic = { label: string; terms: string[] };

// These are user-facing market topics, intentionally separate from the
// existing broad DB categories (sports/politics/etc.). A market can match
// multiple topics without changing its stored category.
const TOPICS: Topic[] = [
  { label: "All", terms: [] },
  { label: "Trump", terms: ["trump"] },
  { label: "Laptop", terms: ["laptop"] },
  { label: "NFL Gameday", terms: ["nfl"] },
  { label: "UCL Matchday", terms: ["ucl", "champions league"] },
  { label: "AI Achievements", terms: ["ai", "artificial intelligence", "chatgpt", "gpt", "claude", "gemini"] },
  { label: "Sweden Elections", terms: ["sweden", "swedish"] },
  { label: "Astra", terms: ["astra"] },
  { label: "GTA VI", terms: ["gta vi", "gta 6", "grand theft auto vi"] },
  { label: "Fed", terms: ["federal reserve", "fed ", "fed's", "interest rate"] },
  { label: "Iran", terms: ["iran", "iranian"] },
  { label: "September 8 and 9 Primaries", terms: ["september 8", "september 9", "sep 8", "sep 9", "primary", "primaries"] },
  { label: "US Open", terms: ["us open"] },
  { label: "US Canada Trade War", terms: ["us-canada", "us canada", "canada trade", "trade war"] },
  { label: "Russia", terms: ["russia", "russian"] },
  { label: "Emmys", terms: ["emmy", "emmys"] },
  { label: "Lower Saxony", terms: ["lower saxony", "niedersachsen"] },
  { label: "Anthropic IPO", terms: ["anthropic", "anthropic ipo"] },
  { label: "Gaza", terms: ["gaza"] },
  { label: "Berlin", terms: ["berlin"] },
  { label: "Mecklenburg-Vorpommern", terms: ["mecklenburg-vorpommern"] },
  { label: "Saxony-Anhalt", terms: ["saxony-anhalt"] },
  { label: "Israel Election", terms: ["israel election", "israeli election"] },
  { label: "Oil", terms: ["oil", "crude oil", "brent", "wti"] },
  { label: "AI", terms: ["ai", "artificial intelligence"] },
  { label: "Earnings", terms: ["earnings", "revenue", "profit", "quarterly results"] },
  { label: "Tweet Markets", terms: ["tweet", "tweets", "x post", "twitter"] },
  { label: "Daily Temperature", terms: ["temperature", "degrees", "daily temperature"] },
  { label: "Cuba", terms: ["cuba", "cuban"] },
  { label: "Peace Deal", terms: ["peace deal", "peace agreement", "ceasefire"] },
  { label: "Privates", terms: ["private company", "private market", "private valuation", "privates"] },
  { label: "Strait of Hormuz", terms: ["strait of hormuz", "hormuz"] },
  { label: "Global Elections", terms: ["global election", "world election", "elections"] },
  { label: "Midterms", terms: ["midterm", "midterms"] },
  { label: "Movies", terms: ["movie", "movies", "film", "box office"] },
  { label: "Crypto Prices", terms: ["bitcoin", "btc", "ethereum", "eth", "solana", "crypto", "price"] },
  { label: "Commodities", terms: ["commodity", "commodities", "gold", "silver", "copper"] },
];

function buildUrl(status: StatusFilter, topic?: string, search?: string, page?: number) {
  const params = new URLSearchParams();
  if (status !== "active") params.set("status", status);
  if (topic) params.set("topic", topic);
  if (search?.trim()) params.set("q", search.trim());
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/events${query ? `?${query}` : ""}`;
}

function topicWhere(terms: string[]) {
  return terms
    .map((term) => `title.ilike.%${term}%,description.ilike.%${term}%`)
    .join(",");
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const statusFilter: StatusFilter =
    params.status === "resolved" || params.status === "all" ? params.status : "active";

  const topicKey = params.topic?.trim();
  const selectedTopic = topicKey ? TOPICS.find((topic) => topic.label === topicKey) : undefined;
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
  if (selectedTopic?.terms.length) eventsQuery = eventsQuery.or(topicWhere(selectedTopic.terms));
  if (safeSearch) {
    eventsQuery = eventsQuery.or(
      `title.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%,category.ilike.%${safeSearch}%`,
    );
  }

  const { data: events, count: eventsCount } = await eventsQuery;
  const { count: activeCount } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const totalPages = Math.max(1, Math.ceil((eventsCount ?? 0) / PAGE_SIZE));
  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const statusTabs = [
    { id: "active" as const, label: "Active", icon: <Flame className="h-4 w-4" /> },
    { id: "resolved" as const, label: "Resolved", icon: <CheckCircle2 className="h-4 w-4" /> },
    { id: "all" as const, label: "All markets", icon: <LayoutGrid className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="border-b border-[var(--card-border)] bg-gradient-to-b from-indigo-950/40 to-transparent">
        <div className="mx-auto max-w-7xl px-4 py-8 md:py-10">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="h-5 w-5 text-orange-400" />
            <span className="text-sm font-medium text-orange-400">Live Prediction Markets</span>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white mb-2">Markets</h1>
              <p className="text-zinc-400 max-w-xl">Trade on real-world outcomes. Buy Yes or No — prices move with the crowd.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-sm text-emerald-400">
              <TrendingUp className="h-4 w-4" /> {activeCount ?? 0} active
            </span>
          </div>
          <MarketingTrustStrip className="mt-6" />
        </div>
      </div>

      <div className="sticky top-16 z-40 border-b border-[var(--card-border)] bg-[var(--background)]/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {TOPICS.map((topic) => (
              <Link
                key={topic.label}
                href={buildUrl(statusFilter, topic.label === "All" ? undefined : topic.label, safeSearch)}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                  (topic.label === "All" && !selectedTopic) || selectedTopic?.label === topic.label
                    ? "border-white bg-white text-black"
                    : "border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:border-zinc-500 hover:text-white"
                }`}
              >
                {topic.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 md:py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2">
            {statusTabs.map((tab) => (
              <Link
                key={tab.id}
                href={buildUrl(tab.id, selectedTopic?.label, searchQuery)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                  statusFilter === tab.id
                    ? "border-white bg-white text-black"
                    : "border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-zinc-500 hover:text-white"
                }`}
              >
                {tab.icon}{tab.label}
              </Link>
            ))}
          </div>

          <form action="/events" method="get" className="w-full md:max-w-sm">
            {selectedTopic && <input type="hidden" name="topic" value={selectedTopic.label} />}
            {statusFilter !== "active" && <input type="hidden" name="status" value={statusFilter} />}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                name="q"
                defaultValue={searchQuery}
                placeholder="Search markets..."
                aria-label="Search markets"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900/70 py-2.5 pl-11 pr-11 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              {searchQuery && (
                <Link href={buildUrl(statusFilter, selectedTopic?.label, "")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-500 hover:text-white">
                  <X className="h-4 w-4" />
                </Link>
              )}
            </div>
          </form>
        </div>

        {selectedTopic && (
          <div className="mt-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">{selectedTopic.label}</h2>
              <p className="text-sm text-zinc-500">Markets matching this topic</p>
            </div>
          </div>
        )}

        {!events?.length ? (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-700 py-20 text-center">
            <p className="mb-3 text-4xl">📭</p>
            <p className="font-medium text-zinc-400">No markets found</p>
            <p className="mt-1 text-sm text-zinc-600">Try another topic or search term.</p>
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => <EventCard key={event.id} event={event} />)}
            </div>

            {totalPages > 1 && (
              <div className="mt-10 flex items-center justify-between gap-4">
                {hasPrevious ? (
                  <Link href={buildUrl(statusFilter, selectedTopic?.label, searchQuery, currentPage - 1)} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white">
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Link>
                ) : <span />}
                <span className="text-sm text-zinc-500">Page {currentPage} of {totalPages} · {eventsCount ?? 0} markets</span>
                {hasNext ? (
                  <Link href={buildUrl(statusFilter, selectedTopic?.label, searchQuery, currentPage + 1)} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white">
                    Next <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : <span />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
