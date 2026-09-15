import Link from "next/link";
import InstallButton from "./InstallButton";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="text-5xl mb-4">🎓</div>
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-1">ClassGate</p>
      <h1 className="text-3xl font-bold mb-2">AI Engineering Course</h1>
      <p className="text-slate-600 max-w-sm mb-8">
        Live class every Sunday at 10:00 AM, two recorded videos every week, and
        homework that builds real projects. Log in to check in, watch this
        week&apos;s videos, submit homework, and see your progress and fees.
      </p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <InstallButton />

        <div className="w-full h-px bg-slate-200 my-1" />

        <Link
          href="/login"
          className="rounded-xl bg-indigo-600 px-6 py-3 text-white font-semibold shadow-sm active:scale-[0.98] transition"
        >
          Student login →
        </Link>
        <Link
          href="/admin"
          className="rounded-xl bg-slate-800 px-6 py-3 text-white font-semibold shadow-sm active:scale-[0.98] transition"
        >
          Admin dashboard →
        </Link>
      </div>
    </main>
  );
}
