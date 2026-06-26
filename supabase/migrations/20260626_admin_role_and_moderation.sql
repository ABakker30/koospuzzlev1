-- 20260626_admin_role_and_moderation.sql
-- Owner/admin role + moderation RLS hardening for puzzles & solutions.
--
-- ⚠️  REVIEW BEFORE RUNNING. This changes who can UPDATE/DELETE gallery content.
--     It is written to be applied by hand against the live database because the
--     current policy set was created ad-hoc (dev-grade) and isn't fully captured
--     in this repo. Run section 0 first and adapt sections 3–4 to what you find.
--
-- 🔑  Key Postgres RLS fact: policies are PERMISSIVE and OR'd together. A leftover
--     `USING (true)` delete/update policy will keep letting EVERYONE delete, even
--     after you add the admin-only policies below. You MUST drop the permissive
--     ones (section 3a/4a) or this hardening does nothing.

-- ============================================================================
-- 0) INSPECT current policies first — run this and note the policy names.
-- ============================================================================
-- select schemaname, tablename, policyname, cmd, qual, with_check
-- from pg_policies
-- where tablename in ('puzzles', 'solutions')
-- order by tablename, cmd;

-- ============================================================================
-- 1) Admin flag on users
-- ============================================================================
alter table public.users
  add column if not exists is_admin boolean not null default false;

-- ============================================================================
-- 2) Make the owner an admin (set to YOUR account)
-- ============================================================================
update public.users set is_admin = true
where email = 'antonbakker30@gmail.com';

-- ============================================================================
-- 3) Helper: is the current auth user an admin?
--    SECURITY DEFINER so RLS on `users` doesn't block the lookup.
-- ============================================================================
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
-- 3a) PUZZLES — drop permissive update/delete, then add admin-only.
--     Puzzles have no per-user owner uid column (only `creator_name` text), so
--     owner self-management is a FOLLOW-UP (add `created_by uuid` + backfill).
--     For now: only admins can modify/delete puzzles. Public SELECT is unchanged.
-- ============================================================================
-- Drop whatever permissive update/delete policies exist (names from section 0).
-- Examples — REPLACE with the real names you found:
-- drop policy if exists "Anyone can update puzzles" on public.puzzles;
-- drop policy if exists "Anyone can delete puzzles" on public.puzzles;
-- drop policy if exists "All puzzles writable during dev" on public.puzzles;

create policy "Admins can update any puzzle" on public.puzzles
  for update using (public.is_admin()) with check (public.is_admin());

create policy "Admins can delete any puzzle" on public.puzzles
  for delete using (public.is_admin());

-- ============================================================================
-- 4) SOLUTIONS — owner (created_by) OR admin can update/delete.
--    Drop permissive update/delete policies first (names from section 0).
-- ============================================================================
-- drop policy if exists "Anyone can update solutions" on public.solutions;
-- drop policy if exists "Anyone can delete solutions" on public.solutions;

create policy "Owner or admin can update solution" on public.solutions
  for update using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

create policy "Owner or admin can delete solution" on public.solutions
  for delete using (created_by = auth.uid() or public.is_admin());

-- ============================================================================
-- 5) VERIFY
-- ============================================================================
-- select email, is_admin from public.users where is_admin;          -- you should be listed
-- select public.is_admin();                                          -- true when run as you
-- re-run the section 0 query and confirm no permissive delete/update remain.
