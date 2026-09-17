"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { sendStudentEmail } from "@/actions/admin";

// ---------------------------------------------------------------------------
// Shared admin UI primitives
// ---------------------------------------------------------------------------
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-5 mb-4 ${className}`}>
      {children}
    </section>
  );
}

export function fieldClass() {
  return "w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none";
}

export const btn = {
  primary:
    "rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50",
  dark: "rounded-xl bg-slate-800 px-4 py-2.5 text-white font-semibold disabled:opacity-50",
  green: "rounded-xl bg-emerald-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50",
  small: "text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-1 disabled:opacity-40",
  smallDanger: "text-xs rounded-lg border border-rose-200 text-rose-700 px-2 py-1 disabled:opacity-40",
};

export function fmt(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("en-PK", {
        timeZone: "Asia/Karachi",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      });
}

/** "2026-09-20" → "Sun 20 Sep 2026" (date-only values, no timezone shift). */
export function fmtDay(ymd: string | null): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function rs(n: number): string {
  return `Rs ${Math.round(n).toLocaleString("en-PK")}`;
}

/** Format an ISO timestamp for a <input type="datetime-local"> default value. */
export function toDatetimeLocal(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** datetime-local fields are in the admin's local time; send an absolute ISO timestamp. */
export function localToIso(formData: FormData, key = "scheduled_at") {
  const local = String(formData.get(key) ?? "");
  if (!local) return;
  const d = new Date(local);
  if (!Number.isNaN(d.getTime())) formData.set(key, d.toISOString());
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        className={`bg-white w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto p-5`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl leading-none" aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Run a server action from a form or button: tracks pending state, shows the
 * returned error (or a success message) and refreshes the page data.
 */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function run<T extends { error?: string } | void>(
    fn: () => Promise<T>,
    opts: { success?: string | ((res: T) => string); onDone?: (res: T) => void } = {}
  ) {
    setError(null);
    setOk(null);
    start(async () => {
      try {
        const res = await fn();
        if (res && typeof res === "object" && "error" in res && res.error) {
          setError(res.error);
          return;
        }
        if (opts.success) setOk(typeof opts.success === "function" ? opts.success(res) : opts.success);
        opts.onDone?.(res);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }
  return { pending, error, ok, run, setError, setOk };
}

export function Msg({ error, ok }: { error: string | null; ok?: string | null }) {
  if (error) return <p className="text-rose-600 text-sm mt-2">{error}</p>;
  if (ok) return <p className="text-emerald-600 text-sm mt-2">{ok}</p>;
  return null;
}

export function StatCard({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "rose" | "emerald" | "brand" | "slate" | "amber";
}) {
  const tones: Record<string, string> = {
    rose: "text-rose-600",
    emerald: "text-emerald-600",
    brand: "text-brand-700",
    amber: "text-amber-600",
    slate: "text-slate-800",
  };
  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-4 flex flex-col gap-1">
      <p className="text-slate-500 text-xs font-medium">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold leading-tight tabular-nums ${tones[tone]}`}>{value}</p>
      {hint && <p className="text-slate-400 text-xs">{hint}</p>}
    </div>
  );
}

/** Small horizontal progress bar. */
export function MiniBar({ pct, tone = "bg-brand-500" }: { pct: number; tone?: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full ${tone}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl bg-white shadow-lg ring-1 ring-slate-200 px-3 py-2 text-xs">
      {label && <p className="font-semibold text-slate-700 mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Normalize a free-text gender value into one of our known buckets. */
export function genderBucket(g: string | null): "female" | "male" | "other" | "unspecified" {
  const v = (g ?? "").trim().toLowerCase();
  if (v === "female" || v === "f") return "female";
  if (v === "male" || v === "m") return "male";
  if (v === "other") return "other";
  return "unspecified";
}

export const GENDER_META: Record<string, { label: string; color: string }> = {
  female: { label: "Female", color: "#ec4899" },
  male: { label: "Male", color: "#3b82f6" },
  other: { label: "Other", color: "#a78bfa" },
  unspecified: { label: "Unspecified", color: "#cbd5e1" },
};

export const BAND_META: Record<string, { label: string; className: string }> = {
  excellent: { label: "Excellent", className: "bg-emerald-100 text-emerald-700" },
  good: { label: "Good", className: "bg-brand-50 text-brand-700" },
  needs_work: { label: "Needs work", className: "bg-amber-100 text-amber-700" },
  at_risk: { label: "At risk", className: "bg-rose-100 text-rose-700" },
  not_started: { label: "Not started", className: "bg-slate-100 text-slate-500" },
};

export function BandBadge({ band }: { band: string }) {
  const m = BAND_META[band] ?? BAND_META.not_started;
  return <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${m.className}`}>{m.label}</span>;
}

export const FEE_META: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-700" },
  partial: { label: "Partial", className: "bg-amber-100 text-amber-700" },
  unpaid: { label: "Due", className: "bg-slate-100 text-slate-600" },
  overdue: { label: "Overdue", className: "bg-rose-100 text-rose-700" },
  waived: { label: "Waived", className: "bg-violet-100 text-violet-700" },
};

export function FeeBadge({ status }: { status: string }) {
  const m = FEE_META[status] ?? FEE_META.unpaid;
  return <span className={`text-xs rounded-full px-2 py-0.5 font-medium whitespace-nowrap ${m.className}`}>{m.label}</span>;
}

/** Download rows as a CSV file (admin browser). */
export function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((c) => {
          const s = c == null ? "" : String(c);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-6 text-center text-slate-400">
        {children}
      </td>
    </tr>
  );
}

/**
 * "✉ Email" button that opens a compose box and emails one student directly.
 * The modal is portaled to <body> and uses no <form>, so it can sit inside
 * other forms, clickable table rows or another modal without side effects.
 */
export function EmailStudentButton({
  studentId,
  name,
  defaultSubject = "",
  className = btn.small,
}: {
  studentId: number;
  name: string;
  defaultSubject?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);

  function close() {
    setOpen(false);
    setSent(false);
    setError(null);
  }

  function send() {
    setError(null);
    const fd = new FormData();
    fd.set("subject", subject);
    fd.set("message", message);
    start(async () => {
      try {
        const res = await sendStudentEmail(studentId, fd);
        if (res.error) setError(res.error);
        else {
          setSent(true);
          setMessage("");
          setSubject(defaultSubject);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not send the email.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={className}
        title={`Email ${name}`}
      >
        ✉ Email
      </button>
      {open &&
        mounted &&
        createPortal(
          // Stop clicks from bubbling (through the React tree) to a clickable row behind.
          <div onClick={(e) => e.stopPropagation()}>
            <Modal title={`Email ${name}`} onClose={close}>
              {sent ? (
                <div className="space-y-3">
                  <p className="text-emerald-600 text-sm">Email sent to {name}.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setSent(false)} className={btn.dark}>
                      Write another
                    </button>
                    <button type="button" onClick={close} className={btn.primary}>
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject"
                    maxLength={200}
                    className={fieldClass()}
                    autoFocus={!subject}
                  />
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={`Message to ${name}…`}
                    rows={7}
                    maxLength={5000}
                    className={fieldClass()}
                    autoFocus={!!subject}
                  />
                  <button
                    type="button"
                    onClick={send}
                    disabled={pending || !subject.trim() || !message.trim()}
                    className={`w-full ${btn.primary}`}
                  >
                    {pending ? "Sending…" : "Send email"}
                  </button>
                  <Msg error={error} />
                </div>
              )}
            </Modal>
          </div>,
          document.body
        )}
    </>
  );
}
