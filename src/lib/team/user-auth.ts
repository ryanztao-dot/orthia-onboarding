import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { teamDb } from "./supabase";
import type { PublicUser, Role, User } from "./types";

export const SESSION_COOKIE = "team_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  return process.env.TEAM_SESSION_SECRET || process.env.ADMIN_PASSWORD || "team-session-fallback";
}

// Password hashing with scrypt (no external dep).
// Format: scrypt$<N>$<saltHex>$<hashHex>
const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  });
  return `scrypt$${SCRYPT_N}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, nStr, saltHex, hashHex] = stored.split("$");
    if (algo !== "scrypt") return false;
    const N = parseInt(nStr, 10);
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const computed = crypto.scryptSync(password, salt, expected.length, {
      N,
      r: SCRYPT_r,
      p: SCRYPT_p,
    });
    return crypto.timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

// Session cookie format: userId:timestamp:hmac
export function signSession(userId: number): string {
  const ts = Date.now().toString();
  const payload = `${userId}:${ts}`;
  const hmac = crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${payload}:${hmac}`;
}

export function verifySession(value: string | undefined): number | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length !== 3) return null;
  const [userIdStr, ts, providedHmac] = parts;
  const userId = parseInt(userIdStr, 10);
  const tsNum = parseInt(ts, 10);
  if (isNaN(userId) || isNaN(tsNum)) return null;
  const age = Date.now() - tsNum;
  if (age < 0 || age > MAX_AGE_SECONDS * 1000) return null;
  const payload = `${userIdStr}:${ts}`;
  const expected = crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
  try {
    if (
      !crypto.timingSafeEqual(Buffer.from(providedHmac, "hex"), Buffer.from(expected, "hex"))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return userId;
}

export function setSessionCookie(res: NextResponse, userId: number) {
  res.cookies.set(SESSION_COOKIE, signSession(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

export function toPublicUser(u: User): PublicUser {
  const { password_hash: _pw, ...rest } = u;
  void _pw;
  return rest;
}

export interface AuthContext {
  user: PublicUser;
}

// Pull just the timestamp piece out of `userId:ts:hmac` so we can compare
// against the user's last password-change time and reject stale sessions.
function sessionIssuedAt(value: string | undefined): number | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length !== 3) return null;
  const ts = parseInt(parts[1], 10);
  return Number.isFinite(ts) ? ts : null;
}

export async function getCurrentUser(req: NextRequest): Promise<PublicUser | null> {
  const value = req.cookies.get(SESSION_COOKIE)?.value;
  const userId = verifySession(value);
  if (!userId) return null;

  const { data, error } = await teamDb
    .from("tt_users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const u = data as User;

  // If the user's password was changed AFTER this session was issued, the
  // session is stale and must be rejected. Old sessions (from before this
  // column existed) get a null and are accepted, which is the desired
  // backward-compatible behavior.
  const sessionTs = sessionIssuedAt(value);
  if (u.password_changed_at && sessionTs !== null) {
    const changedAt = new Date(u.password_changed_at).getTime();
    if (Number.isFinite(changedAt) && sessionTs < changedAt) {
      return null;
    }
  }
  return toPublicUser(u);
}

export async function requireUser(
  req: NextRequest,
  opts?: { roles?: Role[] },
): Promise<{ user: PublicUser } | NextResponse> {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (opts?.roles && !opts.roles.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { user };
}

export function canMutateTasks(role: Role): boolean {
  return role === "admin" || role === "developer";
}
