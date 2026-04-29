-- Migration 3: password resets.
-- Run after migrations 1 and 2.

create table if not exists public.tt_password_resets (
  id           bigserial primary key,
  user_id      bigint not null references public.tt_users(id) on delete cascade,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz default now() not null
);
create index if not exists tt_password_resets_user_idx
  on public.tt_password_resets(user_id, created_at desc);

alter table public.tt_password_resets enable row level security;
do $$ begin
  create policy "tt all" on public.tt_password_resets for all using (true) with check (true);
exception when duplicate_object then null; end $$;
