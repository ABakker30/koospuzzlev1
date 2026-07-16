-- 20260716_lock_writes_to_owners.sql
-- Release hardening: UPDATE on puzzles/solutions is now owner-or-admin only.
--
-- Closes the launch blocker where anyone holding the public anon key could
-- rewrite any row (deface puzzles, falsify solution results — which would also
-- poison ghost-race replays). INSERT stays open (anonymous play/creation is a
-- product decision); SELECT stays public; DELETE was already locked down.
--
-- Consequences, reviewed and accepted:
--   * Legacy rows with created_by = NULL become admin-editable only.
--   * An anonymous creator can still create (thumbnail is written in the same
--     INSERT) but can no longer re-save edits to their own anonymous puzzle —
--     they must sign in to own and edit their work.
--
-- SELF-CONTAINED + IDEMPOTENT: also (re)applies the prerequisite admin flag,
-- is_admin() helper, RLS enablement, and the read/insert/delete policies from
-- 20260626_admin_role_and_moderation.sql, so running this one file in the
-- Supabase SQL editor converges prod to the correct end state regardless of
-- which earlier migrations were applied. Safe to re-run.

-- ============================================================================
-- 0) Prerequisites (from 20260626, idempotent)
-- ============================================================================
alter table public.users
  add column if not exists is_admin boolean not null default false;

update public.users set is_admin = true
where email = 'antonbakker30@gmail.com';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select u.is_admin from public.users u where u.id = auth.uid()), false);
$$;

alter table public.puzzles
  add column if not exists created_by uuid references auth.users(id) on delete set null;
create index if not exists idx_puzzles_created_by on public.puzzles(created_by);

alter table public.puzzles   enable row level security;
alter table public.solutions enable row level security;

-- READ: public
drop policy if exists "Allow anonymous read puzzles" on public.puzzles;
create policy "Allow anonymous read puzzles" on public.puzzles
  for select using (true);

drop policy if exists "Public read solutions" on public.solutions;
create policy "Public read solutions" on public.solutions
  for select using (true);

-- CREATE: anyone, incl. anonymous (matches current app behaviour)
drop policy if exists "Anyone can create puzzles" on public.puzzles;
create policy "Anyone can create puzzles" on public.puzzles
  for insert with check (true);

drop policy if exists "Anyone can create solutions" on public.solutions;
create policy "Anyone can create solutions" on public.solutions
  for insert with check (true);

-- DELETE: admin (puzzles) / owner-or-admin (solutions)
drop policy if exists "Admins can delete puzzles" on public.puzzles;
create policy "Admins can delete puzzles" on public.puzzles
  for delete using (public.is_admin());

drop policy if exists "Owner or admin can delete solutions" on public.solutions;
create policy "Owner or admin can delete solutions" on public.solutions
  for delete using (created_by = auth.uid() or public.is_admin());

-- ============================================================================
-- 1) THE CHANGE — UPDATE: owner or admin only (was: anyone)
-- ============================================================================
drop policy if exists "Anyone can update puzzles" on public.puzzles;
drop policy if exists "Owner or admin can update puzzles" on public.puzzles;
create policy "Owner or admin can update puzzles" on public.puzzles
  for update
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "Anyone can update solutions" on public.solutions;
drop policy if exists "Owner or admin can update solutions" on public.solutions;
create policy "Owner or admin can update solutions" on public.solutions
  for update
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

-- ============================================================================
-- 2) Verify (run after; expect UPDATE rows to show the owner-or-admin policy)
-- ============================================================================
-- select tablename, policyname, cmd from pg_policies
--   where tablename in ('puzzles','solutions') order by tablename, cmd;
