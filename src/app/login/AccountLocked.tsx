"use client";

import type { AccountLock } from "@/lib/course";
import { studentLogout } from "@/actions/studentAuth";
import { HowToPay, fmtDay, rs } from "../portal/sections";

/**
 * Shown instead of the portal when a student may not use it: deactivated by the
 * tutor, or a fee month still unpaid after the grace period. Used on the login
 * form (after a correct password) and on /login + /portal for an existing session.
 */
export default function AccountLocked({
  lock,
  signedIn,
  onBack,
}: {
  lock: AccountLock;
  /** A session cookie exists — offer Log out instead of Back. */
  signedIn?: boolean;
  onBack?: () => void;
}) {
  const waHref = lock.whatsapp
    ? `https://wa.me/${lock.whatsapp}?text=${encodeURIComponent(
        `Hi! I'm ${lock.name}. My portal account shows as inactive. Can you help?`
      )}`
    : null;

  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-lg ring-1 ring-slate-100 p-6 space-y-4">
        <div className="text-center">
          <div className="text-5xl mb-3">🔒</div>
          <h1 className="text-xl font-bold">Your account is inactive</h1>
          <p className="text-slate-500 text-sm">Hi {lock.name.split(/\s+/)[0]}, here&apos;s why and how to fix it.</p>
        </div>

        {lock.kind === "fee" ? (
          <>
            <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4 text-sm text-rose-900 space-y-1">
              <p className="font-semibold">
                Month {lock.monthNo} fee is unpaid — {rs(lock.remaining)}
              </p>
              <p>
                It was due on {fmtDay(lock.dueDate, true)} and wasn&apos;t paid within {lock.graceDays} days (last day{" "}
                {fmtDay(lock.graceUntil, true)}), so your account was made inactive automatically.
              </p>
              <p className="font-medium">It becomes active again as soon as your payment is recorded.</p>
            </div>
            <HowToPay
              data={{
                name: lock.name,
                enrollment: lock.batchName ? { batchName: lock.batchName } : null,
                fees: { accounts: lock.accounts, whatsapp: lock.whatsapp },
              }}
              amount={lock.remaining}
              monthLabel={`Month ${lock.monthNo}`}
            />
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700">
              Your account has been deactivated by your tutor. Please contact them to find out why and to get it
              reactivated.
            </div>
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center rounded-xl bg-green-600 px-4 py-3 text-white font-semibold active:scale-[0.98] transition"
              >
                Contact your tutor on WhatsApp
              </a>
            )}
          </>
        )}

        {signedIn ? (
          <form action={studentLogout}>
            <button type="submit" className="w-full text-sm text-slate-500 underline">
              Log out
            </button>
          </form>
        ) : (
          onBack && (
            <button type="button" onClick={onBack} className="w-full text-sm text-slate-500 underline">
              Back to login
            </button>
          )
        )}
      </div>
    </main>
  );
}
