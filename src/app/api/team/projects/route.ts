import { NextRequest, NextResponse } from "next/server";
import { teamDb } from "@/lib/team/supabase";
import { requireUser } from "@/lib/team/user-auth";
import { describeDbError } from "@/lib/team/db-error";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const { data, error } = await teamDb
    .from("tt_projects")
    .select("*")
    .eq("organization_id", user.organization_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  return NextResponse.json({ projects: data });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req, { roles: ["admin"] });
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const body = await req.json();
  const key = String(body.key || "").toUpperCase().trim();
  const name = String(body.name || "").trim().slice(0, 200);
  if (!/^[A-Z0-9]{2,8}$/.test(key)) {
    return NextResponse.json(
      { error: "Key must be 2–8 uppercase letters/digits" },
      { status: 400 },
    );
  }
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const description = body.description ? String(body.description).slice(0, 50_000) : null;

  const { data, error } = await teamDb
    .from("tt_projects")
    .insert({
      organization_id: user.organization_id,
      key,
      name,
      description,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A project with that key already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  }
  return NextResponse.json({ project: data });
}
