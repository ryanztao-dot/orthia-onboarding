import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { teamDb } from "@/lib/team/supabase";
import { hashPassword } from "@/lib/team/user-auth";
import { describeDbError } from "@/lib/team/db-error";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(req: NextRequest) {
  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const token = String(body.token || "").trim();
  const password = String(body.password || "");
  if (!token || !password) {
    return NextResponse.json(
      { error: "Token and new password are required" },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  const tokenHash = hashToken(token);
  const { data: row } = await teamDb
    .from("tt_password_resets")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  const r = row as
    | { id: number; user_id: number; expires_at: string; used_at: string | null }
    | null;
  if (!r) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
  }
  if (r.used_at) {
    return NextResponse.json({ error: "This link has already been used" }, { status: 400 });
  }
  if (new Date(r.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 400 });
  }

  // Update the password hash and bump password_changed_at. Setting that
  // column invalidates all sessions issued before "now" — the user is
  // logged out everywhere by virtue of getCurrentUser refusing stale ones.
  const now = new Date().toISOString();
  const newHash = hashPassword(password);
  const { error: pwErr } = await teamDb
    .from("tt_users")
    .update({ password_hash: newHash, password_changed_at: now, updated_at: now })
    .eq("id", r.user_id);
  if (pwErr) {
    return NextResponse.json({ error: describeDbError(pwErr) }, { status: 500 });
  }

  // Mark this token used AND nullify any other unused tokens for the user,
  // so a stolen earlier link can't be replayed.
  const { error: usedErr } = await teamDb
    .from("tt_password_resets")
    .update({ used_at: now })
    .eq("user_id", r.user_id)
    .is("used_at", null);
  if (usedErr) {
    console.error("reset-password mark-used failed:", usedErr);
    // Password is updated; not fatal.
  }

  return NextResponse.json({ ok: true });
}
