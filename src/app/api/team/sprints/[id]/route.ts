import { NextRequest, NextResponse } from "next/server";
import { teamDb } from "@/lib/team/supabase";
import { requireUser } from "@/lib/team/user-auth";
import { describeDbError } from "@/lib/team/db-error";
import type { Sprint } from "@/lib/team/types";

async function loadSprintInOrg(sprintId: number, orgId: number) {
  const { data } = await teamDb
    .from("tt_sprints")
    .select("*, tt_projects!inner(organization_id, id)")
    .eq("id", sprintId)
    .maybeSingle();
  if (!data) return null;
  const s = data as Sprint & { tt_projects: { organization_id: number; id: number } };
  if (s.tt_projects.organization_id !== orgId) return null;
  return s;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;
  const sprint = await loadSprintInOrg(Number(id), user.organization_id);
  if (!sprint) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ sprint });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req, { roles: ["admin", "developer"] });
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;
  const sprint = await loadSprintInOrg(Number(id), user.organization_id);
  if (!sprint) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim().slice(0, 200);
  }
  if ("goal" in body) {
    patch.goal = body.goal ? String(body.goal).slice(0, 5_000) : null;
  }
  if ("start_date" in body) patch.start_date = body.start_date || null;
  if ("end_date" in body) patch.end_date = body.end_date || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ sprint });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await teamDb
    .from("tt_sprints")
    .update(patch)
    .eq("id", sprint.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  return NextResponse.json({ sprint: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req, { roles: ["admin", "developer"] });
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;
  const sprint = await loadSprintInOrg(Number(id), user.organization_id);
  if (!sprint) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sprint.state === "active") {
    return NextResponse.json(
      { error: "Complete the sprint before deleting" },
      { status: 400 },
    );
  }
  // Move the sprint's tasks back to the backlog (sprint_id = null)
  await teamDb.from("tt_tasks").update({ sprint_id: null }).eq("sprint_id", sprint.id);
  const { error } = await teamDb.from("tt_sprints").delete().eq("id", sprint.id);
  if (error) return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
