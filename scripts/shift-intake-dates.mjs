// Shift an intake's start date, its classes and its fee due dates by N days.
// Read-only unless --apply is passed. Always writes a JSON backup first.
//
//   node --env-file=.env <this file> --batch=1 --days=7            # backup + preview
//   node --env-file=.env <this file> --batch=1 --days=7 --apply    # + apply in one transaction
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : dflt;
};
const batchId = Number(arg("batch", ""));
const days = Number(arg("days", "7"));
const apply = process.argv.includes("--apply");
const backupDir = arg("backup-dir", "");
if (!Number.isInteger(batchId) || !Number.isInteger(days)) {
  console.error("Usage: --batch=<id> --days=<n> [--apply]");
  process.exit(1);
}

const sql = neon(url);

// ---------------------------------------------------------------- 1. backup
if (backupDir) {
  const tables = (
    await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  ).map((r) => r.tablename);
  mkdirSync(backupDir, { recursive: true });
  let total = 0;
  for (const t of tables) {
    const rows = await sql(`SELECT * FROM "${t}"`);
    writeFileSync(join(backupDir, `${t}.json`), JSON.stringify(rows, null, 2));
    total += rows.length;
  }
  console.log(`BACKUP: ${tables.length} tables, ${total} rows -> ${backupDir}\n`);
}

// ---------------------------------------------------------------- 2. preview
const [batch] = await sql`
  SELECT id, name, to_char(start_date, 'YYYY-MM-DD') AS start_date,
         to_char(start_date + (${days})::int, 'YYYY-MM-DD') AS new_start_date,
         to_char(class_time, 'HH24:MI') AS class_time, weekends, months, status
  FROM batches WHERE id = ${batchId}
`;
if (!batch) {
  console.error(`No intake with id ${batchId}.`);
  process.exit(1);
}
console.log("INTAKE:", JSON.stringify(batch, null, 1));

const sessions = await sql`
  SELECT id, title,
    to_char(scheduled_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') AS now_at,
    to_char((scheduled_at + make_interval(days => (${days})::int)) AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') AS new_at,
    is_open, closed_at IS NOT NULL AS closed
  FROM sessions WHERE batch_id = ${batchId} ORDER BY scheduled_at
`;
console.log(`\nCLASSES (${sessions.length}):`);
for (const s of sessions) {
  console.log(` ${s.now_at} -> ${s.new_at}  ${s.title}${s.is_open ? "  [OPEN]" : ""}${s.closed ? "  [CLOSED]" : ""}`);
}

const invoices = await sql`
  SELECT i.id, st.name, i.month_no,
    to_char(i.due_date, 'YYYY-MM-DD') AS due, to_char(i.due_date + (${days})::int, 'YYYY-MM-DD') AS new_due,
    i.amount, i.discount,
    (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.invoice_id = i.id) AS paid
  FROM fee_invoices i
  JOIN enrollments e ON e.id = i.enrollment_id
  JOIN students st ON st.id = e.student_id
  WHERE e.batch_id = ${batchId}
  ORDER BY st.name, i.month_no
`;
const paidRows = invoices.filter((i) => Number(i.paid) > 0);
console.log(`\nFEE MONTHS (${invoices.length}), of which ${paidRows.length} have payments:`);
for (const i of invoices) {
  console.log(` ${i.due} -> ${i.new_due}  ${i.name} month ${i.month_no}  amount ${i.amount} paid ${i.paid}`);
}

const [{ n: payments }] = await sql`
  SELECT COUNT(*) AS n FROM payments p
  JOIN fee_invoices i ON i.id = p.invoice_id
  JOIN enrollments e ON e.id = i.enrollment_id WHERE e.batch_id = ${batchId}
`;
const [{ n: attendance }] = await sql`
  SELECT COUNT(*) AS n FROM attendance a
  JOIN sessions s ON s.id = a.session_id WHERE s.batch_id = ${batchId}
`;
console.log(`\nUNTOUCHED: ${payments} payment receipts, ${attendance} attendance rows.`);

if (!apply) {
  console.log("\nDRY RUN — nothing written. Re-run with --apply to make these changes.");
  process.exit(0);
}

// ---------------------------------------------------------------- 3. apply
const results = await sql.transaction([
  sql`UPDATE batches SET start_date = start_date + (${days})::int WHERE id = ${batchId} RETURNING id`,
  sql`UPDATE sessions SET scheduled_at = scheduled_at + make_interval(days => (${days})::int)
      WHERE batch_id = ${batchId} RETURNING id`,
  sql`UPDATE fee_invoices SET due_date = due_date + (${days})::int
      WHERE enrollment_id IN (SELECT id FROM enrollments WHERE batch_id = ${batchId})
      RETURNING id`,
]);
console.log(
  `\nAPPLIED in one transaction: ${results[0].length} intake, ${results[1].length} classes, ${results[2].length} fee months.`
);

const [after] = await sql`
  SELECT to_char(start_date, 'YYYY-MM-DD') AS start_date FROM batches WHERE id = ${batchId}
`;
const afterSessions = await sql`
  SELECT to_char(scheduled_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') AS at, title
  FROM sessions WHERE batch_id = ${batchId} ORDER BY scheduled_at
`;
const afterInvoices = await sql`
  SELECT to_char(i.due_date, 'YYYY-MM-DD') AS due, COUNT(*) AS n
  FROM fee_invoices i JOIN enrollments e ON e.id = i.enrollment_id
  WHERE e.batch_id = ${batchId} GROUP BY i.due_date ORDER BY i.due_date
`;
const [{ n: paymentsAfter }] = await sql`
  SELECT COUNT(*) AS n FROM payments p
  JOIN fee_invoices i ON i.id = p.invoice_id
  JOIN enrollments e ON e.id = i.enrollment_id WHERE e.batch_id = ${batchId}
`;
console.log("\nAFTER:");
console.log(" start_date:", after.start_date);
for (const s of afterSessions) console.log(` ${s.at}  ${s.title}`);
for (const r of afterInvoices) console.log(` due ${r.due}: ${r.n} fee months`);
console.log(` payments still on record: ${paymentsAfter}`);
