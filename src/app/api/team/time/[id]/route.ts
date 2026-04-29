import { NextRequest, NextResponse } from "next/server";
import { teamDb } from "@/lib/team/supabase";
import { requireUser } from "@/lib/team/user-auth";
import { describeDbError } from "@/lib/team/db-error";
import type { TimeEntry } from "@/lib/team/types";

const MAX_MINUTES = 24 * 60;

async function loadEntryInOrg(entryId: number, orgId: number) {
  const { data } = await teamDb
    .from("tt_time_entries")
    .select("*, tt_users!inner(organization_id)")
    .eq("id", entryId)
    .maybeSingle();
  if (!data) return null;
  const e = data as TimeEntry & { tt_users: { organization_id: number } };
  if (e.tt_users.organization_id !== orgId) return null;
  return e;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;
  const entry = await loadEntryInOrg(Number(id), user.organization_id);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (entry.user_id !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.minutes != null) {
    const m = Number(body.minutes);
    if (!Number.isFinite(m) || m <= 0 || m > MAX_MINUTES) {
      return NextResponse.json(
        { error: "Minutes must be between 1 and 1440" },
        { status: 400 },
      );
    }
    patch.minutes = Math.floor(m);
  }
  if (typeof body.entry_date === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.entry_date)) {
      return NextResponse.json({ error: "entry_date must be YYYY-MM-DD" }, { status: 400 });
    }
    patch.entry_date = body.entry_date;
  }
  if ("notes" in body) {
    patch.notes = body.notes ? String(body.notes).slice(0, 2000) : null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ entry });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await teamDb
    .from("tt_time_entries")
    .update(patch)
    .eq("id", entry.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;
  const entry = await loadEntryInOrg(Number(id), user.organization_id);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (entry.user_id !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { error } = await teamDb.from("tt_time_entries").delete().eq("id", entry.id);
  if (error) return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
