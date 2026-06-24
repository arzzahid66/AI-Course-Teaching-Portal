import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth";
import { getPortalData } from "@/actions/student";
import PortalClient from "./PortalClient";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  if ((await getStudentSession()) === null) {
    redirect("/login");
  }
  const data = await getPortalData();
  return <PortalClient data={data} />;
}
