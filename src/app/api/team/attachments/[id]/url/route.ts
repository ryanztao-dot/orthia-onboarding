import { NextRequest, NextResponse } from "next/server";
import { teamDb } from "@/lib/team/supabase";
import { requireUser } from "@/lib/team/user-auth";
import { createSignedDownloadUrl } from "@/lib/team/storage";
import type { Attachment } from "@/lib/team/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;

  const { data } = await teamDb
    .from("tt_attachments")
    .select("*, tt_tasks!inner(deleted_at, tt_projects!inner(organization_id))")
    .eq("id", Number(id))
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const a = data as Attachment & {
    tt_tasks: { deleted_at: string | null; tt_projects: { organization_id: number } };
  };
  if (a.tt_tasks.deleted_at) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (a.tt_tasks.tt_projects.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const signed = await createSignedDownloadUrl(a.storage_path, a.filename, 60);
  if (signed.error || !signed.url) {
    return NextResponse.json({ error: signed.error || "Could not sign URL" }, { status: 500 });
  }
  return NextResponse.json({ url: signed.url });
}
