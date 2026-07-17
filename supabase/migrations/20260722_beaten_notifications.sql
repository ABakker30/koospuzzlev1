-- Dedup ledger for the beaten-digest email (one email per displaced user per
-- rival solution). Written only by the edge function (service role bypasses
-- RLS); nothing client-side reads it.

create table if not exists public.beaten_notifications (
  user_id uuid not null,
  solution_id uuid not null references public.solutions(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, solution_id)
);

alter table public.beaten_notifications enable row level security;
-- No policies: service-role only.
