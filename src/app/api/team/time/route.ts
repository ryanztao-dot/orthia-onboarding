import { NextRequest, NextResponse } from "next/server";
import { teamDb } from "@/lib/team/supabase";
import { requireUser } from "@/lib/team/user-auth";
import { describeDbError } from "@/lib/team/db-error";
import { taskInProject } from "@/lib/team/validate";
import type { TimeEntry } from "@/lib/team/types";

const MAX_MINUTES = 24 * 60;

// List time entries.
//
// Query params:
//   user=<id>    — show entries for that user (admin only). Default: caller.
//   user=all     — admins only; everyone in the org.
//   from=YYYY-MM-DD, to=YYYY-MM-DD  — date range filter (inclusive).
//   task=<id>   — filter to a single task.
//   project=<id> — filter to a single project.
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const url = new URL(req.url);

  const userParam = url.searchParams.get("user");
  const isAdmin = user.role === "admin";
  let userFilter: number[] | "all" | null = null;
  if (userParam === "all") {
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    userFilter = "all";
  } else if (userParam) {
    const id = Number(userParam);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }
    if (id !== user.id && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    userFilter = [id];
  } else {
    userFilter = [user.id];
  }

  // Org scope: only entries from users in the caller's org.
  const { data: orgUsers } = await teamDb
    .from("tt_users")
    .select("id")
    .eq("organization_id", user.organization_id);
  const orgUserIds = ((orgUsers as { id: number }[] | null) || []).map((u) => u.id);

  let q = teamDb
    .from("tt_time_entries")
    .select("*")
    .in("user_id", userFilter === "all" ? orgUserIds : userFilter);

  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from) q = q.gte("entry_date", from);
  if (to) q = q.lte("entry_date", to);

  const taskParam = url.searchParams.get("task");
  if (taskParam) q = q.eq("task_id", Number(taskParam));
  const projectParam = url.searchParams.get("project");
  if (projectParam) q = q.eq("project_id", Number(projectParam));

  const { data, error } = await q.order("entry_date", { ascending: false }).order("created_at", {
    ascending: false,
  });
  if (error) return NextResponse.json({ error: describeDbError(error) }, { status: 500 });

  const entries = (data || []) as TimeEntry[];
  // Hydrate the tasks referenced by any entry so the client can render
  // titles/numbers without per-task round-trips.
  const taskIds = Array.from(
    new Set(entries.map((e) => e.task_id).filter((id): id is number => id != null)),
  );
  let tasks: { id: number; number: number; title: string; project_id: number }[] = [];
  if (taskIds.length > 0) {
    const { data: tRows } = await teamDb
      .from("tt_tasks")
      .select("id, number, title, project_id")
      .in("id", taskIds);
    tasks = (tRows as typeof tasks | null) || [];
  }
  return NextResponse.json({ entries, tasks });
}

// Create a time entry.
//
// Body: { task_id?: number, project_id?: number, entry_date: 'YYYY-MM-DD', minutes: number, notes?: string }
// Either task_id or project_id should be provided. If task_id is given, project_id is auto-derived.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const body = await req.json().catch(() => ({}));

  const minutes = Number(body.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_MINUTES) {
    return NextResponse.json(
      { error: "Minutes must be between 1 and 1440 (24h)" },
      { status: 400 },
    );
  }
  const entryDate = String(body.entry_date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    return NextResponse.json({ error: "entry_date must be YYYY-MM-DD" }, { status: 400 });
  }

  let taskId: number | null = null;
  let projectId: number | null = null;
  if (body.task_id != null) {
    taskId = Number(body.task_id);
    if (!Number.isFinite(taskId)) {
      return NextResponse.json({ error: "Invalid task_id" }, { status: 400 });
    }
    // Validate task is in caller's org and grab its project.
    const { data: task } = await teamDb
      .from("tt_tasks")
      .select("project_id, tt_projects!inner(organization_id)")
      .eq("id", taskId)
      .is("deleted_at", null)
      .maybeSingle();
    const t = task as
      | { project_id: number; tt_projects: { organization_id: number } }
      | null;
    if (!t || t.tt_projects.organization_id !== user.organization_id) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    projectId = t.project_id;
  } else if (body.project_id != null) {
    projectId = Number(body.project_id);
    if (!Number.isFinite(projectId)) {
      return NextResponse.json({ error: "Invalid project_id" }, { status: 400 });
    }
    const { data: project } = await teamDb
      .from("tt_projects")
      .select("id")
      .eq("id", projectId)
      .eq("organization_id", user.organization_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  } else {
    return NextResponse.json(
      { error: "Provide either task_id or project_id" },
      { status: 400 },
    );
  }

  const notes = body.notes ? String(body.notes).slice(0, 2000) : null;

  // taskInProject is overkill here because we already validated; keep import
  // alive only if we add a project + task cross-check later.
  void taskInProject;

  const { data, error } = await teamDb
    .from("tt_time_entries")
    .insert({
      user_id: user.id,
      task_id: taskId,
      project_id: projectId,
      entry_date: entryDate,
      minutes: Math.floor(minutes),
      notes,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  return NextResponse.json({ entry: data as TimeEntry }, { status: 201 });
}
