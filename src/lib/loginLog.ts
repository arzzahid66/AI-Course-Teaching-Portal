import "server-only";
import { headers } from "next/headers";
import { sql } from "@/lib/db";

/**
 * Record a successful login in `login_logs`. Best-effort: any failure here is
 * swallowed so that logging can never block or break an actual login.
 *
 * Captures a snapshot of the user's name + email at login time plus a
 * best-effort client IP and the raw browser user-agent.
 */
export async function recordLoginLog(opts: {
  studentId: number | null;
  role: "student" | "admin";
  name: string | null;
  email: string | null;
}): Promise<void> {
  try {
    const h = await headers();
    // x-forwarded-for can be a comma-separated chain; the first entry is the client.
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;
    const ua = h.get("user-agent");
    await sql`
      INSERT INTO login_logs (student_id, role, name, email, ip, user_agent)
      VALUES (${opts.studentId}, ${opts.role}, ${opts.name}, ${opts.email}, ${ip}, ${ua})
    `;
  } catch (e) {
    console.error("[login-log] failed to record login:", e);
  }
}
