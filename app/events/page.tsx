import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/EventCard";
import { Flame, TrendingUp, CheckCircle2, LayoutGrid, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { MarketingTrustStrip } from "@/components/MarketingTrust";
import type { EventStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

type StatusFilter = EventStatus | "all";
type MainCategory = {
  label: string;
  dbCategories?: string[];
  terms?: string[];
};
type Topic = { label: string; terms: string[]; categories: string[] };
type TopicCount = Topic & { count: number };

// Polymarket-style top-level market families. These are presentation/filter
// categories and do not change the database schema or stored event data.
const MAIN_CATEGORIES: MainCategory[] = [
  { label: "All" },
  { label: "Politics", dbCategories: ["politics"] },
  { label: "Sports", dbCategories: ["sports"] },
  { label: "Crypto", dbCategories: ["crypto"] },
  { label: "Esports", terms: ["esports", "esport", "league of legends", "lol", "cs2", "counter-strike", "dota", "valorant"] },
  { label: "Iran", terms: ["iran", "iranian"] },
  { label: "Finance", dbCategories: ["finance"] },
  { label: "Geopolitics", dbCategories: ["world"], terms: ["geopolitics", "geopolitical", "international relations"] },
  { label: "Tech", dbCategories: ["tech"] },
  { label: "Culture", dbCategories: ["entertainment"] },
  { label: "Economy", dbCategories: ["finance", "business"], terms: ["economy", "economic", "inflation", "gdp", "unemployment", "jobs report", "interest rate", "recession"] },
  { label: "Weather", terms: ["weather", "temperature", "forecast", "hurricane", "storm", "rainfall", "snowfall", "degrees"] },
  { label: "Mentions", terms: ["tweet", "tweets", "x post", "twitter", "mention", "mentions"] },
  { label: "Elections", terms: ["election", "elections", "primary", "primaries", "midterm", "midterms", "ballot", "vote", "voting"] },
  { label: "Art", terms: ["art", "artist", "artwork", "painting", "museum", "sculpture"] },
];

// The user's existing topic set is retained, but each topic now belongs to
// one or more top-level market families so the navigation feels hierarchical.
const TOPICS: Topic[] = [
  { label: "Trump", terms: ["trump"], categories: ["Politics"] },
  { label: "Laptop", terms: ["laptop"], categories: ["Tech"] },
  { label: "NFL Gameday", terms: ["nfl"], categories: ["Sports"] },
  { label: "UCL Matchday", terms: ["ucl", "champions league"], categories: ["Sports"] },
  { label: "AI Achievements", terms: ["ai", "artificial intelligence", "chatgpt", "gpt", "claude", "gemini"], categories: ["Tech"] },
  { label: "Sweden Elections", terms: ["sweden", "swedish"], categories: ["Politics", "Elections"] },
  { label: "Astra", terms: ["astra"], categories: ["Tech"] },
  { label: "GTA VI", terms: ["gta vi", "gta 6", "grand theft auto vi"], categories: ["Culture", "Tech"] },
  { label: "Fed", terms: ["federal reserve", "fed ", "fed's", "interest rate"], categories: ["Finance", "Economy"] },
  { label: "Iran", terms: ["iran", "iranian"], categories: ["Iran", "Geopolitics"] },
  { label: "September 8 and 9 Primaries", terms: ["september 8", "september 9", "sep 8", "sep 9", "primary", "primaries"], categories: ["Politics", "Elections"] },
  { label: "US Open", terms: ["us open"], categories: ["Sports"] },
  { label: "US Canada Trade War", terms: ["us-canada", "us canada", "canada trade", "trade war"], categories: ["Politics", "Geopolitics", "Economy"] },
  { label: "Russia", terms: ["russia", "russian"], categories: ["Geopolitics"] },
  { label: "Emmys", terms: ["emmy", "emmys"], categories: ["Culture"] },
  { label: "Lower Saxony", terms: ["lower saxony", "niedersachsen"], categories: ["Politics", "Elections"] },
  { label: "Anthropic IPO", terms: ["anthropic", "anthropic ipo"], categories: ["Tech", "Finance"] },
  { label: "Gaza", terms: ["gaza"], categories: ["Geopolitics"] },
  { label: "Berlin", terms: ["berlin"], categories: ["Politics", "Elections"] },
  { label: "Mecklenburg-Vorpommern", terms: ["mecklenburg-vorpommern"], categories: ["Politics", "Elections"] },
  { label: "Saxony-Anhalt", terms: ["saxony-anhalt"], categories: ["Politics", "Elections"] },
  { label: "Israel Election", terms: ["israel election", "israeli election"], categories: ["Politics", "Elections", "Geopolitics"] },
  { label: "Oil", terms: ["oil", "crude oil", "brent", "wti"], categories: ["Finance", "Economy"] },
  { label: "AI", terms: ["ai", "artificial intelligence"], categories: ["Tech"] },
  { label: "Earnings", terms: ["earnings", "revenue", "profit", "quarterly results"], categories: ["Finance", "Economy"] },
  { label: "Tweet Markets", terms: ["tweet", "tweets", "x post", "twitter"], categories: ["Mentions"] },
  { label: "Daily Temperature", terms: ["temperature", "degrees", "daily temperature"], categories: ["Weather"] },
  { label: "Cuba", terms: ["cuba", "cuban"], categories: ["Geopolitics", "Politics"] },
  { label: "Peace Deal", terms: ["peace deal", "peace agreement", "ceasefire"], categories: ["Geopolitics"] },
  { label: "Privates", terms: ["private company", "private market", "private valuation", "privates"], categories: ["Finance", "Tech"] },
  { label: "Strait of Hormuz", terms: ["strait of hormuz", "hormuz"], categories: ["Geopolitics", "Iran"] },
  { label: "Global Elections", terms: ["global election", "world election", "elections"], categories: ["Elections", "Politics"] },
  { label: "Midterms", terms: ["midterm", "midterms"], categories: ["Politics", "Elections"] },
  { label: "Movies", terms: ["movie", "movies", "film", "box office"], categories: ["Culture"] },
  { label: "Crypto Prices", terms: ["bitcoin", "btc", "ethereum", "eth", "solana", "crypto", "dogecoin", "xrp", "bnb"], categories: ["Crypto"] },
  { label: "Commodities", terms: ["commodity", "commodities", "gold", "silver", "copper"], categories: ["Finance", "Economy"] },
];

function buildUrl(status: StatusFilter, category?: string, topic?: string, search?: string, page?: number) {
  const params = new URLSearchParams();
  if (status !== "active") params.set("status", status);
  if (category && category !== "All") params.set("category", category);
  if (topic) params.set("topic", topic);
  if (search?.trim()) params.set("q", search.trim());
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/events${query ? `?${query}` : ""}`;
}

function termsWhere(terms: string[]) {
  return terms
    .map((term) => `title.ilike.%${term}%,description.ilike.%${term}%`)
    .join(",");
}

function categoryWhere(category?: MainCategory) {
  if (!category || category.label === "All") return "";
  const clauses = [
    ...(category.dbCategories ?? []).map((value) => `category.eq.${value}`),
    ...(category.terms ?? []).flatMap((term) => [
      `title.ilike.%${term}%`,
      `description.ilike.%${term}%`,
    ]),
  ];
  return clauses.join(",");
}

function topicMatchesCategory(topic: Topic, category?: MainCategory) {
  return !category || category.label === "All" || topic.categories.includes(category.label);
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; topic?: string; status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const statusFilter: StatusFilter =
    params.status === "resolved" || params.status === "all" ? params.status : "active";

  const categoryKey = params.category?.trim();
  const selectedCategory = categoryKey ? MAIN_CATEGORIES.find((category) => category.label === categoryKey) : undefined;
  const topicKey = params.topic?.trim();
  const selectedTopic = topicKey ? TOPICS.find((topic) => topic.label === topicKey) : undefined;
  const searchQuery = (params.q ?? "").trim().slice(0, 100);
  const safeSearch = searchQuery.replace(/[%,_]/g, " ").replace(/\s+/g, " ").trim();
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const selectedCategoryWhere = categoryWhere(selectedCategory);

  let eventsQuery = supabase
    .from("events")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (statusFilter !== "all") eventsQuery = eventsQuery.eq("status", statusFilter);
  if (selectedCategoryWhere) eventsQuery = eventsQuery.or(selectedCategoryWhere);
  if (selectedTopic?.terms.length) eventsQuery = eventsQuery.or(termsWhere(selectedTopic.terms));
  if (safeSearch) {
    eventsQuery = eventsQuery.or(
      `title.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%,category.ilike.%${safeSearch}%`,
    );
  }

  const { data: events, count: eventsCount } = await eventsQuery;

  const activeCountFor = async (category?: MainCategory) => {
    let query = supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    const where = categoryWhere(category);
    if (where) query = query.or(where);
    const { count } = await query;
    return count ?? 0;
  };

  // Exact active counts are calculated with HEAD requests, so the UI is not
  // affected by PostgREST's normal row-return limit.
  const mainCategoryCounts = await Promise.all(
    MAIN_CATEGORIES.map(async (category) => ({ label: category.label, count: await activeCountFor(category) })),
  );

  const visibleTopics = TOPICS.filter((topic) => topicMatchesCategory(topic, selectedCategory));
  const topicCounts = await Promise.all(
    visibleTopics.map(async (topic): Promise<TopicCount> => {
      let query = supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .or(termsWhere(topic.terms));
      const where = categoryWhere(selectedCategory);
      if (where) query = query.or(where);
      const { count } = await query;
      return { ...topic, count: count ?? 0 };
    }),
  );

  const activeCount = mainCategoryCounts[0]?.count ?? 0;
  const { count: resolvedCount } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("status", "resolved");
  const { count: allMarketsCount } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true });

  const totalPages = Math.max(1, Math.ceil((eventsCount ?? 0) / PAGE_SIZE));
  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const statusTabs = [
    { id: "active" as const, label: "Active", count: activeCount, icon: <Flame className="h-4 w-4" /> },
    { id: "resolved" as const, label: "Resolved", count: resolvedCount ?? 0, icon: <CheckCircle2 className="h-4 w-4" /> },
    { id: "all" as const, label: "All markets", count: allMarketsCount ?? 0, icon: <LayoutGrid className="h-4 w-4" /> },
  ];

  const selectedTopicCount = selectedTopic
    ? topicCounts.find((topic) => topic.label === selectedTopic.label)?.count ?? 0
    : null;

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
              <TrendingUp className="h-4 w-4" /> {activeCount} active
            </span>
          </div>
          <MarketingTrustStrip className="mt-6" />
        </div>
      </div>

      <div className="sticky top-16 z-40 border-b border-[var(--card-border)] bg-[var(--background)]/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {MAIN_CATEGORIES.map((category) => {
              const isSelected =
                (category.label === "All" && !selectedCategory) || selectedCategory?.label === category.label;
              const count = mainCategoryCounts.find((item) => item.label === category.label)?.count ?? 0;
              return (
                <Link
                  key={category.label}
                  href={buildUrl(statusFilter, category.label === "All" ? undefined : category.label, undefined, safeSearch)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
                    isSelected
                      ? "border-white bg-white text-black"
                      : "border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:border-zinc-500 hover:text-white"
                  }`}
                >
                  <span>{category.label}</span>
                  <span className={`text-xs tabular-nums ${isSelected ? "text-zinc-600" : "text-zinc-500"}`}>{count}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-3 border-t border-zinc-800/80 pt-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
              {selectedCategory ? `${selectedCategory.label} topics` : "Topics"}
            </div>
            <div className="flex flex-wrap gap-2">
              {topicCounts.map((topic) => {
                const isSelected = selectedTopic?.label === topic.label;
                return (
                  <Link
                    key={topic.label}
                    href={buildUrl(statusFilter, selectedCategory?.label, topic.label, safeSearch)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      isSelected
                        ? "border-indigo-400/60 bg-indigo-500/15 text-indigo-200"
                        : "border-zinc-800 bg-zinc-950/50 text-zinc-500 hover:border-zinc-600 hover:text-zinc-200"
                    }`}
                  >
                    <span>{topic.label}</span>
                    <span className="tabular-nums text-zinc-600">{topic.count}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 md:py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {statusTabs.map((tab) => (
              <Link
                key={tab.id}
                href={buildUrl(tab.id, selectedCategory?.label, selectedTopic?.label, searchQuery)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                  statusFilter === tab.id
                    ? "border-white bg-white text-black"
                    : "border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-zinc-500 hover:text-white"
                }`}
              >
                {tab.icon}
                {tab.label}
                <span className={`tabular-nums ${statusFilter === tab.id ? "text-zinc-600" : "text-zinc-500"}`}>{tab.count}</span>
              </Link>
            ))}
          </div>

          <form action="/events" method="get" className="w-full md:max-w-sm">
            {selectedCategory && <input type="hidden" name="category" value={selectedCategory.label} />}
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
                <Link href={buildUrl(statusFilter, selectedCategory?.label, selectedTopic?.label, "")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-500 hover:text-white">
                  <X className="h-4 w-4" />
                </Link>
              )}
            </div>
          </form>
        </div>

        {(selectedCategory || selectedTopic) && (
          <div className="mt-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">{selectedTopic?.label ?? selectedCategory?.label}</h2>
              <p className="text-sm text-zinc-500">
                {selectedTopic ? `${selectedTopicCount ?? 0} active markets matching this topic` : `${mainCategoryCounts.find((item) => item.label === selectedCategory?.label)?.count ?? 0} active markets in this category`}
              </p>
            </div>
          </div>
        )}

        {!events?.length ? (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-700 py-20 text-center">
            <p className="mb-3 text-4xl">📭</p>
            <p className="font-medium text-zinc-400">No markets found</p>
            <p className="mt-1 text-sm text-zinc-600">Try another category, topic, or search term.</p>
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => <EventCard key={event.id} event={event} />)}
            </div>

            {totalPages > 1 && (
              <div className="mt-10 flex items-center justify-between gap-4">
                {currentPage > 1 ? (
                  <Link href={buildUrl(statusFilter, selectedCategory?.label, selectedTopic?.label, searchQuery, currentPage - 1)} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white">
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Link>
                ) : <span />}
                <span className="text-sm text-zinc-500">Page {currentPage} of {totalPages} · {eventsCount ?? 0} markets</span>
                {currentPage < totalPages ? (
                  <Link href={buildUrl(statusFilter, selectedCategory?.label, selectedTopic?.label, searchQuery, currentPage + 1)} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/50 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white">
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
