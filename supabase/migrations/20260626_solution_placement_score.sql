-- Ranked scoring: store the lightweight "placements by you" metric on each
-- solve so the leaderboard can rank by X/N without pulling the heavy
-- placed_pieces blob into list views.
--
-- placements_by_you = pieces the solver placed themselves (source 'user').
-- total_pieces      = total pieces in the solved puzzle (N).
-- Leaderboard ranks by placements_by_you desc (fewest hints), then duration asc.
-- Populated for new solves only; existing rows stay NULL (shown as "–").

alter table public.solutions
  add column if not exists placements_by_you integer,
  add column if not exists total_pieces integer;
