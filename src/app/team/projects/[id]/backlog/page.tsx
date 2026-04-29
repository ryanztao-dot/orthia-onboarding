"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useMe } from "../../../team-shell";
import {
  Avatar,
  LabelChip,
  PRIORITY_COLORS,
  STATUS_BG,
  STATUS_LABEL,
  TaskTypeIcon,
} from "@/lib/team/ui";
import type {
  Priority,
  Project,
  PublicUser,
  Sprint,
  Status,
  Task,
  TaskType,
} from "@/lib/team/types";

type Bucket = { kind: "sprint"; sprint: Sprint } | { kind: "backlog" };

export default function BacklogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const me = useMe();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [attachmentCounts, setAttachmentCounts] = useState<Record<number, number>>({});
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);

  const canEdit = me?.user?.role === "admin" || me?.user?.role === "developer";

  async function load() {
    const [pRes, uRes, sRes] = await Promise.all([
      fetch(`/api/team/projects/${id}/tasks?_=${Date.now()}`),
      fetch(`/api/team/users`),
      fetch(`/api/team/projects/${id}/sprints`),
    ]);
    const p = await pRes.json();
    const u = await uRes.json();
    const s = await sRes.json();
    setProject(p.project);
    setTasks(p.tasks || []);
    setUsers(u.users || []);
    setSprints(s.sprints || []);
    setAttachmentCounts(p.attachmentCounts || {});
  }

  async function uploadToTask(taskId: number, file: File): Promise<boolean> {
    if (file.type !== "application/pdf") {
      alert("Only PDF files are allowed.");
      return false;
    }
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`/api/team/tasks/${taskId}/attachments`, {
      method: "POST",
      body: fd,
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "Upload failed.");
      return false;
    }
    load();
    return true;
  }

  useEffect(() => {
    load();
  }, [id]);

  const userById = useMemo(() => {
    const m = new Map<number, PublicUser>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  const byBucket = useMemo(() => {
    const m = new Map<string, Task[]>();
    // Include planned + active sprints first, completed last, backlog last.
    const keyFor = (t: Task) => (t.sprint_id ? `sprint-${t.sprint_id}` : "backlog");
    for (const t of tasks) {
      const k = keyFor(t);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return m;
  }, [tasks]);

  const orderedBuckets: Bucket[] = useMemo(() => {
    const order: Sprint[] = [...sprints].sort((a, b) => {
      const stateOrder = { active: 0, planned: 1, completed: 2 } as const;
      if (a.state !== b.state) return stateOrder[a.state] - stateOrder[b.state];
      return a.position - b.position;
    });
    return [
      ...order.map((s): Bucket => ({ kind: "sprint", sprint: s })),
      { kind: "backlog" },
    ];
  }, [sprints]);

  async function moveToSprint(taskId: number, sprintId: number | null) {
    await fetch(`/api/team/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sprint_id: sprintId }),
    });
    load();
  }

  async function startSprint(sprintId: number) {
    const r = await fetch(`/api/team/sprints/${sprintId}/start`, { method: "POST" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "Failed to start sprint");
      return;
    }
    load();
  }

  async function completeSprint(sprintId: number) {
    if (!confirm("Complete this sprint? Unfinished tasks move back to the backlog.")) return;
    const r = await fetch(`/api/team/sprints/${sprintId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moveTo: null }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "Failed");
      return;
    }
    load();
  }

  async function deleteSprint(sprintId: number) {
    if (!confirm("Delete this sprint? Its tasks move back to the backlog.")) return;
    const r = await fetch(`/api/team/sprints/${sprintId}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "Failed");
      return;
    }
    load();
  }

  async function createTask(sprintId: number | null, title: string): Promise<boolean> {
    const r = await fetch(`/api/team/projects/${id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, sprint_id: sprintId }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "Could not create task.");
      return false;
    }
    load();
    return true;
  }

  if (!project) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        {canEdit && (
          <button
            onClick={() => setShowCreateSprint(true)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Create sprint
          </button>
        )}
      </div>

      <div className="space-y-4">
        {orderedBuckets.map((b) => {
          const key = b.kind === "sprint" ? `sprint-${b.sprint.id}` : "backlog";
          const items = byBucket.get(key) || [];
          return (
            <BucketSection
              key={key}
              bucket={b}
              tasks={items}
              userById={userById}
              project={project}
              canEdit={canEdit}
              onDragTask={(taskId) => setDragging(taskId)}
              onDropHere={() => {
                if (dragging == null) return;
                const targetSprintId = b.kind === "sprint" ? b.sprint.id : null;
                moveToSprint(dragging, targetSprintId);
                setDragging(null);
              }}
              onStartSprint={() => b.kind === "sprint" && startSprint(b.sprint.id)}
              onCompleteSprint={() => b.kind === "sprint" && completeSprint(b.sprint.id)}
              onDeleteSprint={() => b.kind === "sprint" && deleteSprint(b.sprint.id)}
              onCreateTask={(title) =>
                createTask(b.kind === "sprint" ? b.sprint.id : null, title)
              }
              attachmentCounts={attachmentCounts}
              onUpload={uploadToTask}
            />
          );
        })}
      </div>

      {showCreateSprint && (
        <CreateSprintModal
          projectId={Number(id)}
          onClose={() => setShowCreateSprint(false)}
          onCreated={() => {
            setShowCreateSprint(false);
            load();
          }}
        />
      )}
    </>
  );
}

