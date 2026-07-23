// contestService — the Discovery Challenge config, read from the single-row
// contest_settings table (managed by Anton in /admin). Short cache so the
// banner/rules pages don't refetch on every mount. Caps live in
// constants/contest.ts and are ALSO enforced by DB check constraints.

import { supabase } from '../lib/supabase';
import { CONTEST_CAPS } from '../constants/contest';
import { parsePaletteParam } from '../utils/piecePalette';

/** Solo-game settings for the contest play deeplink (solo_settings jsonb).
 *  `palette` is a piece-palette signature — 'classic' | 'free' | 'only:D+Y'
 *  (src/utils/piecePalette.ts) — i.e. exactly the choice a player makes on
 *  the solo setup screen (timer/hints are PvP-only). Kept as an object so
 *  future solo options can ride along without a new column. */
export interface ContestSoloSettings {
  palette: string;
}

export interface ContestConfig {
  enabled: boolean;
  puzzleId: string | null;
  prizeUsd: number;
  winners: number;
  startIso: string | null;
  endIso: string | null;
  message: string | null;
  partnerName: string | null;
  partnerUrl: string | null;
  /** Public URL of the sponsor logo (sponsors bucket). Null pre-migration
   *  (20260802_sponsor_age_gate.sql) — every surface hides the logo then. */
  partnerLogoUrl: string | null;
  /** Promo video overlay copy (20260812_promo_text.sql) — the 🎬 promo clip
   *  renders ONLY these configured lines (plus the typed promotion text and
   *  brand chrome); null/empty lines are omitted. Null pre-migration. */
  promoKicker: string | null;
  promoHeadline: string | null;
  promoSubline: string | null;
  promoCta: string | null;
  /** When set, contest "play" CTAs deep-link straight into a solo game with
   *  these settings (see contestPlayPath). Null = CTAs open the viewer. */
  soloSettings: ContestSoloSettings | null;
}

const EMPTY: ContestConfig = {
  enabled: false,
  puzzleId: null,
  prizeUsd: 100,
  winners: 10,
  startIso: null,
  endIso: null,
  message: null,
  partnerName: null,
  partnerUrl: null,
  partnerLogoUrl: null,
  promoKicker: null,
  promoHeadline: null,
  promoSubline: null,
  promoCta: null,
  soloSettings: null,
};

/** Strict read-side gate for the solo_settings jsonb: anything that isn't an
 *  object carrying a valid palette signature reads as null (not configured),
 *  so a hand-edited or corrupt row can never produce a broken deeplink. */
function parseSoloSettings(raw: unknown): ContestSoloSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const palette = (raw as { palette?: unknown }).palette;
  if (typeof palette !== 'string' || !parsePaletteParam(palette)) return null;
  return { palette };
}

let cache: ContestConfig | null = null;
let fetchedAt = 0;
const CACHE_MS = 60_000;

