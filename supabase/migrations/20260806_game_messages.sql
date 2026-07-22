-- Persistent PvP chat (async-first PvP Phase 2b).
--
-- Chat was realtime-broadcast only (ephemeral): fine for live-only play,
-- wrong for turn-at-your-leisure games — messages sent while the opponent is
-- away simply vanished, and the DB content filter could not apply. Messages
-- now persist per session: instant delivery when both are present (realtime),
-- history on open when not, and the moderation trigger covers chat like
-- every other user text.

create table if not exists public.game_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  sender_id uuid not null,
  text text not null check (char_length(text) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists game_messages_session_idx
  on public.game_messages (session_id, created_at);

comment on table public.game_messages is
  'Per-session PvP chat (async-persistent). Players-only read/write; moderated by the shared content trigger.';

alter table public.game_messages enable row level security;

-- Only the two players of the session may read or write its chat. Guests are
-- anonymous-auth users, so auth.uid() covers them too.
drop policy if exists "Players read session chat" on public.game_messages;
create policy "Players read session chat"
  on public.game_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.game_sessions s
      where s.id = session_id
        and (s.player1_id = auth.uid() or s.player2_id = auth.uid())
    )
  );

drop policy if exists "Players write session chat" on public.game_messages;
create policy "Players write session chat"
  on public.game_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.game_sessions s
      where s.id = session_id
        and (s.player1_id = auth.uid() or s.player2_id = auth.uid())
        and s.status in ('waiting', 'active')
    )
  );

drop policy if exists "Admins read session chat" on public.game_messages;
create policy "Admins read session chat"
  on public.game_messages for select
  to authenticated
  using (public.is_admin());

-- Content filter: same trigger machinery as puzzles/usernames (20260805).
create or replace function public.trg_check_message_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.contains_disallowed_text(new.text) then
    raise exception 'disallowed_content';
  end if;
  return new;
end;
$$;

drop trigger if exists game_messages_content_check on public.game_messages;
create trigger game_messages_content_check
  before insert on public.game_messages
  for each row execute function public.trg_check_message_content();

-- Chat-rate limit: 20 messages per minute per sender.
create or replace function public.trg_rate_limit_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  select count(*) into recent
    from public.game_messages
   where sender_id = new.sender_id
     and created_at > now() - interval '1 minute';
  if recent >= 20 then
    raise exception 'rate_limited';
  end if;
  return new;
end;
$$;

drop trigger if exists game_messages_rate_limit on public.game_messages;
create trigger game_messages_rate_limit
  before insert on public.game_messages
  for each row execute function public.trg_rate_limit_messages();

-- Realtime delivery (idempotent add to the publication).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'game_messages'
  ) then
    alter publication supabase_realtime add table public.game_messages;
  end if;
end;
$$;
