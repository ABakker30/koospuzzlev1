-- 20260726_physical_support.sql
-- Physical-buildability metadata, computed once at puzzle creation.
--
-- puzzles.physical_support is a small jsonb report from the client-side
-- analyzer (src/utils/physicalSupport.ts):
--   { "version": 1, "verdict": "any_order" | "needs_anchoring" | "not_freestanding",
--     "floorCells": n, "levels": n, "zeroSupportCells": n, "weakSupportCells": n }
--
-- NULL = not yet computed (legacy rows); the client computes it on the fly
-- when NULL, so nothing breaks unbackfilled. The column exists so the
-- verdict is queryable (gallery badges, stats) and never re-asked.
--
-- IDEMPOTENT: safe to re-run in the SQL editor.

alter table public.puzzles
  add column if not exists physical_support jsonb;

comment on column public.puzzles.physical_support is
  'Physical-buildability report (client analyzer, see src/utils/physicalSupport.ts). NULL = not yet computed.';

-- Optional partial index for future gallery filtering by verdict.
create index if not exists idx_puzzles_physical_verdict
  on public.puzzles ((physical_support->>'verdict'))
  where physical_support is not null;
