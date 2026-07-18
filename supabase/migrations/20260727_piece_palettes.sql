-- 20260727_piece_palettes.sql
-- Piece palettes: the unified identity behind Classic / Free Pieces /
-- Choose Pieces play, and the key leaderboards rank by.
--
--   solutions.piece_set        canonical palette signature:
--                              'classic' | 'free' | 'only:D' | 'only:D+Y'
--   solutions.duplicate_count  pieces placed beyond the first copy of each
--                              type; the Free Pieces board ranks by fewest
--                              duplicates first, then placements, then time.
--
-- Choose Pieces (formerly One Piece) now allows MULTI-piece selections;
-- the legacy single_piece_id column carries the sorted 'D+Y' string.
-- Every (puzzle x palette) pair is its own leaderboard; Classic remains
-- the canonical ranked surface.
--
-- IDEMPOTENT: safe to re-run in the SQL editor.

alter table public.solutions
  add column if not exists piece_set text;

alter table public.solutions
  add column if not exists duplicate_count integer;

-- Backfill signatures from the legacy mode columns.
update public.solutions
set piece_set = case
  when piece_mode = 'duplicates' then 'free'
  when piece_mode = 'single' and single_piece_id is not null
    then 'only:' || replace(single_piece_id, ',', '+')
  else 'classic'
end
where piece_set is null;

-- Backfill duplicate counts from placed_pieces (pieces placed - distinct types).
update public.solutions s
set duplicate_count = sub.total - sub.distinct_types
from (
  select id,
         (select count(*) from jsonb_array_elements(placed_pieces)) as total,
         (select count(distinct elem->>'pieceId')
            from jsonb_array_elements(placed_pieces) elem) as distinct_types
  from public.solutions
  where placed_pieces is not null
    and jsonb_typeof(placed_pieces) = 'array'
) sub
where s.id = sub.id
  and s.duplicate_count is null;

-- Palette leaderboards query on (puzzle_id, piece_set).
create index if not exists solutions_puzzle_piece_set_idx
  on public.solutions (puzzle_id, piece_set);
