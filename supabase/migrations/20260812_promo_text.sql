-- Promo video text + solo-game deeplink settings for the Discovery Challenge.
--
-- 1) promo_kicker / promo_headline / promo_subline / promo_cta — the 🎬
--    Contest promo video recorder (PromoClipModal) used to hardcode its
--    overlay copy (including money-derived lines built from prize_usd ×
--    winners). All overlay text now comes from the Discovery Challenge setup
--    instead — four nullable columns on the single-row contest_settings
--    table, edited from /admin. Empty/null lines are simply omitted from the
--    video overlay.
-- 2) solo_settings — jsonb solo-game settings for the contest play deeplink,
--    e.g. {"palette":"only:D+Y"} (palette signatures per
--    src/utils/piecePalette.ts). When set, contest "play" CTAs deep-link
--    STRAIGHT into a solo game with those settings (/game/:id?mode=solo&
--    palette=…) instead of landing on the puzzle viewer.
--
-- The app degrades gracefully when this migration hasn't run (select('*')
-- tolerates missing columns → the fields stay null; updateContest retries the
-- save without the missing columns), so migration order is not critical.

alter table public.contest_settings
  add column if not exists promo_kicker text;
alter table public.contest_settings
  add column if not exists promo_headline text;
alter table public.contest_settings
  add column if not exists promo_subline text;
alter table public.contest_settings
  add column if not exists promo_cta text;
alter table public.contest_settings
  add column if not exists solo_settings jsonb;

comment on column public.contest_settings.promo_kicker is
  'Promo video overlay: small top line above the headline, e.g. "THE DISCOVERY CHALLENGE". Null/empty = omitted.';
comment on column public.contest_settings.promo_headline is
  'Promo video overlay: hero line, e.g. "A new solution has never been found". Null/empty = omitted.';
comment on column public.contest_settings.promo_subline is
  'Promo video overlay: gold badge line under the headline. Null/empty = omitted.';
comment on column public.contest_settings.promo_cta is
  'Promo video overlay: call-to-action near the bottom, e.g. "Find a solution nobody has ever found". Null/empty = omitted.';
comment on column public.contest_settings.solo_settings is
  'Solo-game settings for the contest play deeplink, e.g. {"palette":"only:D+Y"} (signatures per src/utils/piecePalette.ts). When set, contest CTAs deep-link straight into a solo game with these settings; null = CTAs open the puzzle viewer as before.';
