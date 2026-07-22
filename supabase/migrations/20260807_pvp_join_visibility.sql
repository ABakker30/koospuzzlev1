-- PvP join visibility: an invitee must be able to SEE a joinable session.
--
-- game_sessions RLS only exposed rows to their participants, so the join
-- flow's first step (select by invite_code) returned nothing for the invitee
-- — guest join could never work end-to-end. Expose exactly the joinable
-- surface: waiting sessions that actually carry an invite code. Terminal /
-- active sessions stay participant-only.

drop policy if exists "Signed-in users can view joinable sessions" on public.game_sessions;
create policy "Signed-in users can view joinable sessions"
  on public.game_sessions for select
  to authenticated
  using (status = 'waiting' and invite_code is not null);
