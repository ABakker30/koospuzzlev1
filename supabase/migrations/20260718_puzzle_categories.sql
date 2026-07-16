-- 20260718_puzzle_categories.sql
-- Difficulty category on puzzles. NULL = derive client-side from geometry
-- (flatness + sphere-count bands, src/utils/puzzleCategory.ts); a stored
-- value is an explicit assignment (set at save, or reassigned by an admin in
-- the gallery). Owner-or-admin UPDATE policy already covers reassignment.
--
-- Idempotent: safe to re-run.

alter table public.puzzles
  add column if not exists category text
  check (category in ('2d','easy','medium','hard','impossible'));

comment on column public.puzzles.category is
  'Difficulty category. NULL = auto-derived from geometry in the client.';
