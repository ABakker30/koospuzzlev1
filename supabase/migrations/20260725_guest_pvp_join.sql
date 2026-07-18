-- 20260725_guest_pvp_join.sql
-- Guest PvP: an invited player can join a match without creating an account.
--
-- The client signs the invitee in with supabase.auth.signInAnonymously().
-- REQUIRES a Dashboard toggle: Authentication -> Sign In / Up ->
-- "Allow anonymous sign-ins". Abuse guard = the built-in per-IP rate limit
-- on anonymous sign-ins (Authentication -> Rate Limits). Do NOT enable
-- dashboard CAPTCHA ("Attack Protection") without first wiring a captcha
-- widget into the client - it gates ALL auth flows incl. magic-link login.
-- Anonymous users run as the `authenticated` role with is_anonymous = true
-- in the JWT, so the existing per-player policies keep working once they are
-- in a game. This migration closes the server-side gaps:
--
--   1. Joining is an UPDATE on a waiting session, but "Players can update
--      own games" only matches rows you are already a player in. Add a join
--      policy for the empty seat of waiting sessions (this also fixes invite
--      joins for signed-in users anywhere prod still runs the 20260216
--      policies verbatim).
--   2. Hosting stays account-only: creating a session now requires a
--      non-anonymous JWT, matching the client (guests can join, not host).
--   3. Simulated "random opponent" identities are sampled from users; keep
--      guest rows out of that pool.
--
-- Guests get a public.users row (FK target for game_sessions.player2_id /
-- game_moves.player_id) with a synthetic guest-<uid>@guest.koospuzzle.com
-- email, created by the client under the existing "own profile" policies.
-- App-level account gates are unaffected: the client never promotes an
-- anonymous session to a signed-in user.
--
-- IDEMPOTENT: safe to re-run in the SQL editor.

-- Helper: is the current JWT an anonymous (guest) session?
create or replace function public.is_anonymous_user()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt()->>'is_anonymous')::boolean, false);
$$;

-- 1) JOIN: any authenticated user (incl. guests) may claim the empty seat of
--    a waiting session. WITH CHECK pins the seat to the caller so a joiner
--    cannot write someone else into it.
drop policy if exists "Anyone signed in can join waiting games" on public.game_sessions;
create policy "Anyone signed in can join waiting games"
  on public.game_sessions for update
  using (status = 'waiting' and player2_id is null)
  with check (player2_id = auth.uid());

-- 2) CREATE: hosting requires a real account (the client already gates this;
--    this makes it hold server-side too).
drop policy if exists "Authenticated users can create games" on public.game_sessions;
create policy "Authenticated users can create games"
  on public.game_sessions for insert
  with check (auth.uid() = player1_id and not public.is_anonymous_user());

-- 3) Random-opponent pool: real accounts only.
create or replace function get_random_opponent(requesting_user_id uuid)
returns table(id uuid, username text, avatar_url text)
language sql
security definer
as $$
  select u.id, u.username, u.avatar_url
  from public.users u
  join auth.users au on au.id = u.id
  where u.id != requesting_user_id
    and coalesce(au.is_anonymous, false) = false
  order by random()
  limit 1;
$$;

-- Verify (run after; expect the join + create policies listed):
-- select policyname, cmd from pg_policies where tablename = 'game_sessions';
