-- The 5-open-games cap (20260809) counted every 'waiting' row — including
-- invites whose invite_expires_at had passed. Those rows are invisible in the
-- games inbox (an expired unanswered invite reads as closed) and nothing
-- sweeps them (joinPvPSession only marks 'expired' when someone touches the
-- dead link), so users get capped by ghost games they cannot see or close.
-- Observed live: a tester blocked by NINE zombie waiting rows dating back
-- months (the old 10-minute-expiry era).
--
-- Two parts, both idempotent:
--   1. one-time sweep: expire every already-dead unanswered invite
--   2. cap counts only claimable waiting invites + active games

update public.game_sessions
   set status = 'expired',
       ended_at = now(),
       updated_at = now()
 where status = 'waiting'
   and invite_expires_at is not null
   and invite_expires_at < now();

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
       and is_simulated = false
       and (
         status = 'active'
         or (
           status = 'waiting'
           and (invite_expires_at is null or invite_expires_at >= now())
         )
       );
    if open_count >= 5 then
      raise exception 'too_many_games';
    end if;
  end if;
  return new;
end;
$$;

-- Trigger itself is unchanged (20260809); function replacement is enough.