function BucketSection({
  bucket,
  tasks,
  userById,
  project,
  canEdit,
  onDragTask,
  onDropHere,
  onStartSprint,
  onCompleteSprint,
  onDeleteSprint,
  onCreateTask,
  attachmentCounts,
  onUpload,
}: {
  bucket: Bucket;
  tasks: Task[];
  userById: Map<number, PublicUser>;
  project: Project;
  canEdit: boolean;
  onDragTask: (taskId: number) => void;
  onDropHere: () => void;
  onStartSprint: () => void;
  onCompleteSprint: () => void;
  onDeleteSprint: () => void;
  onCreateTask: (title: string) => Promise<boolean>;
  attachmentCounts: Record<number, number>;
  onUpload: (taskId: number, file: File) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function submitNew() {
    const t = newTitle.trim();
    if (!t) return;
    setCreating(true);
    const ok = await onCreateTask(t);
    setCreating(false);
    if (ok) {
      setNewTitle("");
      setAdding(false);
    }
  }
  const pointsTotal = tasks.reduce((sum, t) => sum + (t.story_points ?? 0), 0);
  const doneCount = tasks.filter((t) => t.status === "done").length;

  const title =
    bucket.kind === "sprint" ? bucket.sprint.name : "Backlog";
  const stateBadge =
    bucket.kind === "sprint" ? (
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          bucket.sprint.state === "active"
            ? "bg-emerald-100 text-emerald-700"
            : bucket.sprint.state === "completed"
              ? "bg-slate-200 text-slate-500"
              : "bg-blue-100 text-blue-700"
        }`}
      >
        {bucket.sprint.state}
      </span>
    ) : (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        unplanned
      </span>
    );

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDropHere();
      }}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {stateBadge}
          {bucket.kind === "sprint" && bucket.sprint.goal && (
            <span className="text-xs text-slate-500">· {bucket.sprint.goal}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {tasks.length} task{tasks.length === 1 ? "" : "s"}
            {pointsTotal > 0 && ` · ${pointsTotal} pts`}
            {bucket.kind === "sprint" && ` · ${doneCount} done`}
          </span>
          {canEdit && !adding && (
            <button
              onClick={() => setAdding(true)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              + Add task
            </button>
          )}
          {bucket.kind === "sprint" && canEdit && (
            <div className="flex items-center gap-1">
              {bucket.sprint.state === "planned" && (
                <>
                  <button
                    onClick={onStartSprint}
                    className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Start sprint
                  </button>
                  <button
                    onClick={onDeleteSprint}
                    className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-red-600"
                  >
                    Delete
                  </button>
                </>
              )}
              {bucket.sprint.state === "active" && (
                <button
                  onClick={onCompleteSprint}
                  className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Complete sprint
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      {tasks.length === 0 && !adding ? (
        <div className="px-4 py-8 text-center text-xs italic text-slate-400">
          Drag tasks here{canEdit ? " or click + Add task" : ""}.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {tasks.map((t) => {
            const a = userById.get(t.assignee_id ?? -1);
            return (
              <li
                key={t.id}
                draggable={canEdit}
                onDragStart={() => onDragTask(t.id)}
                className="flex cursor-grab items-center gap-3 px-4 py-2.5 hover:bg-slate-50 active:cursor-grabbing"
              >
                <TaskTypeIcon type={t.type} />
                <span className="w-16 shrink-0 font-mono text-xs text-slate-400">
                  {project.key}-{t.number}
                </span>
                <a
                  href={`/team/tasks/${t.id}`}
                  className="flex-1 truncate text-sm font-medium text-slate-900 hover:text-slate-700"
                >
                  {t.title}
                </a>
                {canEdit && (
                  <RowAttachmentButton
                    count={attachmentCounts[t.id] || 0}
                    onPick={(f) => onUpload(t.id, f)}
                  />
                )}
                <div className="hidden items-center gap-2 sm:flex">
                  {t.labels?.slice(0, 3).map((l) => (
                    <LabelChip key={l} label={l} />
                  ))}
                </div>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    PRIORITY_COLORS[t.priority as Priority]
                  }`}
                >
                  {t.priority}
                </span>
                <span
                  className={`hidden rounded px-1.5 py-0.5 text-[10px] font-semibold sm:inline ${
                    STATUS_BG[t.status as Status]
                  }`}
                >
                  {STATUS_LABEL[t.status as Status]}
                </span>
                {t.story_points != null && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                    {t.story_points}
                  </span>
                )}
                <Avatar name={a?.name} userId={t.assignee_id} size={6} />
              </li>
            );
          })}
        </ul>
      )}
      {adding && canEdit && (
        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNew();
              if (e.key === "Escape") {
                setAdding(false);
                setNewTitle("");
              }
            }}
            autoFocus
            placeholder="Task title…"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            onClick={submitNew}
            disabled={creating || !newTitle.trim()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {creating ? "Adding…" : "Add"}
          </button>
          <button
            onClick={() => {
              setAdding(false);
              setNewTitle("");
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}

function RowAttachmentButton({
  count,
  onPick,
}: {
  count: number;
  onPick: (f: File) => Promise<boolean>;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          await onPick(f);
          setBusy(false);
          if (ref.current) ref.current.value = "";
        }}
      />
      <button
        onClick={(e) => {
          e.stopPropagation();
          ref.current?.click();
        }}
        title={count > 0 ? `${count} attachment${count === 1 ? "" : "s"} — click to add another` : "Upload PDF"}
        disabled={busy}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
      >
        <span aria-hidden>📎</span>
        {count > 0 && <span className="font-medium">{count}</span>}
      </button>
    </>
  );
}

function CreateSprintModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const r = await fetch(`/api/team/projects/${projectId}/sprints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, goal, start_date: start || null, end_date: end || null }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErr(d.error || "Failed");
      return;
    }
    onCreated();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-slate-900">New sprint</h2>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sprint 1"
            autoFocus
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600">Sprint goal</span>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
            placeholder="What does success look like?"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-600">Start date</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600">End date</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
