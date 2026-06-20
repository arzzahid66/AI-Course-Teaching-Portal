import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function StudentLoginPage() {
  if (getStudentSession() !== null) {
    redirect("/portal");
  }
  return <LoginForm />;
}
