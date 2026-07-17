-- Discovery Challenge settings — single-row table so Anton can manage every
-- aspect of the contest from /admin without a deploy. Caps are enforced here
-- (not just in the UI): max 10 winners, max $1000 per prize, max $2000 total.

create table if not exists public.contest_settings (
  id int primary key default 1 check (id = 1), -- single row
  enabled boolean not null default false,
  puzzle_id uuid references public.puzzles(id) on delete set null,
  prize_usd int not null default 100 check (prize_usd >= 1 and prize_usd <= 1000),
  winners int not null default 10 check (winners >= 1 and winners <= 10),
  start_at timestamptz,
  end_at timestamptz,
  message text,
  partner_name text,
  partner_url text,
  updated_at timestamptz not null default now(),
  constraint contest_total_cap check (prize_usd * winners <= 2000),
  constraint contest_dates check (end_at is null or start_at is null or end_at > start_at)
);

insert into public.contest_settings (id) values (1) on conflict do nothing;

alter table public.contest_settings enable row level security;

-- Everyone can read (the banner and rules page need it); only admins write.
create policy "Anyone can read contest settings"
  on public.contest_settings for select using (true);

create policy "Admins update contest settings"
  on public.contest_settings for update
  using (public.is_admin())
  with check (public.is_admin());
