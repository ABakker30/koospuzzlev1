-- Sponsor logo + 18+ prize-eligibility attestation.
--
-- 1) contest_settings.partner_logo_url — public URL of the sponsor logo shown
--    on the contest banner, rules page, and contest share clips. Uploaded from
--    /admin into the new public 'sponsors' bucket below.
-- 2) users.age_confirmed_at — when the user self-attested being 18+ (or the
--    age of majority in their jurisdiction). Attestation only: it gates prize
--    ELIGIBILITY MESSAGING, never play, and Anton verifies before paying.
--
-- The app degrades gracefully when this migration hasn't run (missing column
-- or bucket → the feature stays hidden), so migration order is not critical.

alter table public.contest_settings
  add column if not exists partner_logo_url text;

comment on column public.contest_settings.partner_logo_url is
  'Public URL of the sponsor logo (sponsors bucket); shown labeled as sponsored on the banner, rules page, and contest clips.';

alter table public.users
  add column if not exists age_confirmed_at timestamptz;

comment on column public.users.age_confirmed_at is
  'Self-attested 18+ (or age of majority) timestamp. Prize-eligibility messaging only — never gates play; verified by hand before payout.';

-- Admins can read user rows: the /admin claim review shows an "18+ confirmed"
-- chip per claimant, and users RLS otherwise only exposes your own row.
drop policy if exists "Admins read users" on public.users;
create policy "Admins read users"
  on public.users for select
  using (public.is_admin());

-- Public 'sponsors' storage bucket: anyone can view logos, only admins manage
-- them (uploads happen from the /admin contest manager).
insert into storage.buckets (id, name, public)
values ('sponsors', 'sponsors', true)
on conflict (id) do nothing;

drop policy if exists "Public read access to sponsor logos" on storage.objects;
create policy "Public read access to sponsor logos"
  on storage.objects for select
  to public
  using (bucket_id = 'sponsors');

drop policy if exists "Admins upload sponsor logos" on storage.objects;
create policy "Admins upload sponsor logos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'sponsors' and public.is_admin());

drop policy if exists "Admins update sponsor logos" on storage.objects;
create policy "Admins update sponsor logos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'sponsors' and public.is_admin())
  with check (bucket_id = 'sponsors' and public.is_admin());

drop policy if exists "Admins delete sponsor logos" on storage.objects;
create policy "Admins delete sponsor logos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'sponsors' and public.is_admin());
