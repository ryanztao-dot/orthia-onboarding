import { NextRequest, NextResponse } from "next/server";
import { verifyGateCookie, TEAM_GATE_COOKIE } from "@/lib/team/gate-auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only guard /team/* (not /team itself — that's the password page)
  // and /api/team/* (except the gate endpoint itself).
  // Password-reset flows are also exempt: a user clicking the email link
  // on a new device shouldn't be bounced through the org gate first.
  const isGatePage = pathname === "/team";
  const isGateApi = pathname === "/api/team/gate";
  const isPasswordResetPage =
    pathname === "/team/forgot-password" || pathname === "/team/reset-password";
  const isPasswordResetApi =
    pathname === "/api/team/auth/forgot-password" ||
    pathname === "/api/team/auth/reset-password";
  if (isGatePage || isGateApi || isPasswordResetPage || isPasswordResetApi) {
    return NextResponse.next();
  }

  const underTeamUI = pathname.startsWith("/team/");
  const underTeamApi = pathname.startsWith("/api/team/");
  if (!underTeamUI && !underTeamApi) return NextResponse.next();

  const cookie = req.cookies.get(TEAM_GATE_COOKIE)?.value;
  if (await verifyGateCookie(cookie)) return NextResponse.next();

  if (underTeamApi) {
    return NextResponse.json({ error: "Gate locked" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/team";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/team/:path*", "/api/team/:path*"],
};
