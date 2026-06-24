import { isAdmin } from "@/lib/auth";
import {
  getStudents,
  getOpenSessionWithAttendance,
  getRecentSessions,
  getTopics,
  getAssignmentMatrix,
} from "@/actions/admin";
import LoginForm from "./LoginForm";
import AdminDashboard from "./AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdmin())) {
    return <LoginForm />;
  }

  const [students, openSession, sessions, topics, assignmentMatrix] =
    await Promise.all([
      getStudents(),
      getOpenSessionWithAttendance(),
      getRecentSessions(),
      getTopics(),
      getAssignmentMatrix(),
    ]);

  return (
    <AdminDashboard
      students={students}
      openSession={openSession.session}
      attendees={openSession.attendees}
      sessions={sessions}
      topics={topics}
      assignmentMatrix={assignmentMatrix}
    />
  );
}
