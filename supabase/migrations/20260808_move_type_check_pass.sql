-- game_moves.move_type CHECK predates the check/pass mechanics: it allows
-- only place|hint|resign|timeout while GamePage submits 'check' (4 call
-- sites) and 'pass'. Those inserts fail 23514, and because submitMove
-- returns before its session update, current_turn never advances — a
-- cross-client turn deadlock on every Check use or pass in a real match.
-- Verified against prod 2026-07-22 (probe insert rejected 23514).

alter table public.game_moves drop constraint game_moves_move_type_check;
alter table public.game_moves add constraint game_moves_move_type_check
  check (move_type in ('place', 'hint', 'check', 'pass', 'resign', 'timeout'));
