"use client";

import { useEffect } from "react";

/**
 * Error boundary for the /admin route. If anything in the admin page throws
 * during a server render, the user gets a friendly card with a retry button
 * instead of Next.js's opaque "An error occurred in the Server Components
 * render" production message. The real error (with its digest) is still logged
 * to the server console for debugging.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] render error:", error);
  }, [error]);

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md w-full rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-6 text-center">
        <div className="mx-auto mb-3 h-12 w-12 grid place-items-center rounded-full bg-rose-50 text-2xl">
          ⚠️
        </div>
        <h1 className="text-lg font-bold text-slate-800">Something went wrong</h1>
        <p className="text-slate-500 text-sm mt-1">
          The admin page couldn&apos;t load. This is usually a temporary database
          hiccup — try again in a moment.
        </p>
        {error.digest && (
          <p className="text-slate-300 text-xs mt-3 font-mono">ref: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-5 w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
