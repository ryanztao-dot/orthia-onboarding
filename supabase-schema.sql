-- Run this in Supabase SQL Editor to create the submissions table

create table public.submissions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  practice_name text not null,
  practice_type text,
  locations text,
  pms text,
  contact_name text,
  email text,
  phone text,
  slug text unique not null,
  status text default 'pending' not null check (status in ('pending', 'complete')),
  notes text,
  dba_name text,
  office_phone text,
  office_email text,
  website text,
  contact_role text,
  form_data jsonb default '{}'::jsonb
);

-- Enable Row Level Security
alter table public.submissions enable row level security;

-- Allow all operations via the anon key (since we handle auth at the API layer)
create policy "Allow all operations" on public.submissions
  for all
  using (true)
  with check (true);

-- Create index on slug for fast lookups
create index idx_submissions_slug on public.submissions (slug);

-- Create index on created_at for sorting
create index idx_submissions_created_at on public.submissions (created_at desc);


-- ============================================================
-- MIGRATION: Run this if you already have the table and need to add new columns
-- ============================================================
-- ALTER TABLE public.submissions
--   ADD COLUMN IF NOT EXISTS dba_name text,
--   ADD COLUMN IF NOT EXISTS office_phone text,
--   ADD COLUMN IF NOT EXISTS office_email text,
--   ADD COLUMN IF NOT EXISTS website text,
--   ADD COLUMN IF NOT EXISTS contact_role text,
--   ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}'::jsonb;
