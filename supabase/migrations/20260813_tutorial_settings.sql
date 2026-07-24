-- Tutorial (Show me how) settings — the three-step "learn in 60 seconds"
-- ladder, made admin-editable so Anton can repoint each step's PUZZLE and
-- PIECE RULES from /admin without a deploy. One row per step (1, 2, 3).
--
-- Fallback contract: the app FALLS BACK to the hardcoded ladder in
-- src/constants/tutorial.ts whenever this table is absent or empty.
-- tutorialService merges DB rows over the constants by step number — the DB
-- supplies puzzle_id / piece_mode / single_piece_id, while the i18n copy
-- (title / instruction / praise keys) always comes from the constant. So a
-- fresh install works before this migration runs, and a partial/empty table
-- never breaks the tutorial.
--
-- puzzle_id is deliberately a PLAIN uuid (no FK to public.puzzles): step 1's
-- original puzzle (df66f90d-…) was deleted, so a FK would either reject the
-- seed below or null it out. The dangling reference is surfaced in /admin as a
-- "puzzle missing — pick a replacement" warning instead.

create table if not exists public.tutorial_steps (
  step int primary key,
  puzzle_id uuid,
  piece_mode text check (piece_mode in ('unique', 'duplicates', 'single')),
  single_piece_id text,
  updated_at timestamptz not null default now()
);

-- Seed steps 1..3 with TODAY's hardcoded values (constants/tutorial.ts) so
-- existing installs start from the current config; the admin then repoints
-- step 1's deleted puzzle. `do nothing` on conflict never clobbers later edits.
insert into public.tutorial_steps (step, puzzle_id, piece_mode, single_piece_id) values
  (1, 'df66f90d-cd92-458e-ac93-801a6fdd7aa7', 'single', 'Y'),
  (2, 'd8562c3e-1c97-4d96-92e8-59ff65b2db76', 'duplicates', null),
  (3, 'cafa6ecb-a7ad-4027-9371-6b4de0065a6d', 'unique', null)
on conflict (step) do nothing;

alter table public.tutorial_steps enable row level security;

-- Everyone can read (anonymous visitors take the tutorial); only admins write.
-- Admin predicate copied verbatim from 20260720_contest_settings.sql
-- (public.is_admin(), defined in 20260626_admin_role_and_moderation.sql).
create policy "Anyone can read tutorial steps"
  on public.tutorial_steps for select using (true);

create policy "Admins insert tutorial steps"
  on public.tutorial_steps for insert
  with check (public.is_admin());

create policy "Admins update tutorial steps"
  on public.tutorial_steps for update
  using (public.is_admin())
  with check (public.is_admin());
