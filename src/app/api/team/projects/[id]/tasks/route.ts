import { NextRequest, NextResponse } from "next/server";
import { teamDb } from "@/lib/team/supabase";
import { canMutateTasks, requireUser } from "@/lib/team/user-auth";
import { describeDbError } from "@/lib/team/db-error";
import { logActivity } from "@/lib/team/activity";
import { sprintInProject, taskInProject, userInOrg } from "@/lib/team/validate";
import type { Priority, Project, Status, Task, TaskType } from "@/lib/team/types";

const VALID_STATUS: Status[] = ["todo", "in_progress", "in_review", "done"];
const VALID_PRIORITY: Priority[] = ["low", "medium", "high"];
const VALID_TYPE: TaskType[] = ["task", "bug", "story", "epic", "subtask"];

async function getProject(id: number, orgId: number): Promise<Project | null> {
  const { data } = await teamDb
    .from("tt_projects")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as Project) || null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;
  const project = await getProject(Number(id), user.organization_id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const assignee = url.searchParams.get("assignee");
  const priority = url.searchParams.get("priority");
  const sprint = url.searchParams.get("sprint"); // "backlog" → null, number → sprint id, "active" → active sprint, missing → no filter
  const parent = url.searchParams.get("parent");
  const type = url.searchParams.get("type");

  let q = teamDb
    .from("tt_tasks")
    .select("*")
    .eq("project_id", project.id)
    .is("deleted_at", null);
  if (status) q = q.eq("status", status);
  if (priority) q = q.eq("priority", priority);
  if (type) q = q.eq("type", type);
  if (assignee === "null") q = q.is("assignee_id", null);
  else if (assignee) q = q.eq("assignee_id", Number(assignee));
  if (parent === "null") q = q.is("parent_id", null);
  else if (parent) q = q.eq("parent_id", Number(parent));

  if (sprint === "backlog") {
    q = q.is("sprint_id", null);
  } else if (sprint === "active") {
    const { data: active } = await teamDb
      .from("tt_sprints")
      .select("id")
      .eq("project_id", project.id)
      .eq("state", "active")
      .maybeSingle();
    const a = active as { id: number } | null;
    q = a ? q.eq("sprint_id", a.id) : q.is("sprint_id", null);
  } else if (sprint) {
    q = q.eq("sprint_id", Number(sprint));
  }

  const { data, error } = await q.order("position", { ascending: true });
  if (error) return NextResponse.json({ error: describeDbError(error) }, { status: 500 });

  const tasks = (data || []) as Task[];
  // Fetch attachment counts in one round-trip and merge.
  const attachmentCounts: Record<number, number> = {};
  if (tasks.length > 0) {
    const ids = tasks.map((t) => t.id);
    const { data: attRows } = await teamDb
      .from("tt_attachments")
      .select("task_id")
      .in("task_id", ids);
    for (const row of (attRows as { task_id: number }[] | null) || []) {
      attachmentCounts[row.task_id] = (attachmentCounts[row.task_id] || 0) + 1;
    }
  }
  return NextResponse.json({ tasks, project, attachmentCounts });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  if (!canMutateTasks(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const project = await getProject(Number(id), user.organization_id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const status: Status = VALID_STATUS.includes(body.status) ? body.status : "todo";
  const priority: Priority = VALID_PRIORITY.includes(body.priority) ? body.priority : "medium";
  const type: TaskType = VALID_TYPE.includes(body.type) ? body.type : "task";

  // Next per-project task number
  const { data: latest } = await teamDb
    .from("tt_tasks")
    .select("number")
    .eq("project_id", project.id)
    .order("number", { ascending: false })
    .limit(1);
  const nextNumber = (((latest as { number: number }[] | null) ?? [])[0]?.number ?? 0) + 1;

  // Next position in the target column
  const { data: posRows } = await teamDb
    .from("tt_tasks")
    .select("position")
    .eq("project_id", project.id)
    .eq("status", status)
    .is("deleted_at", null)
    .order("position", { ascending: false })
    .limit(1);
  const nextPosition =
    (((posRows as { position: number }[] | null) ?? [])[0]?.position ?? -1) + 1;

  const assigneeId = body.assignee_id === null ? null : body.assignee_id ? Number(body.assignee_id) : user.id;
  const reporterId = body.reporter_id === null ? null : body.reporter_id ? Number(body.reporter_id) : user.id;
  const sprintId = body.sprint_id ? Number(body.sprint_id) : null;
  const parentId = body.parent_id ? Number(body.parent_id) : null;
  const storyPoints =
    typeof body.story_points === "number" && Number.isFinite(body.story_points)
      ? Math.max(0, Math.floor(body.story_points))
      : null;
  const labels = Array.isArray(body.labels)
    ? body.labels
        .map((l: unknown) => String(l).trim())
        .filter((l: string) => l.length > 0)
        .slice(0, 20)
    : [];

  // Cross-org / cross-project pointer validation — reject IDs that point
  // outside the caller's org or this project.
  if (!(await sprintInProject(sprintId, project.id))) {
    return NextResponse.json({ error: "Sprint does not belong to this project" }, { status: 400 });
  }
  if (!(await taskInProject(parentId, project.id))) {
    return NextResponse.json({ error: "Parent task does not belong to this project" }, { status: 400 });
  }
  if (!(await userInOrg(assigneeId, user.organization_id))) {
    return NextResponse.json({ error: "Assignee is not in this organization" }, { status: 400 });
  }
  if (!(await userInOrg(reporterId, user.organization_id))) {
    return NextResponse.json({ error: "Reporter is not in this organization" }, { status: 400 });
  }

  // Retry on 23505 (unique_violation on project_id, number). Two concurrent
  // creates will race the max-number read; the losing writer retries.
  let task: Task | null = null;
  let lastErr: { message?: string; code?: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: latest } = await teamDb
      .from("tt_tasks")
      .select("number")
      .eq("project_id", project.id)
      .order("number", { ascending: false })
      .limit(1);
    const nextNumber = (((latest as { number: number }[] | null) ?? [])[0]?.number ?? 0) + 1 + attempt;

    const { data, error } = await teamDb
      .from("tt_tasks")
      .insert({
        project_id: project.id,
        number: nextNumber,
        title,
        description: body.description || null,
        status,
        priority,
        type,
        assignee_id: assigneeId,
        reporter_id: reporterId,
        creator_id: user.id,
        due_date: body.due_date || null,
        start_date: body.start_date || null,
        position: nextPosition,
        sprint_id: sprintId,
        parent_id: parentId,
        story_points: storyPoints,
        labels,
      })
      .select()
      .single();
    if (!error && data) {
      task = data as Task;
      break;
    }
    lastErr = error;
    if (error?.code !== "23505") break; // only retry on unique violation
  }
  if (!task) {
    return NextResponse.json(
      { error: describeDbError(lastErr) || "Failed" },
      { status: 500 },
    );
  }

  await logActivity(task.id, user.id, "created", { status: task.status, type: task.type });
  if (task.assignee_id != null) {
    await logActivity(task.id, user.id, "assigned", { from: null, to: task.assignee_id });
  }
  return NextResponse.json({ task });
}
