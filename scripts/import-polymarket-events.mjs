import fs from "fs";

const events = JSON.parse(
  fs.readFileSync(new URL("./polymarket-events.json", import.meta.url), "utf8")
);

function mapCategory(tags) {
  const labels = (tags || []).map((t) => (t.label || "").toLowerCase());
  const has = (...keys) => labels.some((l) => keys.some((k) => l.includes(k)));
  if (has("sport", "nba", "nfl", "soccer", "mlb", "ufc", "f1", "tennis", "golf", "ncaa"))
    return "sports";
  if (has("crypto", "bitcoin", "ethereum", "defi", "solana")) return "crypto";
  if (
    has(
      "politic",
      "election",
      "trump",
      "president",
      "congress",
      "senate",
      "democrat",
      "republican"
    )
  )
    return "politics";
  if (has("tech", "ai", "science", "openai", "spacex")) return "tech";
  if (has("entertain", "movie", "music", "celebrity", "oscar", "grammy"))
    return "entertainment";
  if (has("world", "geopolit", "war", "iran", "israel", "ukraine", "china"))
    return "world";
  return "general";
}

function esc(s) {
  return String(s || "")
    .replace(/'/g, "''")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function topMarket(event) {
  const mkts = (event.markets || []).filter((m) => m.active && !m.closed);
  if (!mkts.length) return null;
  return mkts.reduce((best, m) => {
    const v = Number(m.volumeNum ?? m.volume ?? 0);
    const bv = Number(best.volumeNum ?? best.volume ?? 0);
    return v > bv ? m : best;
  }, mkts[0]);
}

const rows = [];
for (const ev of events.slice(0, 100)) {
  const m = topMarket(ev);
  if (!m) continue;

  let prices = [];
  try {
    prices = JSON.parse(m.outcomePrices || "[]").map(Number);
  } catch {
    prices = [0.5, 0.5];
  }

  const pYes = Math.min(0.99, Math.max(0.01, prices[0] || 0.5));
  const pNo = Math.min(0.99, Math.max(0.01, prices[1] || 1 - pYes));
  const vol = Number(m.volumeNum ?? m.volume ?? ev.volume ?? 0);
  const totalLiq = Math.max(1000, vol * 0.5);
  const yesPool = Math.round(totalLiq * (pYes / (pYes + pNo)) * 100) / 100;
  const noPool = Math.round(totalLiq * (pNo / (pYes + pNo)) * 100) / 100;
  const cpmmRy = 500 + yesPool;
  const cpmmRn = 500 + noPool;

  rows.push({
    title: esc(m.question || ev.title),
    description: esc(m.description || ev.description || ""),
    category: mapCategory(ev.tags),
    yesPool,
    noPool,
    cpmmRy,
    cpmmRn,
  });
}

const sql = rows
  .map(
    (r) =>
      `INSERT INTO public.events (title, description, category, status, total_yes_pool, total_no_pool, cpmm_ry, cpmm_rn) VALUES ('${r.title}', '${r.description}', '${r.category}', 'active', ${r.yesPool}, ${r.noPool}, ${r.cpmmRy}, ${r.cpmmRn});`
  )
  .join("\n");

fs.writeFileSync(new URL("./import-events.sql", import.meta.url), sql);
fs.writeFileSync(new URL("./import-events-summary.json", import.meta.url), JSON.stringify(rows, null, 2));

console.log(`Generated ${rows.length} events`);
const byCat = {};
for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + 1;
console.log("Categories:", byCat);
