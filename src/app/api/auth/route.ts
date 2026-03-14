import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { signAdminCookie } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";

function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const { allowed } = rateLimit(ip, { maxRequests: 5, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please wait a minute." },
      { status: 429 }
    );
  }

  const { password } = await req.json();

  if (safeCompare(password, process.env.ADMIN_PASSWORD || "")) {
    const response = NextResponse.json({ success: true });
    response.cookies.set("admin_auth", signAdminCookie(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });
    return response;
  }

  return NextResponse.json({ error: "Invalid password" }, { status: 401 });
}
