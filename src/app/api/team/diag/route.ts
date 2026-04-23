import { NextResponse } from "next/server";
import { teamDb } from "@/lib/team/supabase";

/**
 * Diagnostic endpoint. Verifies env + that every table and key column the
 * team app relies on is present. Intended for post-migration smoke checks.
 */
const TABLES = [
  "tt_organizations",
  "tt_users",
  "tt_projects",
  "tt_tasks",
  "tt_comments",
  "tt_activities",
  "tt_mentions",
  "tt_sprints",
] as const;

export async function GET() {
  const envOk =
    Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY);

  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL ? "set" : "missing",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? "set" : "missing",
    SUPABASE_URL_host: process.env.SUPABASE_URL
      ? new URL(process.env.SUPABASE_URL).host
      : null,
  };

  const tables: Record<string, { ok: boolean; count?: number; error?: string }> = {};
  for (const t of TABLES) {
    try {
      const { count, error } = await teamDb
        .from(t)
        .select("*", { count: "exact", head: true });
      if (error) tables[t] = { ok: false, error: error.message };
      else tables[t] = { ok: true, count: count ?? 0 };
    } catch (err) {
      tables[t] = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Probe a representative Jira column so we know migration-1 ran.
  let migrations: Record<string, { ok: boolean; error?: string }> = {};
  try {
    const { error } = await teamDb
      .from("tt_tasks")
      .select("id,sprint_id,parent_id,reporter_id,story_points,start_date,labels,type")
      .limit(1);
    migrations.jira_fields = error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    migrations.jira_fields = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const allTablesOk = Object.values(tables).every((v) => v.ok);
  const allMigsOk = Object.values(migrations).every((v) => v.ok);
  const overall = envOk && allTablesOk && allMigsOk;

  const nextStep = !envOk
    ? "Set SUPABASE_URL + SUPABASE_ANON_KEY in Vercel env."
    : !tables.tt_organizations.ok
      ? "Run tasks-schema.sql in Supabase SQL editor."
      : !tables.tt_sprints.ok
        ? "Run tasks-schema-migration-1.sql in Supabase SQL editor."
        : !allMigsOk
          ? "Run tasks-schema-migration-1.sql — task columns are missing."
          : "All green. Ready to use.";

  return NextResponse.json({ ok: overall, env, tables, migrations, next: nextStep });
}
