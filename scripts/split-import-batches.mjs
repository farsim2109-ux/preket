import fs from "fs";

const sql = fs.readFileSync(new URL("./import-events.sql", import.meta.url), "utf8");
const statements = sql.split(/;\s*\n/).filter((s) => s.trim());
const batchSize = 10;
const batches = [];
for (let i = 0; i < statements.length; i += batchSize) {
  batches.push(statements.slice(i, i + batchSize).map((s) => s.trim() + ";").join("\n"));
}
console.log("statements", statements.length, "batches", batches.length);
batches.forEach((b, i) => {
  fs.writeFileSync(new URL(`./import-batch-${i + 1}.sql`, import.meta.url), b);
  console.log(`batch ${i + 1}: ${b.length} chars`);
});
