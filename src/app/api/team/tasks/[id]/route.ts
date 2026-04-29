import { NextRequest, NextResponse } from "next/server";
import { teamDb } from "@/lib/team/supabase";
import { canMutateTasks, requireUser } from "@/lib/team/user-auth";
import { describeDbError } from "@/lib/team/db-error";
import { logActivity } from "@/lib/team/activity";
import { sprintInProject, userInOrg } from "@/lib/team/validate";
import type { Priority, Task, TaskType } from "@/lib/team/types";

const VALID_PRIORITY: Priority[] = ["low", "medium", "high"];
const VALID_TYPE: TaskType[] = ["task", "bug", "story", "epic", "subtask"];

async function loadTaskInOrg(taskId: number, orgId: number) {
  const { data } = await teamDb
    .from("tt_tasks")
    .select("*, tt_projects!inner(organization_id,id,key)")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const t = data as Task & { tt_projects: { organization_id: number; id: number; key: string } };
  if (t.tt_projects.organization_id !== orgId) return null;
  return t;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;
  const task = await loadTaskInOrg(Number(id), user.organization_id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [commentsRes, activitiesRes, usersRes, subtasksRes, sprintsRes, parentRes, attachmentsRes] = await Promise.all([
    teamDb
      .from("tt_comments")
      .select("*")
      .eq("task_id", task.id)
      .order("created_at", { ascending: true }),
    teamDb
      .from("tt_activities")
      .select("*")
      .eq("task_id", task.id)
      .order("created_at", { ascending: true }),
    teamDb.from("tt_users").select("id,name,email,role").eq("organization_id", user.organization_id),
    teamDb
      .from("tt_tasks")
      .select("id,number,title,status,assignee_id,type")
      .eq("parent_id", task.id)
      .is("deleted_at", null)
      .order("number", { ascending: true }),
    teamDb
      .from("tt_sprints")
      .select("id,name,state")
      .eq("project_id", task.project_id)
      .order("position", { ascending: true }),
    task.parent_id
      ? teamDb
          .from("tt_tasks")
          .select("id,number,title,status,type")
          .eq("id", task.parent_id)
          .is("deleted_at", null)
          .eq("project_id", task.project_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    teamDb
      .from("tt_attachments")
      .select("*")
      .eq("task_id", task.id)
      .order("created_at", { ascending: false }),
  ]);
  // If any sub-query failed (network, permissions, etc.), surface it instead
  // of returning silently truncated data.
  const subErr =
    commentsRes.error ||
    activitiesRes.error ||
    usersRes.error ||
    subtasksRes.error ||
    sprintsRes.error ||
    attachmentsRes.error;
  if (subErr) {
    return NextResponse.json({ error: describeDbError(subErr) }, { status: 500 });
  }
  return NextResponse.json({
    task,
    project: task.tt_projects,
    comments: commentsRes.data || [],
    activities: activitiesRes.data || [],
    users: usersRes.data || [],
    subtasks: subtasksRes.data || [],
    sprints: sprintsRes.data || [],
    parent: parentRes.data || null,
    attachments: attachmentsRes.data || [],
  });
}

export async function PATCH(
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
  const task = await loadTaskInOrg(Number(id), user.organization_id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const patch: Record<string, unknown> = {};

  if (typeof body.title === "string" && body.title.trim() && body.title !== task.title) {
    patch.title = body.title.trim();
    await logActivity(task.id, user.id, "title_changed", { from: task.title, to: body.title.trim() });
  }
  if (typeof body.description === "string" && body.description !== (task.description ?? "")) {
    patch.description = body.description;
    await logActivity(task.id, user.id, "description_changed", {});
  }
  if (typeof body.priority === "string" && VALID_PRIORITY.includes(body.priority) && body.priority !== task.priority) {
    patch.priority = body.priority as Priority;
    await logActivity(task.id, user.id, "priority_changed", { from: task.priority, to: body.priority });
  }
  if (typeof body.type === "string" && VALID_TYPE.includes(body.type) && body.type !== task.type) {
    patch.type = body.type as TaskType;
    await logActivity(task.id, user.id, "type_changed", { from: task.type, to: body.type });
  }
  if ("assignee_id" in body) {
    const newAssignee = body.assignee_id === null ? null : Number(body.assignee_id);
    if (newAssignee !== task.assignee_id) {
      if (!(await userInOrg(newAssignee, user.organization_id))) {
        return NextResponse.json(
          { error: "Assignee is not in this organization" },
          { status: 400 },
        );
      }
      patch.assignee_id = newAssignee;
      if (newAssignee === null) {
        await logActivity(task.id, user.id, "unassigned", { from: task.assignee_id });
      } else {
        await logActivity(task.id, user.id, "assigned", { from: task.assignee_id, to: newAssignee });
      }
    }
  }
  if ("reporter_id" in body) {
    const newReporter = body.reporter_id === null ? null : Number(body.reporter_id);
    if (newReporter !== task.reporter_id) {
      if (!(await userInOrg(newReporter, user.organization_id))) {
        return NextResponse.json(
          { error: "Reporter is not in this organization" },
          { status: 400 },
        );
      }
      patch.reporter_id = newReporter;
      await logActivity(task.id, user.id, "reporter_changed", {
        from: task.reporter_id,
        to: newReporter,
      });
    }
  }
  if ("due_date" in body) {
    const newDue = body.due_date || null;
    if (newDue !== task.due_date) {
      patch.due_date = newDue;
      await logActivity(task.id, user.id, "due_date_changed", { from: task.due_date, to: newDue });
    }
  }
  if ("start_date" in body) {
    const newStart = body.start_date || null;
    if (newStart !== task.start_date) {
      patch.start_date = newStart;
      await logActivity(task.id, user.id, "start_date_changed", {
        from: task.start_date,
        to: newStart,
      });
    }
  }
  if ("sprint_id" in body) {
    const newSprint = body.sprint_id === null ? null : Number(body.sprint_id);
    if (newSprint !== task.sprint_id) {
      if (!(await sprintInProject(newSprint, task.project_id))) {
        return NextResponse.json(
          { error: "Sprint does not belong to this project" },
          { status: 400 },
        );
      }
      patch.sprint_id = newSprint;
      await logActivity(task.id, user.id, "sprint_changed", {
        from: task.sprint_id,
        to: newSprint,
      });
    }
  }
  if ("parent_id" in body) {
    const newParent = body.parent_id === null ? null : Number(body.parent_id);
    if (newParent !== task.parent_id) {
      // Guard: can't parent a task to itself, and parent must be in the same project.
      if (newParent !== null) {
        if (newParent === task.id) {
          return NextResponse.json({ error: "A task can't be its own parent" }, { status: 400 });
        }
        const { data: parent } = await teamDb
          .from("tt_tasks")
          .select("project_id")
          .eq("id", newParent)
          .maybeSingle();
        const p = parent as { project_id: number } | null;
        if (!p || p.project_id !== task.project_id) {
          return NextResponse.json(
            { error: "Parent must be in the same project" },
            { status: 400 },
          );
        }
      }
      patch.parent_id = newParent;
      await logActivity(task.id, user.id, "parent_changed", {
        from: task.parent_id,
        to: newParent,
      });
    }
  }
  if ("story_points" in body) {
    const raw = body.story_points;
    const newPoints =
      raw === null || raw === ""
        ? null
        : Number.isFinite(Number(raw))
          ? Math.max(0, Math.floor(Number(raw)))
          : undefined;
    if (newPoints !== undefined && newPoints !== task.story_points) {
      patch.story_points = newPoints;
      await logActivity(task.id, user.id, "story_points_changed", {
        from: task.story_points,
        to: newPoints,
      });
    }
  }
  if ("labels" in body && Array.isArray(body.labels)) {
    const cleaned = body.labels
      .map((l: unknown) => String(l).trim())
      .filter((l: string) => l.length > 0)
      .slice(0, 20);
    const a = JSON.stringify([...(task.labels || [])].sort());
    const b = JSON.stringify([...cleaned].sort());
    if (a !== b) {
      patch.labels = cleaned;
      await logActivity(task.id, user.id, "labels_changed", {
        from: task.labels,
        to: cleaned,
      });
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ task });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await teamDb
    .from("tt_tasks")
    .update(patch)
    .eq("id", task.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  return NextResponse.json({ task: data });
}

export async function DELETE(
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
  const task = await loadTaskInOrg(Number(id), user.organization_id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Soft-delete the task and orphan its subtasks so the breadcrumb doesn't
  // dangle. FK on_delete=set_null only fires on hard delete, so do it manually.
  const { error: orphanErr } = await teamDb
    .from("tt_tasks")
    .update({ parent_id: null })
    .eq("parent_id", task.id);
  if (orphanErr)
    return NextResponse.json({ error: describeDbError(orphanErr) }, { status: 500 });

  const { error } = await teamDb
    .from("tt_tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", task.id);
  if (error) return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
