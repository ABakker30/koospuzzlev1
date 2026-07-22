-- Contest engine Phase 1: many concurrent admin-managed contests of multiple
-- types, replacing (eventually) the single-row contest_settings Discovery
-- Challenge. Legacy contest_settings/contest_payouts stay untouched until the
-- running Discovery contest is settled.
--
-- Types (Phase 1):
--   new_puzzle_popularity — puzzle CREATED in the window with the most
--                           distinct signed-in solvers (creator wins)
--   solution_rush         — most first-ever discoveries by a player on the
--                           target puzzle within the window
--   speed_trial           — fastest honest solve on the target puzzle within
--                           the window (optional palette param)
--   discovery             — reserved for porting the legacy contest later
--
-- Standings are computed client-side from solutions/puzzles (like the legacy
-- fetchContestClaims); winners are settled by the admin into contest_awards.

create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('discovery', 'new_puzzle_popularity', 'solution_rush', 'speed_trial')),
  title text not null default '',
  message text,
  -- Target puzzle for puzzle-scoped types; NULL for cross-puzzle types
  -- (new_puzzle_popularity).
  puzzle_id uuid references public.puzzles(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  prize_usd numeric not null default 100 check (prize_usd > 0 and prize_usd <= 1000),
  winners_count int not null default 1 check (winners_count >= 1 and winners_count <= 10),
  -- Total-pot cap mirrors constants/contest.ts CONTEST_CAPS.
  constraint contests_total_cap check (prize_usd * winners_count <= 2000),
  -- Sponsor block (same semantics as contest_settings.partner_*).
  partner_name text,
  partner_url text,
  partner_logo_url text,
  status text not null default 'draft' check (status in ('draft', 'live', 'ended', 'settled')),
  -- Type-specific knobs, e.g. {"palette":"classic"} for speed_trial,
  -- {"minSolvers":3} for new_puzzle_popularity.
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists contests_status_idx on public.contests (status, ends_at);

comment on table public.contests is
  'Admin-managed prize contests (multiple concurrent, typed). Standings derived client-side; winners settled into contest_awards.';

-- Awards ledger: one row per settled winner. Mirrors contest_payouts'
-- paid/unpaid bookkeeping but keyed to the contest engine.
create table if not exists public.contest_awards (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  -- What earned it (context for review; either may be null depending on type).
  solution_id uuid references public.solutions(id) on delete set null,
  puzzle_id uuid references public.puzzles(id) on delete set null,
  rank int not null default 1,
  amount_usd numeric not null check (amount_usd > 0),
  note text,
  awarded_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists contest_awards_contest_idx on public.contest_awards (contest_id);

comment on table public.contest_awards is
  'Settled contest winners (admin-written). paid_at = payment ledger, mirroring contest_payouts.';

-- RLS: contests are publicly readable (banners/rules for guests too); only
-- admins write. Awards: admins everything; users may read their own awards.
alter table public.contests enable row level security;
alter table public.contest_awards enable row level security;

drop policy if exists "Public read contests" on public.contests;
create policy "Public read contests"
  on public.contests for select
  to public
  using (true);

drop policy if exists "Admins write contests" on public.contests;
create policy "Admins write contests"
  on public.contests for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins manage awards" on public.contest_awards;
create policy "Admins manage awards"
  on public.contest_awards for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Users read own awards" on public.contest_awards;
create policy "Users read own awards"
  on public.contest_awards for select
  to authenticated
  using (user_id = auth.uid());
