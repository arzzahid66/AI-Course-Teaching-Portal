// Back up every table in the database to JSON, then (only with --confirm) drop
// all tables and install the fresh schema from migration.sql.
//
//   node --env-file=.env scripts/reset-db.mjs            # backup only
//   node --env-file=.env scripts/reset-db.mjs --confirm  # backup, wipe, reinstall
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.env scripts/reset-db.mjs");
  process.exit(1);
}
neonConfig.webSocketConstructor = globalThis.WebSocket;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const confirm = process.argv.includes("--confirm");
const sql = neon(url);

const tables = (
  await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
).map((r) => r.tablename);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = join(root, "backups", stamp);
mkdirSync(dir, { recursive: true });

let total = 0;
for (const t of tables) {
  const rows = await sql(`SELECT * FROM "${t}"`);
  writeFileSync(join(dir, `${t}.json`), JSON.stringify(rows, null, 2));
  total += rows.length;
  console.log(`backed up ${t}: ${rows.length} rows`);
}
console.log(`\nBackup: ${tables.length} tables, ${total} rows -> ${dir}`);

if (!confirm) {
  console.log("\nNothing deleted. Re-run with --confirm to wipe and install the new schema.");
  process.exit(0);
}

const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const t of tables) await client.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
  await client.query("DROP SEQUENCE IF EXISTS receipt_seq");
  await client.query(readFileSync(join(root, "migration.sql"), "utf8"));
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("\nReset failed, nothing changed:", e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

if (!process.exitCode) {
  const counts = await sql`
    SELECT (SELECT count(*) FROM weekends) AS weekends,
           (SELECT count(*) FROM course_levels) AS levels,
           (SELECT count(*) FROM payment_accounts) AS accounts`;
  console.log("\nWiped and reinstalled. Seeded:", counts[0]);
}
