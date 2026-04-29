import { NextRequest, NextResponse } from "next/server";
import { teamDb } from "@/lib/team/supabase";
import { requireUser } from "@/lib/team/user-auth";
import { describeDbError } from "@/lib/team/db-error";
import type { Project } from "@/lib/team/types";

async function getProjectInOrg(id: number, organizationId: number): Promise<Project | null> {
  const { data } = await teamDb
    .from("tt_projects")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
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

  const project = await getProjectInOrg(Number(id), user.organization_id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req, { roles: ["admin"] });
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;

  const project = await getProjectInOrg(Number(id), user.organization_id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const patch: Partial<Project> = {};
  if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 200);
  if (typeof body.description === "string") patch.description = body.description.slice(0, 50_000);
  if (typeof body.archived === "boolean") {
    patch.archived_at = body.archived ? new Date().toISOString() : null;
  }

  const { data, error } = await teamDb
    .from("tt_projects")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", project.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  return NextResponse.json({ project: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req, { roles: ["admin"] });
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;

  const project = await getProjectInOrg(Number(id), user.organization_id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await teamDb
    .from("tt_projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", project.id);
  if (error) return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
