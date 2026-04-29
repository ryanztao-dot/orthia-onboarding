"use client";

import { useEffect, useMemo, useState } from "react";
import TeamShell, { useMe } from "../team-shell";
import type { Priority, Status, Task } from "@/lib/team/types";

interface DashboardData {
  projects: { id: number; key: string; name: string }[];
  myTasks: Task[];
  recent: Task[];
}

const STATUS_LABEL: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};
const PRIORITY_COLOR: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

export default function DashboardPage() {
  const me = useMe();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/team/dashboard");
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          if (!cancelled) setError(d.error || `Failed to load dashboard (${r.status})`);
          return;
        }
        const d = await r.json();
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Network error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const projectByIdMap = useMemo(() => {
    const m = new Map<number, { key: string; name: string }>();
    (data?.projects || []).forEach((p) => m.set(p.id, p));
    return m;
  }, [data]);

  const grouped = useMemo(() => {
    const g: Record<Status, Task[]> = { todo: [], in_progress: [], in_review: [], done: [] };
    (data?.myTasks || []).forEach((t) => g[t.status].push(t));
    return g;
  }, [data]);

  return (
    <TeamShell>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Hi {me?.user?.name?.split(" ")[0] || ""}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Here&apos;s what you&apos;re working on.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-6">
          {(["in_progress", "in_review", "todo", "done"] as Status[]).map((s) => (
            <div key={s}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {STATUS_LABEL[s]} · {grouped[s].length}
              </h2>
              <div className="mt-2 space-y-2">
                {grouped[s].length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm italic text-slate-400">
                    Nothing here.
                  </p>
                )}
                {grouped[s].map((t) => {
                  const p = projectByIdMap.get(t.project_id);
                  return (
                    <a
                      key={t.id}
                      href={`/team/tasks/${t.id}`}
                      className="block rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-semibold text-slate-400">
                          {p?.key || "?"}-{t.number}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            PRIORITY_COLOR[t.priority]
                          }`}
                        >
                          {t.priority}
                        </span>
                      </div>
                      <div className="mt-1 text-sm font-medium text-slate-900">{t.title}</div>
                      {t.due_date && (
                        <div className="mt-1 text-xs text-slate-500">
                          Due {new Date(t.due_date).toLocaleDateString()}
                        </div>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Projects
            </h2>
            <ul className="mt-3 space-y-2">
              {(data?.projects || []).map((p) => (
                <li key={p.id}>
                  <a
                    href={`/team/projects/${p.id}/board`}
                    className="flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900"
                  >
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                      {p.key}
                    </span>
                    <span className="truncate">{p.name}</span>
                  </a>
                </li>
              ))}
              {(data?.projects || []).length === 0 && (
                <li className="text-sm italic text-slate-400">No projects yet.</li>
              )}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Recently updated
            </h2>
            <ul className="mt-3 space-y-2.5">
              {(data?.recent || []).map((t) => {
                const p = projectByIdMap.get(t.project_id);
                return (
                  <li key={t.id}>
                    <a href={`/team/tasks/${t.id}`} className="block">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-semibold text-slate-400">
                          {p?.key || "?"}-{t.number}
                        </span>
                        <span className="truncate text-sm text-slate-800 hover:text-slate-900">
                          {t.title}
                        </span>
                      </div>
                    </a>
                  </li>
                );
              })}
              {(data?.recent || []).length === 0 && (
                <li className="text-sm italic text-slate-400">No activity yet.</li>
              )}
            </ul>
          </div>
        </aside>
      </div>
    </TeamShell>
  );
}
