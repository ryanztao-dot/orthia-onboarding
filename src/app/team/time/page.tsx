"use client";

import { useEffect, useMemo, useState } from "react";
import TeamShell, { useMe } from "../team-shell";
import type { Project, PublicUser, Task, TimeEntry } from "@/lib/team/types";

interface ProjectsResp {
  projects: Project[];
}

interface TaskRef {
  id: number;
  number: number;
  title: string;
  project_id: number;
}

type ViewMode = "entries" | "summary";

export default function TimePage() {
  const me = useMe();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [taskRefs, setTaskRefs] = useState<TaskRef[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"me" | "all">("me");
  const [view, setView] = useState<ViewMode>("entries");
  const [from, setFrom] = useState(() => isoDate(daysAgo(14)));
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [error, setError] = useState<string | null>(null);

  const isAdmin = me?.user?.role === "admin";

  // Keep `to` >= `from` so the filter never silently returns nothing.
  function setFromClamped(v: string) {
    setFrom(v);
    if (v && to && v > to) setTo(v);
  }

  async function load() {
    setError(null);
    try {
      const userParam = scope === "all" ? "all" : "";
      const qs = new URLSearchParams();
      if (userParam) qs.set("user", userParam);
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const [eRes, pRes, uRes] = await Promise.all([
        fetch(`/api/team/time?${qs.toString()}`),
        fetch("/api/team/projects"),
        fetch("/api/team/users"),
      ]);
      if (!eRes.ok) {
        const d = await eRes.json().catch(() => ({}));
        setError(d.error || "Could not load time entries");
        setLoading(false);
        return;
      }
      const e = await eRes.json();
      const p: ProjectsResp = await pRes.json();
      const u = await uRes.json();
      setEntries(e.entries || []);
      setTaskRefs(e.tasks || []);
      setProjects(p.projects || []);
      setUsers(u.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, from, to]);

  const projectById = useMemo(() => {
    const m = new Map<number, Project>();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  const userById = useMemo(() => {
    const m = new Map<number, PublicUser>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  const totalMinutes = entries.reduce((s, e) => s + e.minutes, 0);

  return (
    <TeamShell title="Time">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-600">From</span>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFromClamped(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600">To</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <div className="flex h-9 items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
            {(["entries", "summary"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                  view === v
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          {isAdmin && (
            <div className="flex h-9 items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
              {(["me", "all"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${
                    scope === s
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {s === "me" ? "My time" : "Everyone"}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="text-sm text-slate-500">
          Total: <strong className="text-slate-900">{formatMinutes(totalMinutes)}</strong>
        </span>
      </div>

      <NewEntryForm projects={projects} onCreated={load} />

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm italic text-slate-400">No entries in this range.</p>
        ) : view === "entries" ? (
          <EntriesList
            entries={entries}
            projectById={projectById}
            userById={userById}
            showUser={scope === "all"}
            onChanged={load}
            currentUserId={me?.user?.id ?? -1}
            isAdmin={isAdmin}
          />
        ) : (
          <Summary
            entries={entries}
            projectById={projectById}
            userById={userById}
            taskRefs={taskRefs}
            showUser={scope === "all"}
          />
        )}
      </div>
    </TeamShell>
  );
}

function Summary({
  entries,
  projectById,
  userById,
  taskRefs,
  showUser,
}: {
  entries: TimeEntry[];
  projectById: Map<number, Project>;
  userById: Map<number, PublicUser>;
  taskRefs: TaskRef[];
  showUser: boolean;
}) {
  const taskById = useMemo(() => {
    const m = new Map<number, TaskRef>();
    taskRefs.forEach((t) => m.set(t.id, t));
    return m;
  }, [taskRefs]);

  const byProject = useMemo(() => {
    const m = new Map<number | "none", { minutes: number; entries: TimeEntry[] }>();
    for (const e of entries) {
      const k = e.project_id ?? "none";
      const cur = m.get(k) || { minutes: 0, entries: [] };
      cur.minutes += e.minutes;
      cur.entries.push(e);
      m.set(k, cur);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].minutes - a[1].minutes);
  }, [entries]);

  const byTask = useMemo(() => {
    const m = new Map<number | "none", number>();
    for (const e of entries) {
      const k = e.task_id ?? "none";
      m.set(k, (m.get(k) || 0) + e.minutes);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const byUser = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of entries) {
      m.set(e.user_id, (m.get(e.user_id) || 0) + e.minutes);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SummaryCard title="By project">
        {byProject.length === 0 ? (
          <p className="text-xs italic text-slate-400">No data.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {byProject.map(([k, v]) => {
              const proj = k === "none" ? null : projectById.get(k as number);
              return (
                <li key={String(k)} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="flex items-center gap-2">
                    {proj ? (
                      <>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                          {proj.key}
                        </span>
                        <span className="truncate">{proj.name}</span>
                      </>
                    ) : (
                      <span className="italic text-slate-500">No project</span>
                    )}
                  </span>
                  <span className="font-semibold text-slate-900">{formatMinutes(v.minutes)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </SummaryCard>
      <SummaryCard title="By task">
        {byTask.length === 0 ? (
          <p className="text-xs italic text-slate-400">No data.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {byTask.map(([k, m]) => {
              const t = k === "none" ? null : taskById.get(k as number);
              const proj = t ? projectById.get(t.project_id) : null;
              return (
                <li key={String(k)} className="flex items-center justify-between py-1.5 text-sm">
                  {t ? (
                    <a
                      href={`/team/tasks/${t.id}`}
                      className="flex min-w-0 flex-1 items-center gap-2 truncate hover:underline"
                    >
                      {proj && (
                        <span className="font-mono text-[10px] font-semibold text-slate-400">
                          {proj.key}-{t.number}
                        </span>
                      )}
                      <span className="truncate">{t.title}</span>
                    </a>
                  ) : (
                    <span className="italic text-slate-500">No task</span>
                  )}
                  <span className="ml-2 font-semibold text-slate-900">{formatMinutes(m)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </SummaryCard>
      {showUser && (
        <SummaryCard title="By person">
          {byUser.length === 0 ? (
            <p className="text-xs italic text-slate-400">No data.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {byUser.map(([uid, m]) => {
                const u = userById.get(uid);
                return (
                  <li key={uid} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="truncate">{u?.name || `User #${uid}`}</span>
                    <span className="font-semibold text-slate-900">{formatMinutes(m)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </SummaryCard>
      )}
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function NewEntryForm({
  projects,
  onCreated,
}: {
  projects: Project[];
  onCreated: () => void;
}) {
  const [date, setDate] = useState(isoDate(new Date()));
  const [projectId, setProjectId] = useState<string>("");
  const [taskId, setTaskId] = useState<string>("");
  const [hours, setHours] = useState("1");
  const [notes, setNotes] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setTasks([]);
      setTaskId("");
      return;
    }
    fetch(`/api/team/projects/${projectId}/tasks`)
      .then((r) => r.json())
      .then((d) => setTasks(d.tasks || []))
      .catch(() => setTasks([]));
  }, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = parseFloat(hours);
    const minutes = Math.round(parsed * 60);
    if (!Number.isFinite(parsed) || parsed < 0.25) {
      setError("Enter at least 0.25 hours (15 minutes).");
      return;
    }
    if (minutes <= 0 || minutes > 24 * 60) {
      setError("Hours must be between 0.25 and 24.");
      return;
    }
    if (!projectId) {
      setError("Pick a project.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/team/time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_date: date,
          minutes,
          project_id: Number(projectId),
          task_id: taskId ? Number(taskId) : null,
          notes: notes.trim() || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "Could not save entry.");
        return;
      }
      setHours("1");
      setNotes("");
      setTaskId("");
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Log time</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-[8rem_1fr_1fr_6rem]">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          required
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.key} · {p.name}
            </option>
          ))}
        </select>
        <select
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          disabled={!projectId}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
        >
          <option value="">Task (optional)…</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              #{t.number} · {t.title}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0.25"
            step="0.25"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="text-xs text-slate-500">h</span>
        </div>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="What did you work on?"
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Add entry"}
        </button>
      </div>
    </form>
  );
}

function EntriesList({
  entries,
  projectById,
  userById,
  showUser,
  onChanged,
  currentUserId,
  isAdmin,
}: {
  entries: TimeEntry[];
  projectById: Map<number, Project>;
  userById: Map<number, PublicUser>;
  showUser: boolean;
  onChanged: () => void;
  currentUserId: number;
  isAdmin: boolean;
}) {
  // Group by date for display.
  const byDate = useMemo(() => {
    const m = new Map<string, TimeEntry[]>();
    for (const e of entries) {
      if (!m.has(e.entry_date)) m.set(e.entry_date, []);
      m.get(e.entry_date)!.push(e);
    }
    return Array.from(m.entries());
  }, [entries]);

  return (
    <div className="space-y-4">
      {byDate.map(([date, items]) => {
        const total = items.reduce((s, e) => s + e.minutes, 0);
        return (
          <section key={date} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm">
              <span className="font-semibold text-slate-700">
                {new Date(date + "T00:00:00").toLocaleDateString(undefined, {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span className="text-xs text-slate-500">{formatMinutes(total)}</span>
            </header>
            <ul className="divide-y divide-slate-100">
              {items.map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  project={e.project_id ? projectById.get(e.project_id) || null : null}
                  user={userById.get(e.user_id) || null}
                  showUser={showUser}
                  onChanged={onChanged}
                  canModify={e.user_id === currentUserId || isAdmin}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function EntryRow({
  entry,
  project,
  user,
  showUser,
  onChanged,
  canModify,
}: {
  entry: TimeEntry;
  project: Project | null;
  user: PublicUser | null;
  showUser: boolean;
  onChanged: () => void;
  canModify: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState((entry.minutes / 60).toString());
  const [notes, setNotes] = useState(entry.notes || "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const parsed = parseFloat(hours);
    const minutes = Math.round(parsed * 60);
    if (!Number.isFinite(parsed) || parsed < 0.25 || minutes > 24 * 60) {
      alert("Hours must be between 0.25 and 24.");
      return;
    }
    setBusy(true);
    const r = await fetch(`/api/team/time/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes, notes: notes.trim() || null }),
    });
    setBusy(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "Save failed");
      return;
    }
    setEditing(false);
    onChanged();
  }

  async function remove() {
    if (!confirm("Delete this entry?")) return;
    setBusy(true);
    const r = await fetch(`/api/team/time/${entry.id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "Delete failed");
      return;
    }
    onChanged();
  }

  return (
    <li className="px-4 py-3 text-sm">
      {editing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.25"
              min="0.25"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
            />
            <span className="text-xs text-slate-500">h</span>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {showUser && user && (
                <span className="font-medium text-slate-700">{user.name}</span>
              )}
              {project && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                  {project.key}
                </span>
              )}
              {entry.task_id && (
                <a
                  href={`/team/tasks/${entry.task_id}`}
                  className="font-medium text-slate-700 hover:underline"
                >
                  Task #{entry.task_id}
                </a>
              )}
              <span className="font-semibold text-slate-900">
                {formatMinutes(entry.minutes)}
              </span>
            </div>
            {entry.notes && (
              <p className="mt-1 whitespace-pre-wrap text-slate-700">{entry.notes}</p>
            )}
          </div>
          {canModify && (
            <div className="flex shrink-0 gap-2 text-xs text-slate-400">
              <button onClick={() => setEditing(true)} className="hover:text-slate-800">
                Edit
              </button>
              <button onClick={remove} className="hover:text-red-600">
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
