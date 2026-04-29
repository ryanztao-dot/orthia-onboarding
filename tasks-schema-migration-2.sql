-- Migration 2: task attachments (PDF uploads).
-- Run after tasks-schema.sql and tasks-schema-migration-1.sql.
--
-- Files themselves live in Supabase Storage in the `task-attachments` bucket.
-- This table tracks metadata + the storage path for each upload.

create table if not exists public.tt_attachments (
  id            bigserial primary key,
  task_id       bigint not null references public.tt_tasks(id) on delete cascade,
  uploader_id   bigint references public.tt_users(id) on delete set null,
  storage_path  text not null,
  filename      text not null,
  mime_type     text not null,
  size_bytes    bigint not null,
  created_at    timestamptz default now() not null
);
create index if not exists tt_attachments_task_idx
  on public.tt_attachments(task_id, created_at desc);

alter table public.tt_attachments enable row level security;
do $$ begin
  create policy "tt all" on public.tt_attachments for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Activity log: extend allowed actions to include attachment events.
-- (No CHECK constraint on action today, so this is documentation only.
--  Code will emit 'attachment_added' / 'attachment_removed'.)

-- Storage bucket setup (run once in Supabase dashboard, or via SQL below):
--
--   insert into storage.buckets (id, name, public)
--   values ('task-attachments', 'task-attachments', false)
--   on conflict (id) do nothing;
--
-- The bucket is PRIVATE. Server reads/writes via the service-role key
-- (see SUPABASE_SERVICE_ROLE_KEY in .env.local). Clients never touch
-- storage directly; downloads go through short-lived signed URLs
-- minted by the API.
