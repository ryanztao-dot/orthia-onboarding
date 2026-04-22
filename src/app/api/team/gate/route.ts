import { NextRequest, NextResponse } from "next/server";
import { safeCompare, setGateCookieOn, TEAM_GATE_PASSWORD } from "@/lib/team/gate-auth";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const { allowed } = rateLimit(`team-gate:${ip}`, { maxRequests: 10, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute." },
      { status: 429 },
    );
  }

  const { password } = await req.json();
  const submitted = String(password ?? "").trim().toLowerCase();
  const expected = TEAM_GATE_PASSWORD.toLowerCase();
  if (!safeCompare(submitted, expected)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });
  await setGateCookieOn(res);
  return res;
}
