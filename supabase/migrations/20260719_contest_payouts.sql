-- Discovery Challenge payout ledger — which winning solutions have been paid.
-- Admin-only in both directions; players never see this table.

create table if not exists public.contest_payouts (
  solution_id uuid primary key references public.solutions(id) on delete cascade,
  paid_at timestamptz not null default now(),
  note text
);

alter table public.contest_payouts enable row level security;

create policy "Admins manage contest payouts"
  on public.contest_payouts
  for all
  using (public.is_admin())
  with check (public.is_admin());
