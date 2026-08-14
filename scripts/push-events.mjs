import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();
if (!url || !key) throw new Error("Missing Supabase env");

const supabase = createClient(url, key);
const rows = JSON.parse(
  fs.readFileSync(new URL("./import-events-summary.json", import.meta.url), "utf8")
);

const { data: existing } = await supabase.from("events").select("title");
const existingTitles = new Set((existing ?? []).map((e) => e.title));

const toInsert = rows
  .filter((r) => !existingTitles.has(r.title))
  .map((r) => ({
    title: r.title,
    description: r.description,
    category: r.category,
    status: "active",
    total_yes_pool: r.yesPool,
    total_no_pool: r.noPool,
    cpmm_ry: r.cpmmRy,
    cpmm_rn: r.cpmmRn,
  }));

console.log(`Inserting ${toInsert.length} events (${rows.length - toInsert.length} skipped as duplicates)`);

for (let i = 0; i < toInsert.length; i += 20) {
  const chunk = toInsert.slice(i, i + 20);
  const { error } = await supabase.from("events").insert(chunk);
  if (error) {
    console.error("Batch failed at", i, error.message);
    process.exit(1);
  }
  console.log(`Inserted ${Math.min(i + 20, toInsert.length)} / ${toInsert.length}`);
}

const { count } = await supabase
  .from("events")
  .select("*", { count: "exact", head: true })
  .eq("status", "active");
console.log("Active events now:", count);
