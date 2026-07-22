-- No-prize promotions: contests may run with prize_usd = 0 — same sponsor
-- logo/link, standings, and settlement (winners recorded for recognition),
-- just no money. The 18+ attestation surfaces only apply to prized contests
-- (it exists for PRIZE eligibility), which the client handles.

alter table public.contests
  drop constraint if exists contests_prize_usd_check;
alter table public.contests
  add constraint contests_prize_usd_check
  check (prize_usd >= 0 and prize_usd <= 1000);

alter table public.contest_awards
  drop constraint if exists contest_awards_amount_usd_check;
alter table public.contest_awards
  add constraint contest_awards_amount_usd_check
  check (amount_usd >= 0);
