"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { verifyPassword, setStudentCookie, clearStudentCookie } from "@/lib/auth";
import { recordLoginLog } from "@/lib/loginLog";
import { getAccountLock, type AccountLock } from "@/lib/course";

type Row = {
  id: number;
  name: string;
  email: string | null;
  password_hash: string | null;
  status: string;
};

export async function studentLogin(
  _prev: { error?: string; lock?: AccountLock } | undefined,
  formData: FormData
): Promise<{ error?: string; lock?: AccountLock }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const rows = (await sql`
    SELECT id, name, email, password_hash, status
    FROM students
    WHERE lower(email) = ${email}
    LIMIT 1
  `) as Row[];

  const student = rows[0];
  if (!student || !verifyPassword(password, student.password_hash)) {
    return { error: "Wrong email or password." };
  }
  // Deactivated by the tutor, or locked by an unpaid fee: say why instead of logging in.
  const lock = await getAccountLock(student.id);
  if (lock) {
    return { error: "Your account is inactive.", lock };
  }

  await setStudentCookie(student.id);
  await recordLoginLog({
    studentId: student.id,
    role: "student",
    name: student.name,
    email: student.email,
    isPwa: formData.get("is_pwa") === "true",
  });
  redirect("/portal");
}

export async function studentLogout(): Promise<void> {
  await clearStudentCookie();
  redirect("/login");
}
