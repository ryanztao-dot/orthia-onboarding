import { NextRequest, NextResponse } from "next/server";
import { teamDb } from "@/lib/team/supabase";
import { canMutateTasks, requireUser } from "@/lib/team/user-auth";
import { describeDbError } from "@/lib/team/db-error";
import { logActivity } from "@/lib/team/activity";
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  buildStoragePath,
  deleteAttachment,
  uploadAttachment,
} from "@/lib/team/storage";
import type { Task } from "@/lib/team/types";

async function loadTaskInOrg(taskId: number, orgId: number) {
  const { data } = await teamDb
    .from("tt_tasks")
    .select("*, tt_projects!inner(organization_id)")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const t = data as Task & { tt_projects: { organization_id: number } };
  if (t.tt_projects.organization_id !== orgId) return null;
  return t;
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
  const taskId = Number(id);
  const task = await loadTaskInOrg(taskId, user.organization_id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Reject oversized requests before buffering the body. Browsers reliably
  // send Content-Length on multipart uploads, so this avoids parsing 1 GB
  // payloads only to throw them out.
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_UPLOAD_BYTES + 4096) {
    return NextResponse.json(
      { error: `File too large (max ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB)` },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return NextResponse.json(
      { error: "Only PDF files are allowed" },
      { status: 400 },
    );
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB)` },
      { status: 400 },
    );
  }

  const filename = file.name?.trim() || "attachment.pdf";
  const buffer = Buffer.from(await file.arrayBuffer());

  // The browser's reported MIME type is client-controlled. Confirm the file
  // really is a PDF by checking its magic bytes ("%PDF" / 0x25 0x50 0x44 0x46).
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x25 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x44 ||
    buffer[3] !== 0x46
  ) {
    return NextResponse.json(
      { error: "File is not a valid PDF" },
      { status: 400 },
    );
  }

  const path = buildStoragePath(user.organization_id, taskId, filename);

  const up = await uploadAttachment(path, buffer, file.type);
  if (up.error) {
    return NextResponse.json({ error: up.error }, { status: 500 });
  }

  const { data, error } = await teamDb
    .from("tt_attachments")
    .insert({
      task_id: taskId,
      uploader_id: user.id,
      storage_path: path,
      filename,
      mime_type: file.type,
      size_bytes: file.size,
    })
    .select()
    .single();
  if (error) {
    // Roll back the storage object so it doesn't orphan.
    await deleteAttachment(path);
    return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  }

  await logActivity(taskId, user.id, "attachment_added", { filename });
  return NextResponse.json({ attachment: data }, { status: 201 });
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

  const { data, error } = await teamDb
    .from("tt_attachments")
    .select("*")
    .eq("task_id", task.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: describeDbError(error) }, { status: 500 });
  return NextResponse.json({ attachments: data || [] });
}
