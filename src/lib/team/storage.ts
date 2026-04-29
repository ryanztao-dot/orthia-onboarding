import { createClient, SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const ATTACHMENTS_BUCKET = "task-attachments";
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
export const ALLOWED_MIME_TYPES = ["application/pdf"] as const;

let serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for storage operations.",
    );
  }
  serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

export function buildStoragePath(orgId: number, taskId: number, filename: string): string {
  const ext = filename.toLowerCase().endsWith(".pdf") ? ".pdf" : "";
  const random = crypto.randomBytes(12).toString("hex");
  return `${orgId}/${taskId}/${random}${ext}`;
}

export async function uploadAttachment(
  path: string,
  body: ArrayBuffer | Buffer,
  mimeType: string,
): Promise<{ error?: string }> {
  const { error } = await getServiceClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .upload(path, body, { contentType: mimeType, upsert: false });
  if (error) return { error: error.message };
  return {};
}

export async function createSignedDownloadUrl(
  path: string,
  filename: string,
  expiresIn = 60,
): Promise<{ url?: string; error?: string }> {
  const { data, error } = await getServiceClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .createSignedUrl(path, expiresIn, { download: filename });
  if (error || !data) return { error: error?.message || "Could not sign URL" };
  return { url: data.signedUrl };
}

export async function deleteAttachment(path: string): Promise<{ error?: string }> {
  const { error } = await getServiceClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .remove([path]);
  if (error) return { error: error.message };
  return {};
}
