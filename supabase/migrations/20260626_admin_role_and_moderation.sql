-- 20260626_admin_role_and_moderation.sql
-- Owner/admin role + moderation RLS for puzzles & solutions.
--
-- Context: RLS was DISABLED on `puzzles` and `solutions`, so there was no
-- database-level protection at all (anyone with the public key could insert,
-- update, or delete any row). This migration enables RLS with a complete policy
-- set that preserves existing behaviour (public read; anyone, incl. anonymous,
-- can create and update so creators can set thumbnails/metadata) while LOCKING
-- DOWN DELETE to admins (puzzles) / owner-or-admin (solutions).
--
-- Idempotent: safe to re-run (drops policies before re-creating).

-- ============================================================================
-- 1) Admin flag on users
-- ============================================================================
alter table public.users
  add column if not exists is_admin boolean not null default false;

-- 2) Seed the owner as admin (set to your account email)
update public.users set is_admin = true
where email = 'antonbakker30@gmail.com';

-- 3) Helper: is the current auth user an admin?
--    SECURITY DEFINER so RLS on `users` doesn't block the lookup.
--    NOTE: returns false in the SQL editor (no auth.uid() there); it resolves
--    correctly when called from the app under a signed-in user's JWT.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select u.is_admin from public.users u where u.id = auth.uid()), false);
$$;

-- ============================================================================
-- 4) Enable RLS
-- ============================================================================
alter table public.puzzles  enable row level security;
alter table public.solutions enable row level security;

-- ============================================================================
-- 5) Policies (drop-then-create for idempotency)
-- ============================================================================

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

-- UPDATE: left open for now so creators can set thumbnails/metadata.
-- TODO(security): tighten once puzzles have a per-user owner column
--   (`created_by uuid`) + a backfill, then mirror the solutions DELETE rule.
drop policy if exists "Anyone can update puzzles" on public.puzzles;
create policy "Anyone can update puzzles" on public.puzzles
  for update using (true) with check (true);

drop policy if exists "Anyone can update solutions" on public.solutions;
create policy "Anyone can update solutions" on public.solutions
  for update using (true) with check (true);

-- DELETE: locked down (the security fix)
drop policy if exists "Admins can delete puzzles" on public.puzzles;
create policy "Admins can delete puzzles" on public.puzzles
  for delete using (public.is_admin());

drop policy if exists "Owner or admin can delete solutions" on public.solutions;
create policy "Owner or admin can delete solutions" on public.solutions
  for delete using (created_by = auth.uid() or public.is_admin());

-- ============================================================================
-- 6) Verify
-- ============================================================================
-- select tablename, policyname, cmd from pg_policies
--   where tablename in ('puzzles','solutions') order by tablename, cmd;
-- select email, is_admin from public.users where is_admin;
