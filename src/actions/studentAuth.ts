"use server";

import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { verifyPassword, setStudentCookie, clearStudentCookie } from "@/lib/auth";

type Row = { id: number; password_hash: string | null; status: string };

export async function studentLogin(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const rows = (await sql`
    SELECT id, password_hash, status
    FROM students
    WHERE lower(email) = ${email}
    LIMIT 1
  `) as Row[];

  const student = rows[0];
  if (!student || !verifyPassword(password, student.password_hash)) {
    return { error: "Wrong email or password." };
  }
  if (student.status !== "active") {
    return { error: "Your account is not active. Contact your tutor." };
  }

  await setStudentCookie(student.id);
  redirect("/portal");
}

export async function studentLogout(): Promise<void> {
  await clearStudentCookie();
  redirect("/login");
}
