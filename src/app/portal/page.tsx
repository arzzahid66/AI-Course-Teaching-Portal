import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth";
import { getAccountLock } from "@/lib/course";
import { getPortalData } from "@/actions/student";
import AccountLocked from "../login/AccountLocked";
import PortalClient from "./PortalClient";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const studentId = await getStudentSession();
  if (studentId === null) {
    redirect("/login");
  }
  // A student deactivated (or fee-locked) after logging in loses access on the next load.
  const lock = await getAccountLock(studentId);
  if (lock) return <AccountLocked lock={lock} signedIn />;

  const data = await getPortalData();
  return <PortalClient data={data} />;
}
