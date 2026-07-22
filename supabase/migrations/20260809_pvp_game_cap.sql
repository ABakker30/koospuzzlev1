-- Server-side cap on concurrent hosted PvP games (Phase 1 hardening).
--
-- A signed-in user may have at most 5 OPEN real matches they created
-- (status waiting or active, is_simulated = false). Enforced DB-side because
-- the frontend is static and the REST API is reachable directly with the anon
-- key — the client gate is UX polish, not security. Guests cannot host
-- (20260725 policy), so they are naturally bounded.
--
-- The client maps the 'too_many_games' rejection to a friendly message
-- (createPvPSession → PvPGameCapError). Safe to run before or after the
-- client deploys: without the trigger, inserts simply succeed; with it, old
-- clients surface the raw message and new clients surface the friendly one.
-- Simulated (vs computer) sessions are never counted and never blocked.

create or replace function public.trg_pvp_open_game_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  open_count int;
begin
  if new.is_simulated = false then
    select count(*) into open_count
      from public.game_sessions
     where player1_id = new.player1_id
       and status in ('waiting', 'active')
       and is_simulated = false;
    if open_count >= 5 then
      raise exception 'too_many_games';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists game_sessions_open_game_cap on public.game_sessions;
create trigger game_sessions_open_game_cap
  before insert on public.game_sessions
  for each row execute function public.trg_pvp_open_game_cap();
