import { NextResponse } from "next/server";
import { teamDb } from "@/lib/team/supabase";

/**
 * Diagnostic endpoint for the team app. Sits behind the gate middleware,
 * so it's only reachable after entering the team password. Reports:
 *  - whether the SUPABASE_* env vars are present
 *  - whether the tt_* tables exist + are reachable
 * Intended for troubleshooting first-time setup, not for observability.
 */
export async function GET() {
  const out: Record<string, unknown> = {
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL ? "set" : "missing",
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? "set" : "missing",
      SUPABASE_URL_host: process.env.SUPABASE_URL
        ? new URL(process.env.SUPABASE_URL).host
        : null,
    },
  };

  try {
    const { error, count } = await teamDb
      .from("tt_organizations")
      .select("*", { count: "exact", head: true });
    if (error) {
      out.db = {
        ok: false,
        error: error.message,
        code: (error as { code?: string }).code ?? null,
        hint:
          (error as { code?: string }).code === "42P01" ||
          /relation .* does not exist/i.test(error.message)
            ? "tt_organizations is missing — run tasks-schema.sql in Supabase SQL editor."
            : null,
      };
    } else {
      out.db = { ok: true, organizations_count: count ?? 0 };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    out.db = {
      ok: false,
      threw: msg,
      hint: /fetch failed/i.test(msg)
        ? "Supabase URL is unreachable — check SUPABASE_URL in Vercel and that the project isn't paused."
        : null,
    };
  }

  return NextResponse.json(out);
}
