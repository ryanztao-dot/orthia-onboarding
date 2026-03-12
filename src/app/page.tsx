"use client";

import { useState } from "react";

export default function Home() {
  const [clinicName, setClinicName] = useState("");
  const [researching, setResearching] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicName.trim()) return;

    setResearching(true);
    setError("");

    try {
      const res = await fetch("/api/self-serve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicName: clinicName.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Something went wrong");
      }

      const data = await res.json();
      window.location.href = data.link;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setResearching(false);
    }
  }

  return (
    <main className="min-h-screen">
      {/* Navbar */}
      <nav className="absolute top-0 z-10 w-full px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <a href="https://orthia.io" className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm">
              <img src="/logo.png" alt="Orthia" className="h-8 w-8 object-contain" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              Orthia <span className="font-light text-blue-200">AI</span>
            </span>
          </a>
          <a
            href="/admin"
            className="text-sm font-medium text-white/70 transition hover:text-white"
          >
            Admin
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative mx-auto max-w-4xl px-6 pb-24 pt-32 text-center">
          <div className="mb-4 inline-block rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-blue-100 backdrop-blur-sm">
            Your 24/7 AI Receptionist — PMS Integrated
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
            Onboard Your Practice <br className="hidden sm:block" />
            in Under 2 Minutes
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-blue-100">
            Enter your practice name below and our AI will automatically look up
            your details. Just confirm the info, add your contact details, and
            you&apos;re all set.
          </p>

          {/* Self-serve form */}
          <form onSubmit={handleSubmit} className="mx-auto mt-10 max-w-lg">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                placeholder="Enter your practice name"
                className="flex-1 rounded-lg border-0 px-5 py-3.5 text-gray-900 shadow-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-white"
                required
              />
              <button
                type="submit"
                disabled={researching}
                className="rounded-lg bg-white px-8 py-3.5 font-semibold text-blue-700 shadow-lg transition hover:bg-blue-50 disabled:opacity-50"
              >
                {researching ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Looking up...
                  </span>
                ) : (
                  "Get Started"
                )}
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-red-200">{error}</p>}
          </form>

          <p className="mt-4 text-sm text-blue-200/60">
            No account needed. Takes less than 2 minutes.
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="mx-auto max-w-5xl px-6 py-24">
        <h2 className="text-center text-3xl font-bold text-gray-900">
          How It Works
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-gray-500">
          Three simple steps to get your practice onboarded with Orthia.
        </p>
        <div className="mt-14 grid gap-10 sm:grid-cols-3">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-bold text-white shadow-lg shadow-blue-200">
              1
            </div>
            <h3 className="mt-5 text-lg font-semibold text-gray-900">
              Enter Your Practice Name
            </h3>
            <p className="mt-2 leading-relaxed text-gray-500">
              Type your clinic or practice name and our AI will research your
              details automatically.
            </p>
          </div>
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-bold text-white shadow-lg shadow-blue-200">
              2
            </div>
            <h3 className="mt-5 text-lg font-semibold text-gray-900">
              Review Pre-Filled Details
            </h3>
            <p className="mt-2 leading-relaxed text-gray-500">
              We&apos;ll auto-fill your practice type, locations, and PMS. Just
              review and correct anything that&apos;s off.
            </p>
          </div>
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-bold text-white shadow-lg shadow-blue-200">
              3
            </div>
            <h3 className="mt-5 text-lg font-semibold text-gray-900">
              Submit &amp; You&apos;re Done
            </h3>
            <p className="mt-2 leading-relaxed text-gray-500">
              Add your contact info, hit submit, and our team will get you set
              up right away.
            </p>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="border-t bg-gray-50">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="text-center text-3xl font-bold text-gray-900">
            Why Practices Choose Orthia
          </h2>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">24/7 Availability</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                Never miss a patient call again. Orthia answers every call, day or night, weekends and holidays.
              </p>
            </div>
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">PMS Integrated</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                Works seamlessly with Dentrix, Eaglesoft, Open Dental, and other major practice management systems.
              </p>
            </div>
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">AI-Powered</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                Intelligent AI handles scheduling, patient inquiries, and call routing just like your best receptionist.
              </p>
            </div>
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Smart Call Handling</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                Routes urgent calls, books appointments, and answers common questions — all without putting patients on hold.
              </p>
            </div>
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Cost Effective</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                A fraction of the cost of a full-time receptionist, with none of the scheduling headaches.
              </p>
            </div>
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">HIPAA Compliant</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">
                Built with healthcare privacy in mind. Your patient data is always protected and secure.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-white py-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
          <a href="https://orthia.io" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100">
              <img src="/logo.png" alt="Orthia" className="h-6 w-6 object-contain" />
            </div>
            <span className="text-lg font-bold tracking-tight text-gray-900">
              Orthia <span className="font-light text-gray-400">AI</span>
            </span>
          </a>
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} Orthia. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