export async function getContest(force = false): Promise<ContestConfig> {
  if (!force && cache && Date.now() - fetchedAt < CACHE_MS) return cache;
  const { data, error } = await supabase
    .from('contest_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return cache ?? EMPTY;
  cache = {
    enabled: !!data.enabled,
    puzzleId: data.puzzle_id ?? null,
    prizeUsd: Number(data.prize_usd ?? 100),
    winners: Number(data.winners ?? 10),
    startIso: data.start_at ?? null,
    endIso: data.end_at ?? null,
    message: data.message ?? null,
    partnerName: data.partner_name ?? null,
    partnerUrl: data.partner_url ?? null,
    // select('*') tolerates the columns missing pre-migration → stay null.
    partnerLogoUrl: data.partner_logo_url ?? null,
    promoKicker: data.promo_kicker ?? null,
    promoHeadline: data.promo_headline ?? null,
    promoSubline: data.promo_subline ?? null,
    promoCta: data.promo_cta ?? null,
    soloSettings: parseSoloSettings(data.solo_settings),
  };
  fetchedAt = Date.now();
  return cache;
}

/** Fully configured, switched on, started, and not past its end date. */
export function isContestLive(c: ContestConfig): boolean {
  if (!c.enabled || !c.puzzleId || !c.startIso) return false;
  const now = Date.now();
  if (new Date(c.startIso).getTime() > now) return false;
  if (c.endIso && new Date(c.endIso).getTime() < now) return false;
  return true;
}

export const prizeLabel = (c: ContestConfig): string => `$${c.prizeUsd}`;

/**
 * Where "play the contest puzzle" CTAs land. With solo settings configured:
 * straight into a solo game with that palette via GamePage's existing
 * ?mode=solo + ?palette= deep-link path — no setup screen, and guest-friendly
 * (the /game route and solo start require no account). Otherwise: the puzzle
 * viewer, exactly as before. Invalid palettes never reach a URL — reads are
 * gated by parseSoloSettings, and GamePage itself treats an unparseable
 * palette/mode as "not present" (normal flow, never a broken page).
 */
export function contestPlayPath(c: ContestConfig): string | null {
  if (!c.puzzleId) return null;
  return c.soloSettings
    ? `/game/${c.puzzleId}?mode=solo&palette=${encodeURIComponent(c.soloSettings.palette)}`
    : `/puzzles/${c.puzzleId}/view`;
}

/** Client-side mirror of the DB caps. Returns null when valid. */
export function validateContest(c: ContestConfig): string | null {
  if (c.winners < 1 || c.winners > CONTEST_CAPS.maxWinners)
    return `Winners must be 1–${CONTEST_CAPS.maxWinners}.`;
  if (c.prizeUsd < 1 || c.prizeUsd > CONTEST_CAPS.maxPrizeUsd)
    return `Prize must be $1–$${CONTEST_CAPS.maxPrizeUsd}.`;
  if (c.prizeUsd * c.winners > CONTEST_CAPS.maxTotalUsd)
    return `Total prize pool (${c.winners} × $${c.prizeUsd} = $${c.prizeUsd * c.winners}) exceeds the $${CONTEST_CAPS.maxTotalUsd} cap.`;
  if (c.enabled && (!c.puzzleId || !c.startIso))
    return 'To enable the contest, set a target puzzle and a start date.';
  if (c.startIso && c.endIso && new Date(c.endIso) <= new Date(c.startIso))
    return 'End date must be after the start date.';
  if (c.soloSettings && !parsePaletteParam(c.soloSettings.palette))
    return 'Solo game settings are incomplete — pick at least one piece (or switch the deeplink off).';
  return null;
}

/** Admin-only (RLS-enforced). Returns an error message or null on success. */
export async function updateContest(c: ContestConfig): Promise<string | null> {
  const invalid = validateContest(c);
  if (invalid) return invalid;
  const payload: Record<string, unknown> = {
    enabled: c.enabled,
    puzzle_id: c.puzzleId,
    prize_usd: c.prizeUsd,
    winners: c.winners,
    start_at: c.startIso,
    end_at: c.endIso,
    message: c.message,
    partner_name: c.partnerName,
    partner_url: c.partnerUrl,
    partner_logo_url: c.partnerLogoUrl,
    promo_kicker: c.promoKicker,
    promo_headline: c.promoHeadline,
    promo_subline: c.promoSubline,
    promo_cta: c.promoCta,
    solo_settings: c.soloSettings,
    updated_at: new Date().toISOString(),
  };
  // Migration-order safety: these columns arrived after the base table
  // (20260802 logo, 20260812 promo text). If the DB doesn't have one yet, the
  // update fails naming the missing column — strip every not-yet-migrated
  // column the error names and retry, so everything else still saves.
  const OPTIONAL_COLUMNS = [
    'partner_logo_url', // 20260802_sponsor_age_gate.sql
    'promo_kicker', 'promo_headline', 'promo_subline', 'promo_cta', 'solo_settings', // 20260812_promo_text.sql
  ];
  let { error } = await supabase.from('contest_settings').update(payload).eq('id', 1);
  for (let retry = 0; error && retry < OPTIONAL_COLUMNS.length; retry++) {
    const missing = OPTIONAL_COLUMNS.filter(
      (col) => col in payload && error!.message.includes(col)
    );
    if (missing.length === 0) break;
    console.warn(
      `[contestService] column(s) missing: ${missing.join(', ')} — saving without (run the matching supabase/migrations SQL to enable)`
    );
    for (const col of missing) delete payload[col];
    ({ error } = await supabase.from('contest_settings').update(payload).eq('id', 1));
  }
  if (error) return error.message;
  cache = { ...c };
  fetchedAt = Date.now();
  return null;
}
