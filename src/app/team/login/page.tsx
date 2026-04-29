"use client";

import { useEffect, useState } from "react";

export default function TeamLoginPage() {
  const [mode, setMode] = useState<"loading" | "login" | "signup">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/team/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          window.location.href = "/team/dashboard";
          return;
        }
        setMode(d.needsSetup ? "signup" : "login");
      })
      .catch(() => setMode("login"));
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/team/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Login failed");
      }
      window.location.href = "/team/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/team/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, name, email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Signup failed");
      }
      window.location.href = "/team/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white shadow-sm">
            <img src="/logo.png" alt="Orthia" className="h-9 w-9 object-contain" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-white">
            Orthia <span className="font-light text-slate-300">Team</span>
          </span>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          {mode === "signup" ? (
            <>
              <h1 className="text-xl font-semibold text-gray-900">First-time setup</h1>
              <p className="mt-1 text-sm text-gray-500">
                Create your organization and the first admin account.
              </p>
              <form onSubmit={handleSignup} className="mt-6 space-y-4">
                <Field label="Organization name" value={orgName} onChange={setOrgName} autoFocus />
                <Field label="Your name" value={name} onChange={setName} />
                <Field label="Email" type="email" value={email} onChange={setEmail} />
                <Field label="Password" type="password" value={password} onChange={setPassword} />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {loading ? "Creating…" : "Create organization"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-gray-900">Sign in</h1>
              <p className="mt-1 text-sm text-gray-500">Welcome back to the team workspace.</p>
              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <Field label="Email" type="email" value={email} onChange={setEmail} autoFocus />
                <Field label="Password" type="password" value={password} onChange={setPassword} />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>
                <a
                  href="/team/forgot-password"
                  className="block text-center text-xs text-gray-500 hover:text-gray-800"
                >
                  Forgot password?
                </a>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        required
      />
    </label>
  );
}
