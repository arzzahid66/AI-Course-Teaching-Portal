import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="text-5xl mb-4">🚪</div>
      <h1 className="text-3xl font-bold mb-2">ClassGate</h1>
      <p className="text-slate-600 max-w-sm mb-8">
        The gate in front of your live class. Students log in to their portal to
        check in, see topics, assignments, and their record. Tutors manage
        everything from the admin dashboard.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          href="/login"
          className="rounded-xl bg-brand-600 px-6 py-3 text-white font-semibold shadow-sm active:scale-[0.98] transition"
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
