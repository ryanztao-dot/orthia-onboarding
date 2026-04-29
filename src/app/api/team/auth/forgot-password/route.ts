import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { teamDb } from "@/lib/team/supabase";
import { sendEmail } from "@/lib/team/email";

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Always return the same response whether or not the user exists, so the
  // endpoint can't be used to enumerate accounts.
  const generic = NextResponse.json({ ok: true });

  const { data: user } = await teamDb
    .from("tt_users")
    .select("id, email, name")
    .ilike("email", email)
    .maybeSingle();
  const u = user as { id: number; email: string; name: string } | null;

  if (!u) return generic;

  // Invalidate any earlier unused tokens for this user before issuing a new
  // one. Stops a stolen earlier link from being replayed after the user
  // requests a fresh reset.
  await teamDb
    .from("tt_password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", u.id)
    .is("used_at", null);

  // Mint and store hashed token.
  const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { error } = await teamDb.from("tt_password_resets").insert({
    user_id: u.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) {
    // Don't leak DB errors back to a non-authenticated endpoint.
    console.error("forgot-password insert failed:", error);
    return generic;
  }

  // Build the reset link from the request origin so it works in dev + prod.
  const origin = new URL(req.url).origin;
  const link = `${origin}/team/reset-password?token=${token}`;

  const subject = "Reset your Orthia team password";
  const text = `Hi ${u.name || ""},

We received a request to reset your password. Click the link below to choose a new one. The link expires in 1 hour.

${link}

If you didn't request this, you can ignore this email.`;
  const safeName = escHtml(u.name || "");
  const safeLink = escHtml(link);
  const html = `<p>Hi ${safeName},</p>
<p>We received a request to reset your password. Click the link below to choose a new one. The link expires in 1 hour.</p>
<p><a href="${safeLink}">${safeLink}</a></p>
<p>If you didn't request this, you can ignore this email.</p>`;

  const result = await sendEmail({ to: u.email, subject, text, html });
  if (!result.ok) {
    console.error("forgot-password email failed:", result.error);
    // Still return generic so we don't leak info; the user can request again.
  }
  return generic;
}
