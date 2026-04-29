"use client";

import { useEffect, useState } from "react";
import TeamShell, { useMe } from "../team-shell";
import type { Project } from "@/lib/team/types";

export default function ProjectsPage() {
  const me = useMe();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/team/projects");
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setLoadError(d.error || `Failed to load projects (${r.status})`);
        setLoading(false);
        return;
      }
      const d = await r.json();
      setProjects(d.projects || []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const trimmedKey = key.trim();
    if (trimmedKey.length < 2 || trimmedKey.length > 8) {
      setError("Key must be 2–8 characters.");
      return;
    }
    if (!/^[A-Z0-9]+$/.test(trimmedKey)) {
      setError("Key must be uppercase letters and digits only.");
      return;
    }
    setCreating(true);
    setError("");
    const r = await fetch("/api/team/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, key: trimmedKey, description }),
    });
    setCreating(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.error || "Failed");
      return;
    }
    setShowCreate(false);
    setName("");
    setKey("");
    setDescription("");
    load();
  }

  return (
    <TeamShell title="Projects">
      <div className="mb-6 flex justify-between">
        <p className="text-sm text-slate-500">
          {projects.length} project{projects.length === 1 ? "" : "s"}
        </p>
        {me?.user?.role === "admin" && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            New project
          </button>
        )}
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {loadError}{" "}
          <button onClick={load} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <p className="text-sm text-slate-500">No projects yet.</p>
          {me?.user?.role === "admin" && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Create the first project →
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <a
              key={p.id}
              href={`/team/projects/${p.id}/board`}
              className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                  {p.key}
                </span>
                {p.archived_at && (
                  <span className="text-xs text-slate-400">Archived</span>
                )}
              </div>
              <h3 className="mt-3 font-semibold text-slate-900 group-hover:text-slate-700">
                {p.name}
              </h3>
              {p.description && (
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{p.description}</p>
              )}
            </a>
          ))}
        </div>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => setShowCreate(false)}
        >
          <form
            onSubmit={create}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-2xl"
          >
            <h2 className="text-lg font-semibold text-slate-900">New project</h2>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                required
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600">Key (2–8 chars)</span>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                placeholder="e.g. ORT"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                maxLength={8}
                required
              />
              <span className="mt-1 block text-xs text-slate-400">
                Used for task IDs: {key || "KEY"}-1, {key || "KEY"}-2, etc.
              </span>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </TeamShell>
  );
}
