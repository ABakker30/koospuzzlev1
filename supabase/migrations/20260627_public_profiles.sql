-- Public profile read: expose ONLY (id, username) to anonymous + authenticated
-- visitors, so public leaderboards / challenge cards / owners can resolve the
-- current display name by user id. Usernames are already public on leaderboards;
-- this exposes nothing new (and NOT email). This replaces the denormalized,
-- go-stale name copies (solutions.solver_name / puzzles.creator_name) — the app
-- now looks names up live from here.
--
-- The view is SECURITY DEFINER (security_invoker = false) so it reads the users
-- table as the view owner and returns only the two safe columns; the underlying
-- users RLS still blocks direct anon reads of the full row.

create or replace view public.public_profiles
  with (security_invoker = false) as
  select id, username
  from public.users;

grant select on public.public_profiles to anon, authenticated;
