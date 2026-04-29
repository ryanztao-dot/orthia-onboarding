-- Migration 4: time tracking.
-- Run after migrations 1, 2, 3.

create table if not exists public.tt_time_entries (
  id            bigserial primary key,
  user_id       bigint not null references public.tt_users(id) on delete cascade,
  task_id       bigint references public.tt_tasks(id) on delete set null,
  project_id    bigint references public.tt_projects(id) on delete set null,
  entry_date    date not null,
  minutes       int not null check (minutes > 0 and minutes <= 24 * 60),
  notes         text,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);
create index if not exists tt_time_entries_user_date_idx
  on public.tt_time_entries(user_id, entry_date desc);
create index if not exists tt_time_entries_task_idx
  on public.tt_time_entries(task_id);
create index if not exists tt_time_entries_project_idx
  on public.tt_time_entries(project_id);

alter table public.tt_time_entries enable row level security;
do $$ begin
  create policy "tt all" on public.tt_time_entries for all using (true) with check (true);
exception when duplicate_object then null; end $$;
