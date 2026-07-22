// contestService — the Discovery Challenge config, read from the single-row
// contest_settings table (managed by Anton in /admin). Short cache so the
// banner/rules pages don't refetch on every mount. Caps live in
// constants/contest.ts and are ALSO enforced by DB check constraints.

import { supabase } from '../lib/supabase';
import { CONTEST_CAPS } from '../constants/contest';

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
};

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
    // select('*') tolerates the column missing pre-migration → stays null.
    partnerLogoUrl: data.partner_logo_url ?? null,
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
    updated_at: new Date().toISOString(),
  };
  let { error } = await supabase.from('contest_settings').update(payload).eq('id', 1);
  // Migration-order safety: if the partner_logo_url column doesn't exist yet,
  // save everything else (run 20260802_sponsor_age_gate.sql to enable logos).
  if (error && /partner_logo_url/.test(error.message)) {
    console.warn('[contestService] partner_logo_url column missing — saving without (run 20260802_sponsor_age_gate.sql)');
    const { partner_logo_url, ...noLogo } = payload;
    ({ error } = await supabase.from('contest_settings').update(noLogo).eq('id', 1));
  }
  if (error) return error.message;
  cache = { ...c };
  fetchedAt = Date.now();
  return null;
}
