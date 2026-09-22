// Apply one additive .sql migration to the database. Unlike reset-db.mjs this
// never drops anything, so it is safe against live student data.
//
//   node --env-file=.env scripts/apply-migration.mjs migrations/001_shared_resources.sql
//
// The whole file runs inside one transaction: either every statement lands or
// none of them do. Migrations are written to be idempotent, so re-running one
// is harmless.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neonConfig, Pool } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.env scripts/apply-migration.mjs <file.sql>");
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node --env-file=.env scripts/apply-migration.mjs migrations/001_shared_resources.sql");
  process.exit(1);
}

neonConfig.webSocketConstructor = globalThis.WebSocket;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = resolve(root, file);

let text;
try {
  text = readFileSync(path, "utf8");
} catch {
  console.error(`Cannot read ${path}`);
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(text);
  await client.query("COMMIT");
  console.log(`Applied ${file}`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error(`\nMigration failed, nothing changed: ${e.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
