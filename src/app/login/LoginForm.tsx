"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { studentLogin } from "@/actions/studentAuth";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-2xl bg-brand-600 px-5 py-4 text-white text-lg font-bold shadow-sm active:scale-[0.98] transition disabled:opacity-50"
    >
      {pending ? "Logging in…" : "Log in"}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useActionState(studentLogin, {});

  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-3xl bg-white shadow-lg ring-1 ring-slate-100 p-7 space-y-4"
      >
        <div className="text-center mb-2">
          <div className="text-4xl mb-2">🎓</div>
          <h1 className="text-xl font-bold">Student Login</h1>
          <p className="text-slate-500 text-sm">
            Use the email &amp; password your tutor gave you
          </p>
        </div>
        <input
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          placeholder="Email"
          className="w-full rounded-2xl border border-slate-300 px-4 py-4 text-lg focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
        />
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          className="w-full rounded-2xl border border-slate-300 px-4 py-4 text-lg focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
        />
        {state?.error && (
          <p className="text-center text-rose-600 text-sm font-medium">
            {state.error}
          </p>
        )}
        <SubmitButton />
      </form>
    </main>
  );
}
