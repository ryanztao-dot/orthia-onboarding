import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { teamDb } from "@/lib/team/supabase";
import { requireUser } from "@/lib/team/user-auth";
import { describeDbError } from "@/lib/team/db-error";
import type { User } from "@/lib/team/types";

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Admin-only: mint a one-time password reset link for any user in the org
// and return it so the admin can hand it off (Slack, email, etc.).
// Mirrors the flow that POST /api/team/auth/forgot-password initiates,
// without sending an email — the admin chooses how to deliver the link.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req, { roles: ["admin"] });
  if (auth instanceof NextResponse) return auth;
  const { user: admin } = auth;
  const { id } = await params;

  const { data: target } = await teamDb
    .from("tt_users")
    .select("id, organization_id, email, name")
    .eq("id", Number(id))
    .maybeSingle();
  const t = target as Pick<User, "id" | "organization_id" | "email" | "name"> | null;
  if (!t || t.organization_id !== admin.organization_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Invalidate any earlier unused tokens for this user.
  await teamDb
    .from("tt_password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", t.id)
    .is("used_at", null);

  const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { error } = await teamDb.from("tt_password_resets").insert({
    user_id: t.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) return NextResponse.json({ error: describeDbError(error) }, { status: 500 });

  const origin = new URL(req.url).origin;
  const url = `${origin}/team/reset-password?token=${token}`;
  return NextResponse.json({ url, expires_at: expiresAt, user: { email: t.email, name: t.name } });
}
