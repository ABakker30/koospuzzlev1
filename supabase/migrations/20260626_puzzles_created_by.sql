-- 20260626_puzzles_created_by.sql
-- Add per-user ownership to puzzles (mirrors solutions.created_by).
-- Enables a "manage my own puzzles" UI and a future owner-or-admin UPDATE
-- lockdown. Safe/additive: nothing is restricted by this migration alone.

alter table public.puzzles
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists idx_puzzles_created_by on public.puzzles(created_by);

comment on column public.puzzles.created_by is
  'User (uid) who created this puzzle. NULL for legacy/anonymous puzzles.';

-- Existing rows keep created_by = NULL. Ownership of legacy puzzles is ambiguous
-- (only the display string `creator_name` was stored), so they stay admin-managed.
--
-- OPTIONAL best-effort backfill — REVIEW BEFORE RUNNING. Assigns ownership only
-- where a puzzle's creator_name UNIQUELY matches a username (avoids handing the
-- wrong user control). Inspect the matches first; skip entirely if names aren't
-- trustworthy:
--
--   -- preview what would be assigned:
--   -- select p.id, p.name, p.creator_name, u.id as would_own
--   -- from public.puzzles p
--   -- join public.users u on u.username = p.creator_name
--   -- where p.created_by is null
--   --   and (select count(*) from public.users u2 where u2.username = p.creator_name) = 1;
--
--   -- apply:
--   -- update public.puzzles p
--   -- set created_by = u.id
--   -- from public.users u
--   -- where p.created_by is null
--   --   and p.creator_name = u.username
--   --   and (select count(*) from public.users u2 where u2.username = p.creator_name) = 1;
