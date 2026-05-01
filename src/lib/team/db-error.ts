/**
 * Map a raw Supabase / PostgREST error into a human-actionable message.
 * The most common post-migration failure mode is a stale schema cache —
 * the table exists in Postgres but PostgREST hasn't reloaded yet. Surface
 * the fix (run the migration, or run `notify pgrst, 'reload schema'`)
 * instead of the bare error.
 */
// Map a missing-table error to the migration that adds it. Anything not
// listed here falls back to the catch-all message that points at the
// migrations directory.
const TABLE_TO_MIGRATION: Record<string, string> = {
  tt_organizations: "tasks-schema.sql",
  tt_users: "tasks-schema.sql",
  tt_projects: "tasks-schema.sql",
  tt_tasks: "tasks-schema.sql",
  tt_comments: "tasks-schema.sql",
  tt_activities: "tasks-schema.sql",
  tt_mentions: "tasks-schema.sql",
  tt_sprints: "tasks-schema-migration-1.sql",
  tt_attachments: "tasks-schema-migration-2.sql",
  tt_password_resets: "tasks-schema-migration-3.sql",
  tt_time_entries: "tasks-schema-migration-4.sql",
  tt_booth_leads: "tasks-schema-migration-7.sql",
};

function migrationFor(msg: string): string {
  // Pull out a `tt_*` table name from the error if we can.
  const m = msg.match(/(tt_[a-z_]+)/);
  const table = m?.[1];
  if (table && TABLE_TO_MIGRATION[table]) return TABLE_TO_MIGRATION[table];
  return "the matching tasks-schema-migration-N.sql file";
}

export function describeDbError(err: { message?: string; code?: string } | null | undefined): string {
  if (!err) return "Unknown database error";
  const msg = err.message || "Database error";
  if (err.code === "42P01" || /relation .* does not exist/i.test(msg)) {
    return `${msg} — run ${migrationFor(msg)} in Supabase, then retry.`;
  }
  if (/schema cache/i.test(msg)) {
    return `${msg} — migration hasn't been applied (or PostgREST hasn't reloaded). Run ${migrationFor(msg)} in Supabase SQL editor, then retry.`;
  }
  return msg;
}
