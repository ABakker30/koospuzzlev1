-- Moderation basics for launch: content filter, create rate-limits, reports.
--
-- Enforcement is DB-side (triggers) because the frontend is static and the
-- REST API is reachable directly with the anon key — client-side filtering is
-- UX polish, not security. The blocklist lives in a table so it is manageable
-- from /admin without migrations.

-- ---------------------------------------------------------------------------
-- Blocklist (admin-managed). Publicly readable so the client can pre-check
-- for friendly UX (the words are not secrets; enforcement is the trigger).
-- ---------------------------------------------------------------------------
create table if not exists public.moderation_blocklist (
  word text primary key,
  created_at timestamptz not null default now()
);

alter table public.moderation_blocklist enable row level security;

drop policy if exists "Public read blocklist" on public.moderation_blocklist;
create policy "Public read blocklist"
  on public.moderation_blocklist for select
  to public
  using (true);

drop policy if exists "Admins write blocklist" on public.moderation_blocklist;
create policy "Admins write blocklist"
  on public.moderation_blocklist for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Starter set: common English profanity/slurs. Anton curates from /admin.
insert into public.moderation_blocklist (word) values
  ('fuck'), ('shit'), ('bitch'), ('cunt'), ('asshole'), ('dick'), ('cock'),
  ('pussy'), ('whore'), ('slut'), ('bastard'), ('nigger'), ('nigga'),
  ('faggot'), ('fag'), ('retard'), ('rape'), ('rapist'), ('nazi'), ('hitler'),
  ('kike'), ('spic'), ('chink'), ('wetback'), ('tranny'), ('porn'), ('penis'),
  ('vagina'), ('cum'), ('jizz'), ('blowjob'), ('handjob'), ('dildo'),
  ('kanker'), ('hoer'), ('kut'), ('lul'), ('neger'), ('puta'), ('merde'),
  ('scheisse'), ('fotze'), ('hurensohn')
on conflict (word) do nothing;

-- ---------------------------------------------------------------------------
-- Text check: lowercase + de-leet + word-boundary match against the list.
-- Two passes: the normalized text, and the text with non-alphanumerics
-- stripped (catches f.u.c.k / f_u_c_k spacing tricks).
-- ---------------------------------------------------------------------------
create or replace function public.contains_disallowed_text(t text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized text;
  squeezed text;
  hit boolean;
begin
  if t is null or t = '' then
    return false;
  end if;
  normalized := lower(t);
  normalized := translate(normalized, '013457@$!', 'oieastasi');
  squeezed := regexp_replace(normalized, '[^a-z]', '', 'g');
  select bool_or(
           normalized ~* ('\m' || b.word || '\M')
           or squeezed like ('%' || b.word || '%')
         )
    into hit
    from public.moderation_blocklist b;
  return coalesce(hit, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Content triggers. Raise a recognizable message the client maps to a toast.
-- ---------------------------------------------------------------------------
create or replace function public.trg_check_puzzle_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.contains_disallowed_text(new.name)
     or public.contains_disallowed_text(new.description)
     or public.contains_disallowed_text(new.challenge_message)
     or public.contains_disallowed_text(new.creator_name) then
    raise exception 'disallowed_content';
  end if;
  return new;
end;
$$;

drop trigger if exists puzzles_content_check on public.puzzles;
create trigger puzzles_content_check
  before insert or update on public.puzzles
  for each row execute function public.trg_check_puzzle_content();

create or replace function public.trg_check_username_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.contains_disallowed_text(new.username) then
    raise exception 'disallowed_content';
  end if;
  return new;
end;
$$;

drop trigger if exists users_username_check on public.users;
create trigger users_username_check
  before insert or update of username on public.users
  for each row execute function public.trg_check_username_content();

create or replace function public.trg_check_solution_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.contains_disallowed_text(new.solver_name) then
    raise exception 'disallowed_content';
  end if;
  return new;
end;
$$;

drop trigger if exists solutions_content_check on public.solutions;
create trigger solutions_content_check
  before insert on public.solutions
  for each row execute function public.trg_check_solution_content();

-- ---------------------------------------------------------------------------
-- Rate limits on creation. Anonymous-JWT sessions (guest sign-ins exist for
-- PvP joins) may not create puzzles at all; signed-in users are capped.
-- Helper is created here defensively (also ships in 20260725).
-- ---------------------------------------------------------------------------
create or replace function public.is_anonymous_user()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

create or replace function public.trg_rate_limit_puzzles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  if public.is_anonymous_user() then
    raise exception 'account_required';
  end if;
  if new.created_by is not null then
    select count(*) into recent
      from public.puzzles
     where created_by = new.created_by
       and created_at > now() - interval '1 hour';
    if recent >= 10 then
      raise exception 'rate_limited';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists puzzles_rate_limit on public.puzzles;
create trigger puzzles_rate_limit
  before insert on public.puzzles
  for each row execute function public.trg_rate_limit_puzzles();

create or replace function public.trg_rate_limit_solutions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  if new.created_by is not null then
    select count(*) into recent
      from public.solutions
     where created_by = new.created_by
       and created_at > now() - interval '1 hour';
    if recent >= 30 then
      raise exception 'rate_limited';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists solutions_rate_limit on public.solutions;
create trigger solutions_rate_limit
  before insert on public.solutions
  for each row execute function public.trg_rate_limit_solutions();

-- ---------------------------------------------------------------------------
-- Reports: anyone signed in (guests included) can flag content; admins review.
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.users(id) on delete set null,
  target_type text not null check (target_type in ('puzzle', 'solution', 'user')),
  target_id uuid not null,
  reason text not null check (reason in ('inappropriate', 'spam', 'offensive_name', 'other')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text
);

create index if not exists reports_open_idx on public.reports (created_at) where resolved_at is null;

alter table public.reports enable row level security;

drop policy if exists "Signed-in users file reports" on public.reports;
create policy "Signed-in users file reports"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid() or reporter_id is null);

drop policy if exists "Admins manage reports" on public.reports;
create policy "Admins manage reports"
  on public.reports for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Rate-limit report spam too: 10 reports/hour per reporter.
create or replace function public.trg_rate_limit_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  if new.reporter_id is not null then
    select count(*) into recent
      from public.reports
     where reporter_id = new.reporter_id
       and created_at > now() - interval '1 hour';
    if recent >= 10 then
      raise exception 'rate_limited';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function public.trg_rate_limit_reports();
