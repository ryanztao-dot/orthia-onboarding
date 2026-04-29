-- Migration 5: track when each user's password was last changed.
-- Used to invalidate sessions issued before the change.
-- Run after migrations 1–4.

alter table public.tt_users
  add column if not exists password_changed_at timestamptz;
