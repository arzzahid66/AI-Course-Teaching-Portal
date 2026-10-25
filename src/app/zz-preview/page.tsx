"use client";
// TEMPORARY layout preview with mock data — delete this folder.
import WeeklyProgress from "../admin/tabs/WeeklyProgress";
import type { WeeklyBoard } from "@/actions/progress";

const names = ["Ayesha Khan", "Bilal Ahmed", "Fatima Noor", "Hamza Ali", "Iqra Shah", "Junaid Raza", "Maryam Tariq", "Usman Iqbal", "Zainab Malik", "Saad Hussain"];
const weeks = Array.from({ length: 8 }, (_, i) => ({
  weekend_id: i + 1, weekend_no: i + 1, title: `Topic ${i + 1}`, hasHomework: true,
  phase: (i < 4 ? "due" : i === 4 ? "open" : "upcoming") as "due" | "open" | "upcoming",
}));
const students = names.map((name, i) => ({ enrollment_id: i + 1, student_id: i + 1, name }));
const homework: WeeklyBoard["homework"] = {};
const quiz: WeeklyBoard["quiz"] = {};
students.forEach((s, i) => {
  weeks.slice(0, 5).forEach((w, j) => {
    const r = (i * 7 + j * 3) % 10;
    if (r < 6) homework[`${s.enrollment_id}:${w.weekend_id}`] = { status: "approved", marks: 5 + (r % 5) };
    else if (r === 6) homework[`${s.enrollment_id}:${w.weekend_id}`] = { status: "awaiting", marks: null };
    else if (r === 7) homework[`${s.enrollment_id}:${w.weekend_id}`] = { status: "needs_changes", marks: null };
  });
  [1, 2].forEach((q) => {
    const r = (i * 5 + q * 2) % 7;
    if (r < 5) quiz[`${q}:${s.student_id}`] = { best: 30 + r * 15, passed: 30 + r * 15 >= 50 };
  });
});
const board: WeeklyBoard = {
  weeks, students, homework, quiz,
  quizzes: [1, 2].map((id) => ({ id, title: `Quiz ${id}`, pass_percent: 50 })),
};

export default function Preview() {
  return (
    <main className="min-h-screen max-w-3xl mx-auto p-4 sm:p-6">
      <WeeklyProgress board={board} />
    </main>
  );
}
