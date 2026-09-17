import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth";
import { getAccountLock } from "@/lib/course";
import AccountLocked from "./AccountLocked";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function StudentLoginPage() {
  const studentId = await getStudentSession();
  if (studentId !== null) {
    // A locked session would bounce between /login and /portal — show the reason here instead.
    const lock = await getAccountLock(studentId);
    if (lock) return <AccountLocked lock={lock} signedIn />;
    redirect("/portal");
  }
  return <LoginForm />;
}
