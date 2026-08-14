import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runBatch(fileName) {
  const sql = fs.readFileSync(path.join(__dirname, fileName), "utf8").replace(/;;+/g, ";");
  const projectId = "eemggnjdknqutlidyvpa";
  const url = `https://api.supabase.com/v1/projects/${projectId}/database/query`;

  // Use MCP via stdout for manual - this script prints SQL length only
  console.log(fileName, sql.length, (sql.match(/INSERT/g) || []).length, "inserts");
}

for (let i = 2; i <= 10; i++) {
  await runBatch(`import-batch-${i}.sql`);
}
