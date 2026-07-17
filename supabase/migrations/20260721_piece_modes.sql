-- Piece modes: how a solution was solved.
--   'unique'     — Classic: one of each piece (the real Koos puzzle)
--   'duplicates' — Free Pieces: any piece, unlimited copies
--   'single'     — One Piece: the whole shape from one repeating piece type
--
-- Everything that existed before this migration was Classic (the app only
-- ever dealt one set), so the default backfills correctly.
-- Ranked surfaces (leaderboards, solve ranks, Discovery Challenge) filter
-- piece_mode = 'unique'. PvP needs no columns: game_sessions.inventory_state
-- already carries the piece counts, which IS the mode.

alter table public.solutions
  add column if not exists piece_mode text not null default 'unique'
    check (piece_mode in ('unique', 'duplicates', 'single'));

alter table public.solutions
  add column if not exists single_piece_id text;

-- Ranked queries filter on (puzzle_id, piece_mode).
create index if not exists solutions_puzzle_piece_mode_idx
  on public.solutions (puzzle_id, piece_mode);
