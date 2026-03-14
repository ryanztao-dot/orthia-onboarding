"use client";

import { useState, useEffect, useCallback } from "react";
import type { Submission } from "@/lib/types";

interface ResearchData {
  found: boolean;
  confidence: string;
  data: Record<string, unknown>;
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  const [clinicName, setClinicName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [generateError, setGenerateError] = useState("");
  const [researchResult, setResearchResult] = useState<ResearchData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [hint, setHint] = useState("");

  const fetchSubmissions = useCallback(async () => {
    setLoadingSubmissions(true);
    try {
      const res = await fetch("/api/submissions");
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      const data = await res.json();
      setSubmissions(data.submissions || []);
    } catch {
      // ignore
    } finally {
      setLoadingSubmissions(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/submissions")
      .then((res) => {
        if (res.ok) {
          setAuthenticated(true);
          return res.json();
        }
        return null;
      })
      .then((data) => {
        if (data) setSubmissions(data.submissions || []);
      });
  }, []);

  useEffect(() => {
    if (authenticated) fetchSubmissions();
  }, [authenticated, fetchSubmissions]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        setAuthenticated(true);
        setPassword("");
      } else {
        setLoginError("Invalid password");
      }
    } catch {
      setLoginError("Login failed");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleResearch(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicName.trim()) return;

    setGenerating(true);
    setGeneratedLink("");
    setGenerateError("");
    setResearchResult(null);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicName: clinicName.trim(), step: "research" }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to research");
      }

      const result: ResearchData = await res.json();
      setResearchResult(result);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to research");
    } finally {
      setGenerating(false);
    }
  }

  async function handleConfirm() {
    if (!researchResult) return;
    setConfirming(true);
    setGenerateError("");

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicName: clinicName.trim(),
          step: "confirm",
          researchData: researchResult.data,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      const data = await res.json();
      setGeneratedLink(window.location.origin + data.link);
      setClinicName("");
      setResearchResult(null);
      setHint("");
      fetchSubmissions();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setConfirming(false);
    }
  }

  async function handleSkip() {
    setConfirming(true);
    setGenerateError("");

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicName: clinicName.trim(), step: "skip" }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }

      const data = await res.json();
      setGeneratedLink(window.location.origin + data.link);
      setClinicName("");
      setResearchResult(null);
      setHint("");
      fetchSubmissions();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setConfirming(false);
    }
  }

  function handleRetry() {
    setResearchResult(null);
    setGenerateError("");
    setHint("Try adding city or state for better results");
  }

  async function handleDelete(id: string, practiceName: string) {
    if (!window.confirm(`Delete submission for "${practiceName}"? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/submissions?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
      fetchSubmissions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete submission");
    }
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-8 shadow-sm"
        >
          <h1 className="text-xl font-semibold">Admin Login</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter admin password"
            className="w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <button
            type="submit"
            disabled={loginLoading}
            className="w-full rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loginLoading ? "Logging in..." : "Login"}
          </button>
        </form>
      </main>
    );
  }

  const rd = researchResult?.data;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      {/* Generate Form */}
      {!researchResult && (
        <form
          onSubmit={handleResearch}
          className="mt-6 flex items-end gap-3 rounded-lg border bg-white p-4"
        >
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Clinic Name
            </label>
            <input
              type="text"
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              placeholder={hint || "e.g. Smile Dental Group"}
              className="w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            {hint && <p className="mt-1 text-xs text-blue-600">{hint}</p>}
          </div>
          <button
            type="submit"
            disabled={generating}
            className="rounded bg-blue-600 px-5 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? "Researching..." : "Generate Form"}
          </button>
        </form>
      )}

      {/* Confirmation Card — AI found results */}
      {researchResult && researchResult.found && (
        <div className="mt-6 rounded-lg border bg-white p-5">
          <h3 className="font-semibold text-gray-900">Is this the right practice?</h3>
          <div className="mt-3 space-y-1.5">
            <div className="flex gap-2 text-sm">
              <span className="w-20 shrink-0 font-medium text-gray-500">Name</span>
              <span className="text-gray-900">{(rd?.officialName as string) || clinicName}</span>
            </div>
            {rd?.address && (
              <div className="flex gap-2 text-sm">
                <span className="w-20 shrink-0 font-medium text-gray-500">Address</span>
                <span className="text-gray-900">{rd.address as string}</span>
              </div>
            )}
            {rd?.officePhone && (
              <div className="flex gap-2 text-sm">
                <span className="w-20 shrink-0 font-medium text-gray-500">Phone</span>
                <span className="text-gray-900">{rd.officePhone as string}</span>
              </div>
            )}
            {rd?.website && (
              <div className="flex gap-2 text-sm">
                <span className="w-20 shrink-0 font-medium text-gray-500">Website</span>
                <a href={rd.website as string} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline truncate">{rd.website as string}</a>
              </div>
            )}
            {rd?.practiceType && (
              <div className="flex gap-2 text-sm">
                <span className="w-20 shrink-0 font-medium text-gray-500">Type</span>
                <span className="text-gray-900">{rd.practiceType as string}</span>
              </div>
            )}
          </div>
          {researchResult.confidence !== "high" && (
            <p className="mt-2 text-xs text-amber-600">Low confidence match — please verify.</p>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={handleConfirm} disabled={confirming} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {confirming ? "Creating..." : "Yes, create form"}
            </button>
            <button onClick={handleRetry} disabled={confirming} className="rounded border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Wrong, try again
            </button>
            <button onClick={handleSkip} disabled={confirming} className="rounded border px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
              Skip, create blank
            </button>
          </div>
          {generateError && <p className="mt-2 text-sm text-red-600">{generateError}</p>}
        </div>
      )}

      {/* Not Found Card */}
      {researchResult && !researchResult.found && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h3 className="font-semibold text-gray-900">Couldn&apos;t find &ldquo;{clinicName}&rdquo;</h3>
          <p className="mt-1 text-sm text-gray-600">No matching practice found. Try a more specific name or create a blank form.</p>
          <div className="mt-4 flex gap-2">
            <button onClick={handleRetry} disabled={confirming} className="rounded border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50">
              Try again
            </button>
            <button onClick={handleSkip} disabled={confirming} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {confirming ? "Creating..." : "Create blank form"}
            </button>
          </div>
          {generateError && <p className="mt-2 text-sm text-red-600">{generateError}</p>}
        </div>
      )}

      {generateError && !researchResult && (
        <p className="mt-2 text-sm text-red-600">{generateError}</p>
      )}

      {generatedLink && (
        <div className="mt-3 rounded border border-green-200 bg-green-50 p-3">
          <p className="text-sm font-medium text-green-800">Shareable link created:</p>
          <div className="mt-1 flex items-center gap-2">
            <a href={generatedLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline break-all">
              {generatedLink}
            </a>
            <button
              onClick={() => { navigator.clipboard.writeText(generatedLink); }}
              className="shrink-0 rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Submissions Table */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Submissions</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (submissions.length === 0) return;
                const headers = ["Practice Name","PMS","Contact","Email","Office Phone","Insurance","Status","Created","Link"];
                const rows = submissions.map(s => [
                  s.practice_name,
                  s.pms || "",
                  s.contact_name || "",
                  s.email || "",
                  s.office_phone || "",
                  (s.form_data as Record<string, unknown>)?.wantsInsurance ? "Yes" : "No",
                  s.status,
                  new Date(s.created_at).toLocaleDateString(),
                  window.location.origin + `/onboard/${s.slug}`,
                ]);
                const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `orthia-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              disabled={submissions.length === 0}
              className="text-sm text-green-600 hover:underline disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              onClick={fetchSubmissions}
              disabled={loadingSubmissions}
              className="text-sm text-blue-600 hover:underline disabled:opacity-50"
            >
              {loadingSubmissions ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-medium">Practice Name</th>
                <th className="px-4 py-3 font-medium">PMS</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Office Phone</th>
                <th className="px-4 py-3 font-medium">Insurance</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {submissions.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    No submissions yet
                  </td>
                </tr>
              )}
              {submissions.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{s.practice_name}</td>
                  <td className="px-4 py-3">{s.pms || "—"}</td>
                  <td className="px-4 py-3">{s.contact_name || "—"}</td>
                  <td className="px-4 py-3">{s.email || "—"}</td>
                  <td className="px-4 py-3">{s.office_phone || "—"}</td>
                  <td className="px-4 py-3">
                    {(s.form_data as Record<string, unknown>)?.wantsInsurance ? (
                      <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Yes</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.status === "complete"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a
                        href={`/onboard/${s.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Open
                      </a>
                      <button
                        onClick={() => navigator.clipboard.writeText(window.location.origin + `/onboard/${s.slug}`)}
                        className="text-gray-500 hover:text-gray-700 hover:underline"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => handleDelete(s.id, s.practice_name)}
                        className="text-red-500 hover:text-red-700 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
