import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth";
import { getAccountLock } from "@/lib/course";
import { getPortalData } from "@/actions/student";
import { getStudentResources } from "@/actions/resources";
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

  const [data, resources] = await Promise.all([
    getPortalData(),
    // The Tools tab must never be able to take the whole portal down.
    getStudentResources().catch((e) => {
      console.error("[portal] tools load failed:", e);
      return { tools: [], history: [], helpVideo: null };
    }),
  ]);
  return <PortalClient data={data} resources={resources} />;
}
