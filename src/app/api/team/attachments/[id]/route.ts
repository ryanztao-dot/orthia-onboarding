import { NextRequest, NextResponse } from "next/server";
import { teamDb } from "@/lib/team/supabase";
import { requireUser } from "@/lib/team/user-auth";
import { describeDbError } from "@/lib/team/db-error";
import { logActivity } from "@/lib/team/activity";
import { deleteAttachment } from "@/lib/team/storage";
import type { Attachment } from "@/lib/team/types";

async function loadAttachmentInOrg(attId: number, orgId: number) {
  const { data } = await teamDb
    .from("tt_attachments")
    .select("*, tt_tasks!inner(id, project_id, deleted_at, tt_projects!inner(organization_id))")
    .eq("id", attId)
    .maybeSingle();
  if (!data) return null;
  const a = data as Attachment & {
    tt_tasks: {
      id: number;
      project_id: number;
      deleted_at: string | null;
      tt_projects: { organization_id: number };
    };
  };
  if (a.tt_tasks.deleted_at) return null;
  if (a.tt_tasks.tt_projects.organization_id !== orgId) return null;
  return a;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;
  const att = await loadAttachmentInOrg(Number(id), user.organization_id);
  if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = att.uploader_id === user.id;
  const isAdmin = user.role === "admin";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await teamDb.from("tt_attachments").delete().eq("id", att.id);
  if (error) return NextResponse.json({ error: describeDbError(error) }, { status: 500 });

  // Best-effort: remove the storage object. If this fails the row is already
  // gone, so the file is just orphaned — log but don't fail the request.
  const del = await deleteAttachment(att.storage_path);
  if (del.error) console.error("Storage delete failed:", del.error, att.storage_path);

  await logActivity(att.task_id, user.id, "attachment_removed", { filename: att.filename });
  return new NextResponse(null, { status: 204 });
}
