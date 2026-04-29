"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const r = await fetch("/api/team/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "Request failed. Try again.");
        return;
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Reset your password</h1>
        {submitted ? (
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <p>
              If an account with that email exists, we&apos;ve sent a link to reset
              your password. Check your inbox.
            </p>
            <p className="text-xs text-slate-500">
              The link expires in 1 hour. Don&apos;t see it? Check spam, or request
              another.
            </p>
            <a
              href="/team/login"
              className="block text-center text-sm font-semibold text-slate-900 hover:underline"
            >
              ← Back to sign in
            </a>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <p className="text-sm text-slate-600">
              Enter the email associated with your account. We&apos;ll send you a
              link to reset your password.
            </p>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !email}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send reset link"}
            </button>
            <a
              href="/team/login"
              className="block text-center text-xs text-slate-500 hover:text-slate-800"
            >
              ← Back to sign in
            </a>
          </form>
        )}
      </div>
    </main>
  );
}
