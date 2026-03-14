import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "admin_auth";
const MAX_AGE_SECONDS = 86400; // 24 hours

function getSecret(): string {
  return process.env.ADMIN_PASSWORD || "fallback-secret";
}

/** Create a signed cookie value: `timestamp:hmac` */
export function signAdminCookie(): string {
  const timestamp = Date.now().toString();
  const hmac = crypto
    .createHmac("sha256", getSecret())
    .update(timestamp)
    .digest("hex");
  return `${timestamp}:${hmac}`;
}

/** Verify a signed admin cookie value. Returns true if valid and not expired. */
export function verifyAdminCookie(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;

  const parts = cookieValue.split(":");
  if (parts.length !== 2) return false;

  const [timestamp, providedHmac] = parts;
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;

  // Check expiry
  const ageMs = Date.now() - ts;
  if (ageMs > MAX_AGE_SECONDS * 1000 || ageMs < 0) return false;

  // Recompute HMAC and compare
  const expectedHmac = crypto
    .createHmac("sha256", getSecret())
    .update(timestamp)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(providedHmac, "hex"),
      Buffer.from(expectedHmac, "hex")
    );
  } catch {
    return false;
  }
}

/** Check admin auth from request. Returns 401 response if not authenticated, null if OK. */
export function requireAdmin(req: NextRequest): NextResponse | null {
  const cookieValue = req.cookies.get(COOKIE_NAME)?.value;

  // Support legacy "true" cookies during transition
  if (cookieValue === "true") {
    // Legacy cookie — still allow but it will expire naturally
    return null;
  }

  if (!verifyAdminCookie(cookieValue)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
