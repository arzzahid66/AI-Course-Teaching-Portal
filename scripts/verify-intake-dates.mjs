// Read-only check of an intake's money and blocking state.
//   node --env-file=.env scripts/verify-intake-dates.mjs
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const [m] = await sql`
  SELECT COUNT(*) AS receipts, COALESCE(SUM(p.amount),0) AS collected
  FROM payments p JOIN fee_invoices i ON i.id = p.invoice_id
  JOIN enrollments e ON e.id = i.enrollment_id WHERE e.batch_id = 1`;
const [c] = await sql`
  SELECT COUNT(*) AS students FROM enrollments WHERE batch_id = 1 AND status <> 'dropped'`;
const blocked = await sql`
  SELECT st.name FROM fee_invoices i
  JOIN enrollments e ON e.id = i.enrollment_id JOIN students st ON st.id = e.student_id
  JOIN batches b ON b.id = e.batch_id
  WHERE e.batch_id = 1
    AND (i.amount - i.discount) > COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id),0)
    AND (i.due_date + b.grace_days) < (now() AT TIME ZONE 'Asia/Karachi')::date`;
console.log(JSON.stringify({ ...m, ...c, blocked_now: blocked.map((b) => b.name) }, null, 1));
