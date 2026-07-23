-- Forming preview over the polling backbone (2026-08-11).
--
-- The opponent's in-progress sphere selection ("forming ghost") streamed only
-- over an ephemeral realtime BROADCAST channel — dead whenever realtime is
-- down, which field testing showed happens for long stretches on phones.
-- These columns let the active player mirror the same full-state payload onto
-- the session row (throttled, ~1.5s), so the existing 4s poll can deliver a
-- chunky-but-alive ghost when broadcast isn't flowing.
--
-- IMPORTANT: this is ephemeral PRESENCE state, not game truth. Nothing about
-- the game replays from it; it is written best-effort, cleared on commit /
-- deselect / unmount, and ignored when stale (>10s). Writers deliberately do
-- NOT bump updated_at (no trigger touches it on this table) so forming churn
-- can't disturb the session-row change detection in the clients' poll loop.
--
-- No RLS changes: players can already UPDATE their own game_sessions rows.

alter table public.game_sessions
  add column if not exists forming_cells jsonb,
  add column if not exists forming_player smallint,
  add column if not exists forming_at timestamptz;

comment on column public.game_sessions.forming_cells is
  'Ephemeral presence: the forming player''s current in-progress selection as a JSON array of {i,j,k} cells. Full-state (never deltas); null when nobody is forming. Not game truth — never replayed.';
comment on column public.game_sessions.forming_player is
  'Ephemeral presence: which player (1|2) the forming_cells belong to; null when nobody is forming.';
comment on column public.game_sessions.forming_at is
  'Ephemeral presence: when forming_cells was last written. Readers ignore entries older than ~10s; writers throttle to ~1 write / 1.5s.';
