import "server-only";
import { headers } from "next/headers";
import { sql } from "@/lib/db";

export async function recordLoginLog(opts: {
  studentId: number | null;
  role: "student" | "admin";
  name: string | null;
  email: string | null;
  isPwa?: boolean;
}): Promise<void> {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;
    const ua = h.get("user-agent");
    const isPwa = opts.isPwa ?? false;
    await sql`
      INSERT INTO login_logs (student_id, role, name, email, ip, user_agent, is_pwa)
      VALUES (${opts.studentId}, ${opts.role}, ${opts.name}, ${opts.email}, ${ip}, ${ua}, ${isPwa})
    `;
  } catch (e) {
    console.error("[login-log] failed to record login:", e);
  }
}
