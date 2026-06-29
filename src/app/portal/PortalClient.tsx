"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  checkIn,
  submitQuestion,
  type PortalData,
  type NextClass,
} from "@/actions/student";
import { studentLogout } from "@/actions/studentAuth";
import {
  PAYMENT_EASYPAISA_NUMBER,
  PAYMENT_ACCOUNT_NAME,
  TUTOR_WHATSAPP_NUMBER,
  PORTAL_DEMO_YOUTUBE_ID,
  TUTOR_NAME,
  TUTOR_TITLE,
  TUTOR_COMPANY,
  TUTOR_LOCATION,
  TUTOR_PHOTO,
  TUTOR_BIO,
} from "@/lib/constants";

type Tab = "class" | "course" | "topics" | "assignments" | "record" | "ask";

function fmt(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}
function fmtDate(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

export default function PortalClient({ data }: { data: PortalData }) {
  const [tab, setTab] = useState<Tab>("class");
  const [showBio, setShowBio] = useState(false);

  return (
    <main className="min-h-screen max-w-md mx-auto p-4 pb-24">
      <header className="flex items-center justify-between mb-4">
        <div>
          <p className="text-slate-500 text-sm">Welcome</p>
          <h1 className="text-xl font-bold">{data.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowBio(true)}
            className="flex items-center gap-1.5 rounded-full bg-brand-50 text-brand-700 text-sm font-semibold px-3 py-1.5 active:scale-[0.97] transition"
          >
            👤 About Teacher
          </button>
          <button
            onClick={() => studentLogout()}
            className="text-sm text-slate-500 underline"
          >
            Log out
          </button>
        </div>
      </header>

      {showBio && <TutorBioModal onClose={() => setShowBio(false)} />}

      {tab === "class" && (
        <>
          <ClassTab data={data} />
          <FeePurposeNote />
          <HowToVideoCard />
        </>
      )}
      {tab === "course" && <CourseTab data={data} />}
      {tab === "topics" && <TopicsTab data={data} />}
      {tab === "assignments" && <AssignmentsTab data={data} />}
      {tab === "record" && <RecordTab data={data} />}
      {tab === "ask" && <AskTab data={data} />}

      {/* Bottom tab bar (mobile-first) */}
      <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t border-slate-200 grid grid-cols-6">
        {([
          ["class", "Class", "🏫"],
          ["course", "Course", "🎓"],
          ["topics", "Topics", "📚"],
          ["assignments", "Tasks", "📝"],
          ["record", "Record", "📊"],
          ["ask", "Ask", "💬"],
        ] as [Tab, string, string][]).map(([t, label, icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-2.5 flex flex-col items-center gap-0.5 text-xs font-medium ${
              tab === t ? "text-brand-700" : "text-slate-400"
            }`}
          >
            <span className="text-lg leading-none">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-5 mb-4">
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// About your teacher — opened from the "About Teacher" button in the header
// ---------------------------------------------------------------------------
function TutorBioModal({ onClose }: { onClose: () => void }) {
  // Close on Escape key for convenience.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 text-lg leading-none active:scale-95 transition"
        >
          ✕
        </button>
        <TutorBioCard />
      </div>
    </div>
  );
}

function TutorBioCard() {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = TUTOR_NAME.split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const showPhoto = TUTOR_PHOTO && !imgFailed;

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      {/* Slim brand accent header so the photo pops without drowning the text */}
      <div className="bg-gradient-to-br from-brand-600 to-brand-700 px-5 pt-5 pb-12">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
          👤 Your teacher
        </p>
      </div>

      <div className="px-5 pb-5">
        <div className="-mt-9 flex items-end gap-4">
          {showPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={TUTOR_PHOTO}
              alt={TUTOR_NAME}
              onError={() => setImgFailed(true)}
              className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-4 ring-white shadow-md"
            />
          ) : (
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-brand-100 text-2xl font-bold text-brand-700 ring-4 ring-white shadow-md">
              {initials}
            </div>
          )}
          <div className="min-w-0 pb-1">
            <h2 className="text-lg font-bold leading-tight text-slate-900">
              {TUTOR_NAME}
            </h2>
            <p className="text-sm text-slate-600">
              {TUTOR_TITLE}
              {TUTOR_COMPANY && (
                <>
                  {" "}
                  <span className="text-slate-400">at</span>{" "}
                  <span className="font-semibold text-brand-700">{TUTOR_COMPANY}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <p className="mt-2 text-xs text-slate-400">📍 {TUTOR_LOCATION}</p>

        <p className="mt-4 text-sm leading-relaxed text-slate-700">{TUTOR_BIO}</p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Why there is a late/absent fee (shown to every student on the Class tab)
// ---------------------------------------------------------------------------
function FeePurposeNote() {
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 mb-4">
      <h2 className="font-bold text-emerald-800 mb-2">
        💚 This course is 100% free — about the fee
      </h2>
      <div className="text-sm text-emerald-900/80 space-y-2 leading-relaxed">
        <p>
          You never pay anything to learn here. The small fee for{" "}
          <span className="font-semibold">missing or being late</span> to a class is{" "}
          <span className="font-semibold">not a charge for the course</span> — it only
          exists to help all of us stay punctual and committed.
        </p>
        <p>
          <span className="font-semibold">I don&apos;t keep a single rupee of it.</span> Every
          amount collected goes into buying{" "}
          <span className="font-semibold">premium (paid) AI tools and subscriptions</span> for
          the whole class — the kind that are expensive to buy on your own. This way we all get
          to use professional tools together.
        </p>
        <p className="text-emerald-700">
          So if you&apos;re ever charged, that money comes straight back to you and your
          classmates as better tools. 🙌 Just be on time and you&apos;ll never pay a thing.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// "How to use this portal" demo video (shown in the Class tab)
// ---------------------------------------------------------------------------
function HowToVideoCard() {
  if (!PORTAL_DEMO_YOUTUBE_ID) return null;
  return (
    <Card>
      <h2 className="font-bold mb-1">▶️ How to use this portal</h2>
      <p className="text-slate-500 text-sm mb-3">
        New here? Watch this quick demo from your tutor.
      </p>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube.com/embed/${PORTAL_DEMO_YOUTUBE_ID}?rel=0`}
          title="How to use this portal"
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Next-class countdown
// ---------------------------------------------------------------------------
function NextClassCard({ next }: { next: NextClass }) {
  const target = new Date(next.scheduled_at).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = target - now;
  const started = diff <= 0;

  const totalSec = Math.max(0, Math.floor(diff / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  const units: [number, string][] = [
    [days, "days"],
    [hours, "hrs"],
    [minutes, "min"],
    [seconds, "sec"],
  ];

  return (
    <Card>
      <div className="text-center">
        <p className="text-slate-500 text-sm mb-1">Next class</p>
        <h2 className="text-lg font-bold mb-1">{next.title}</h2>
        <p className="text-slate-600 text-sm mb-4">{fmt(next.scheduled_at)}</p>

        {started ? (
          <p className="text-emerald-600 font-semibold">
            Starting any moment — refresh for the code.
          </p>
        ) : (
          <div className="flex justify-center gap-2">
            {units.map(([value, label]) => (
              <div
                key={label}
                className="rounded-xl bg-brand-50 px-3 py-2 min-w-[58px]"
              >
                <div className="text-2xl font-bold text-brand-700 tabular-nums">
                  {pad(value)}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Blocked (owes a missed-class fee) — show how to pay & get unblocked
// ---------------------------------------------------------------------------
function BlockedCard({ balance }: { balance: number }) {
  const [copied, setCopied] = useState(false);

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(PAYMENT_EASYPAISA_NUMBER);
    } catch {
      window.prompt("EasyPaisa number:", PAYMENT_EASYPAISA_NUMBER);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const waText = encodeURIComponent(
    `Hi! I've paid Rs ${balance} for my missed class. Here is my payment screenshot.`
  );
  const waLink = `https://wa.me/${TUTOR_WHATSAPP_NUMBER}?text=${waText}`;

  return (
    <Card>
      <div className="text-center mb-4">
        <div className="text-5xl mb-3">⛔️</div>
        <p className="text-lg font-semibold text-rose-600 mb-1">You owe Rs {balance}</p>
        <p className="text-slate-600 text-sm">
          You missed a class. Clear your dues to check in again.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 divide-y">
        {/* Step 1 — pay */}
        <div className="p-3">
          <p className="text-sm font-semibold mb-2">
            1. Send Rs {balance} via EasyPaisa
          </p>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <div className="min-w-0">
              <p className="font-mono font-bold tracking-wide">{PAYMENT_EASYPAISA_NUMBER}</p>
              {PAYMENT_ACCOUNT_NAME && (
                <p className="text-slate-500 text-xs truncate">{PAYMENT_ACCOUNT_NAME}</p>
              )}
            </div>
            <button
              onClick={copyNumber}
              className="shrink-0 text-xs rounded-lg border border-slate-300 px-2 py-1"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Step 2 — send screenshot */}
        <div className="p-3">
          <p className="text-sm font-semibold mb-2">2. Send the payment screenshot</p>
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center rounded-xl bg-green-600 px-4 py-2.5 text-white font-semibold active:scale-[0.98] transition"
          >
            Send screenshot on WhatsApp
          </a>
        </div>

        {/* Step 3 — wait */}
        <div className="p-3">
          <p className="text-sm font-semibold mb-1">3. Wait to be unblocked</p>
          <p className="text-slate-500 text-xs">
            Once your tutor confirms the payment, this screen clears and you can check in
            again. Refresh after a few minutes.
          </p>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Class / check-in
// ---------------------------------------------------------------------------
function ClassTab({ data }: { data: PortalData }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meetLink, setMeetLink] = useState<string | null>(null);

  const c = data.checkin;

  const emailNote = data.email ? (
    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4 text-left">
      ⚠️ Join Google Meet signed in as{" "}
      <span className="font-semibold break-all">{data.email}</span>. Joining with a
      different email will not be let in.
    </p>
  ) : (
    <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-4 text-left">
      Ask your tutor which email to use for Google Meet — joining with the wrong email
      won&apos;t be let in.
    </p>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await checkIn(code);
    setLoading(false);
    if (res.ok) {
      setMeetLink(res.meetLink);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  if (c.kind === "blocked") {
    return <BlockedCard balance={c.balance} />;
  }

  if (c.kind === "no-session") {
    return (
      <>
        {data.nextClass && <NextClassCard next={data.nextClass} />}
        <Card>
          <div className="text-center">
            <div className="text-5xl mb-3">😴</div>
            <h2 className="text-lg font-bold mb-1">No class live right now</h2>
            <p className="text-slate-600">
              {data.nextClass
                ? "Come back at class time and refresh to check in."
                : "Come back at class time and refresh."}
            </p>
          </div>
        </Card>
      </>
    );
  }

  const link = meetLink ?? (c.kind === "present" ? c.meetLink : null);
  if (link) {
    return (
      <Card>
        <div className="text-center">
          <div className="text-5xl mb-3">✅</div>
          <h2 className="text-lg font-bold mb-1">You&apos;re marked present</h2>
          <p className="text-slate-600 mb-4">
            {c.kind === "present" ? c.sessionTitle : "See you in class!"}
          </p>
          {emailNote}
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-2xl bg-green-600 px-5 py-4 text-white text-lg font-bold shadow-sm active:scale-[0.98] transition"
          >
            Join the class →
          </a>
        </div>
      </Card>
    );
  }

  // can-checkin
  return (
    <Card>
      <div className="text-center mb-4">
        <div className="text-4xl mb-2">👋</div>
        <h2 className="text-lg font-bold">{c.sessionTitle}</h2>
        <p className="text-slate-500 text-sm">Enter the code your tutor said</p>
      </div>
      {emailNote}
      <form onSubmit={submit} className="space-y-4">
        <input
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Today's code"
          className="w-full rounded-2xl border border-slate-300 px-4 py-4 text-lg text-center tracking-wide focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
        />
        {error && (
          <p className="text-center text-rose-600 text-sm font-medium">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || code.trim().length === 0}
          className="w-full rounded-2xl bg-brand-600 px-5 py-4 text-white text-lg font-bold shadow-sm active:scale-[0.98] transition disabled:opacity-50"
        >
          {loading ? "Checking…" : "Mark me present"}
        </button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Course roadmap — what you'll learn (Part A / Part B) + outcomes
// ---------------------------------------------------------------------------
function CourseTab({ data }: { data: PortalData }) {
  const { curriculum, outcomes } = data;

  if (curriculum.length === 0 && outcomes.length === 0) {
    return (
      <Card>
        <div className="text-center py-6">
          <div className="text-4xl mb-2">🎓</div>
          <h2 className="text-lg font-bold mb-1">Course roadmap</h2>
          <p className="text-slate-500 text-sm">
            Your course roadmap will appear here soon.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <h2 className="font-bold mb-1">🎓 What you&apos;ll learn</h2>
        <p className="text-slate-500 text-sm">
          Here&apos;s the whole journey. Each week has{" "}
          <span className="font-semibold text-brand-700">Part A</span> (for everyone — no laptop
          needed) and <span className="font-semibold text-emerald-700">Part B</span> (bring your
          laptop for hands-on building).
        </p>
      </Card>

      {curriculum.map((w) => (
        <Card key={w.id}>
          <h3 className="font-bold mb-3">{w.title}</h3>
          {w.part_a && (
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 mb-2">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-700 mb-1">
                Part A · Everyone
              </p>
              <p className="text-sm text-slate-700 whitespace-pre-line">{w.part_a}</p>
            </div>
          )}
          {w.part_b && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 mb-1">
                Part B · Bring your laptop
              </p>
              <p className="text-sm text-slate-700 whitespace-pre-line">{w.part_b}</p>
            </div>
          )}
        </Card>
      ))}

      {outcomes.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 mb-4">
          <h2 className="font-bold text-amber-900 mb-3">
            🚀 After this course, you&apos;ll be able to…
          </h2>
          <ul className="space-y-2">
            {outcomes.map((o) => (
              <li key={o.id} className="flex items-start gap-2 text-sm text-amber-900/90">
                <span className="shrink-0 mt-0.5">✅</span>
                <span>{o.body}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------
function TopicsTab({ data }: { data: PortalData }) {
  const { upcoming, past } = data.topics;
  return (
    <>
      <Card>
        <h2 className="font-bold mb-3">📌 Coming up</h2>
        {upcoming.length === 0 ? (
          <p className="text-slate-400 text-sm">Nothing scheduled yet.</p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((t) => (
              <li key={t.id} className="border-l-4 border-brand-300 pl-3">
                <p className="font-semibold">{t.title}</p>
                {t.description && (
                  <p className="text-slate-600 text-sm">{t.description}</p>
                )}
                {t.planned_at && (
                  <p className="text-slate-400 text-xs mt-0.5">{fmtDate(t.planned_at)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="font-bold mb-3">✅ Already covered</h2>
        {past.length === 0 ? (
          <p className="text-slate-400 text-sm">Nothing yet.</p>
        ) : (
          <ul className="space-y-3">
            {past.map((t) => (
              <li key={t.id} className="border-l-4 border-emerald-300 pl-3">
                <p className="font-semibold">{t.title}</p>
                {t.description && (
                  <p className="text-slate-600 text-sm">{t.description}</p>
                )}
                {t.planned_at && (
                  <p className="text-slate-400 text-xs mt-0.5">{fmtDate(t.planned_at)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Assignments (numbered, date-ordered, tap a task to see details)
// ---------------------------------------------------------------------------
function AssignmentsTab({ data }: { data: PortalData }) {
  const total = data.assignments.length;
  const doneCount = data.assignments.filter((a) => a.status === "done").length;

  return (
    <Card>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold">📝 Tasks</h2>
        {total > 0 && (
          <span className="text-xs rounded-full bg-slate-100 text-slate-600 px-2.5 py-1 font-semibold">
            {doneCount}/{total} done
          </span>
        )}
      </div>
      <p className="text-slate-500 text-sm mb-3">
        Tap a task to see its details. Send your work to your tutor on WhatsApp — they&apos;ll
        mark it done here.
      </p>
      {total === 0 ? (
        <p className="text-slate-400 text-sm">No tasks yet.</p>
      ) : (
        <ul className="space-y-2">
          {data.assignments.map((a, i) => (
            <TaskItem key={a.id} task={a} number={i + 1} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function TaskItem({
  task,
  number,
}: {
  task: PortalData["assignments"][number];
  number: number;
}) {
  const [open, setOpen] = useState(false);
  const done = task.status === "done";

  return (
    <li className="rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <span
          className={`shrink-0 grid place-items-center h-7 w-7 rounded-full text-xs font-bold ${
            done ? "bg-emerald-100 text-emerald-700" : "bg-brand-50 text-brand-700"
          }`}
        >
          {number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold truncate">{task.title}</span>
          {task.due_at && (
            <span className="block text-slate-400 text-xs">Due {fmtDate(task.due_at)}</span>
          )}
        </span>
        <span
          className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${
            done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {done ? "done ✅" : "pending"}
        </span>
        <span className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>
          ▶
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-0 border-t border-slate-100 bg-slate-50/60">
          {task.description ? (
            <p className="text-slate-700 text-sm whitespace-pre-line mt-3">{task.description}</p>
          ) : (
            <p className="text-slate-400 text-sm mt-3">No extra details for this task.</p>
          )}
          {task.due_at && (
            <p className="text-slate-500 text-xs mt-2">📅 Due {fmt(task.due_at)}</p>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// My record (attendance + dues)
// ---------------------------------------------------------------------------
function RecordTab({ data }: { data: PortalData }) {
  return (
    <>
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Balance</h2>
          <span
            className={
              data.balance > 0 ? "text-rose-600 font-bold" : "text-emerald-600 font-bold"
            }
          >
            {data.balance > 0 ? `Rs ${data.balance} due` : "All clear"}
          </span>
        </div>
      </Card>

      <Card>
        <h2 className="font-bold mb-3">Attendance history</h2>
        {data.attendance.length === 0 ? (
          <p className="text-slate-400 text-sm">No classes yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.attendance.map((a, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium">{a.title}</p>
                  <p className="text-slate-400 text-xs">{fmt(a.scheduled_at)}</p>
                </div>
                <span
                  className={
                    a.status === "present"
                      ? "text-emerald-600 font-medium"
                      : "text-rose-600 font-medium"
                  }
                >
                  {a.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-bold mb-3">Absent fee</h2>
        {data.ledger.length === 0 ? (
          <p className="text-slate-400 text-sm">No charges or payments yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.ledger.map((l, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium capitalize">{l.reason || l.type}</p>
                  <p className="text-slate-400 text-xs">{fmt(l.created_at)}</p>
                </div>
                <span
                  className={
                    l.type === "penalty" ? "text-rose-600" : "text-emerald-600"
                  }
                >
                  {l.type === "penalty" ? "+" : "−"}Rs {l.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ask (send a question to the tutor + see replies)
// ---------------------------------------------------------------------------
function AskTab({ data }: { data: PortalData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    if (body.trim().length === 0) {
      setError("Please type your question.");
      return;
    }
    const fd = new FormData();
    fd.set("subject", subject);
    fd.set("body", body);
    start(async () => {
      const res = await submitQuestion(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setBody("");
      setSubject("");
      setSent(true);
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <h2 className="font-bold mb-1">💬 Ask your tutor</h2>
        <p className="text-slate-500 text-sm mb-3">
          Facing a problem or have a question? Send it here. Your tutor will see it and
          reply — you&apos;ll find their answer below.
        </p>
        <form onSubmit={onSubmit} className="space-y-2">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Topic (optional) — e.g. Fees, Lesson 5"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Describe your question or problem…"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
          />
          {error && <p className="text-rose-600 text-sm">{error}</p>}
          {sent && (
            <p className="text-emerald-600 text-sm">Sent! Your tutor will get back to you.</p>
          )}
          <button
            type="submit"
            disabled={pending || body.trim().length === 0}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold active:scale-[0.98] transition disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send question"}
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="font-bold mb-3">Your questions</h2>
        {data.questions.length === 0 ? (
          <p className="text-slate-400 text-sm">You haven&apos;t asked anything yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.questions.map((q) => (
              <li key={q.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {q.subject && (
                      <p className="text-xs font-semibold text-brand-700">{q.subject}</p>
                    )}
                    <p className="text-sm whitespace-pre-line">{q.body}</p>
                    <p className="text-slate-400 text-xs mt-1">{fmt(q.created_at)}</p>
                  </div>
                  <span
                    className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${
                      q.status === "resolved"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {q.status === "resolved" ? "answered" : "waiting"}
                  </span>
                </div>
                {q.answer && (
                  <div className="mt-2 rounded-lg bg-brand-50 border border-brand-100 p-2.5">
                    <p className="text-xs font-semibold text-brand-700 mb-0.5">
                      Tutor&apos;s reply
                    </p>
                    <p className="text-sm whitespace-pre-line text-slate-700">{q.answer}</p>
                    {q.answered_at && (
                      <p className="text-slate-400 text-xs mt-1">{fmt(q.answered_at)}</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
