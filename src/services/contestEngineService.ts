// contestEngineService — Phase 1 of the contest engine: many concurrent,
// typed, admin-managed contests stored in public.contests, settled into
// public.contest_awards (migration 20260803_contest_engine.sql — the
// contract). Standings are computed CLIENT-SIDE from solutions/puzzles with
// bounded queries, mirroring the legacy fetchContestClaims approach.
//
// Anton runs migrations by hand, so every read degrades gracefully when the
// tables don't exist yet: public reads return [] (feature hidden), admin
// reads surface `missingTable` so the card can show a "run the migration"
// note. Nothing here throws at callers.

import { supabase } from '../lib/supabase';
import { CONTEST_CAPS } from '../constants/contest';
import { getUsernames } from './usernameService';

export type EngineContestType =
  | 'discovery'
  | 'new_puzzle_popularity'
  | 'solution_rush'
  | 'speed_trial';

export type EngineContestStatus = 'draft' | 'live' | 'ended' | 'settled';

export interface EngineContest {
  id: string;
  type: EngineContestType;
  title: string;
  message: string | null;
  /** Target puzzle for puzzle-scoped types; null for cross-puzzle types. */
  puzzleId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  prizeUsd: number;
  winnersCount: number;
  partnerName: string | null;
  partnerUrl: string | null;
  partnerLogoUrl: string | null;
  status: EngineContestStatus;
  /** Type-specific knobs: {palette} for speed_trial, {minSolvers} for
   *  new_puzzle_popularity. */
  params: Record<string, unknown>;
  createdAt: string;
}

export interface EngineAward {
  id: string;
  contestId: string;
  userId: string | null;
  solutionId: string | null;
  puzzleId: string | null;
  rank: number;
  amountUsd: number;
  note: string | null;
  awardedAt: string;
  paidAt: string | null;
}

const rowToContest = (r: any): EngineContest => ({
  id: r.id,
  type: r.type,
  title: r.title ?? '',
  message: r.message ?? null,
  puzzleId: r.puzzle_id ?? null,
  startsAt: r.starts_at ?? null,
  endsAt: r.ends_at ?? null,
  prizeUsd: Number(r.prize_usd ?? 0),
  winnersCount: Number(r.winners_count ?? 1),
  partnerName: r.partner_name ?? null,
  partnerUrl: r.partner_url ?? null,
  partnerLogoUrl: r.partner_logo_url ?? null,
  status: r.status,
  params: (r.params && typeof r.params === 'object' ? r.params : {}) as Record<string, unknown>,
  createdAt: r.created_at,
});

const contestToRow = (c: Partial<EngineContest>): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  if (c.type !== undefined) row.type = c.type;
  if (c.title !== undefined) row.title = c.title;
  if (c.message !== undefined) row.message = c.message;
  if (c.puzzleId !== undefined) row.puzzle_id = c.puzzleId;
  if (c.startsAt !== undefined) row.starts_at = c.startsAt;
  if (c.endsAt !== undefined) row.ends_at = c.endsAt;
  if (c.prizeUsd !== undefined) row.prize_usd = c.prizeUsd;
  if (c.winnersCount !== undefined) row.winners_count = c.winnersCount;
  if (c.partnerName !== undefined) row.partner_name = c.partnerName;
  if (c.partnerUrl !== undefined) row.partner_url = c.partnerUrl;
  if (c.partnerLogoUrl !== undefined) row.partner_logo_url = c.partnerLogoUrl;
  if (c.status !== undefined) row.status = c.status;
  if (c.params !== undefined) row.params = c.params;
  return row;
};

/** Pre-migration detector: relation missing / schema-cache miss. */
const isMissingTable = (message: string | undefined): boolean =>
  !!message && /does not exist|schema cache|not found/i.test(message);

/** Client-side mirror of the DB caps (same numbers as CONTEST_CAPS +
 *  20260803 check constraints). Returns null when valid. */
export function validateEngineContest(c: {
  type: EngineContestType;
  title: string;
  prizeUsd: number;
  winnersCount: number;
  puzzleId: string | null;
  startsAt: string | null;
  endsAt: string | null;
}): string | null {
  if (!c.title.trim()) return 'Give the contest a title.';
  if (c.winnersCount < 1 || c.winnersCount > CONTEST_CAPS.maxWinners)
    return `Winners must be 1–${CONTEST_CAPS.maxWinners}.`;
  if (c.prizeUsd < 0 || c.prizeUsd > CONTEST_CAPS.maxPrizeUsd)
    return `Prize must be $0 (no-prize promo) to $${CONTEST_CAPS.maxPrizeUsd}.`;
  if (c.prizeUsd * c.winnersCount > CONTEST_CAPS.maxTotalUsd)
    return `Total pool (${c.winnersCount} × $${c.prizeUsd} = $${c.prizeUsd * c.winnersCount}) exceeds the $${CONTEST_CAPS.maxTotalUsd} cap.`;
  if ((c.type === 'solution_rush' || c.type === 'speed_trial') && !c.puzzleId)
    return 'This contest type needs a target puzzle.';
  if (c.startsAt && c.endsAt && new Date(c.endsAt) <= new Date(c.startsAt))
    return 'End date must be after the start date.';
  return null;
}

/** Within the configured window right now (missing dates don't restrict). */
export function isWithinWindow(c: EngineContest, at = Date.now()): boolean {
  if (c.startsAt && new Date(c.startsAt).getTime() > at) return false;
  if (c.endsAt && new Date(c.endsAt).getTime() < at) return false;
  return true;
}

/** status='live' AND inside the window — what public surfaces show. */
export const isEngineContestLive = (c: EngineContest): boolean =>
  c.status === 'live' && isWithinWindow(c);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

// Short module cache for the PUBLIC read path (banner + home strip + /contests
// mount together) — same 60s policy as contestService.
let liveCache: EngineContest[] | null = null;
let liveFetchedAt = 0;
const CACHE_MS = 60_000;

/** Live contests for public surfaces (status='live', inside window). Cached
 *  60s; [] on any error (pre-migration → feature hidden). */
export async function fetchLiveContests(force = false): Promise<EngineContest[]> {
  if (!force && liveCache && Date.now() - liveFetchedAt < CACHE_MS) return liveCache;
  try {
    const { data, error } = await supabase
      .from('contests')
      .select('*')
      .eq('status', 'live')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error || !data) return liveCache ?? [];
    liveCache = (data as any[]).map(rowToContest).filter((c) => isWithinWindow(c));
    liveFetchedAt = Date.now();
    return liveCache;
  } catch {
    return liveCache ?? [];
  }
}

/** Live contests targeting a specific puzzle (viewer-page banner). */
export async function fetchLiveContestsForPuzzle(puzzleId: string): Promise<EngineContest[]> {
  const live = await fetchLiveContests();
  return live.filter((c) => c.puzzleId === puzzleId);
}

/** Recently finished contests (ended/settled) for the public /contests page.
 *  [] on any error. */
export async function fetchRecentlyEndedContests(days = 30): Promise<EngineContest[]> {
  try {
    const { data, error } = await supabase
      .from('contests')
      .select('*')
      .in('status', ['ended', 'settled'])
      .order('created_at', { ascending: false })
      .limit(50);
    if (error || !data) return [];
    const cutoff = Date.now() - days * 86_400_000;
    return (data as any[])
      .map(rowToContest)
      .filter((c) => new Date(c.endsAt ?? c.createdAt).getTime() >= cutoff);
  } catch {
    return [];
  }
}

export interface ListContestsResult {
  contests: EngineContest[];
  /** True when the contests table doesn't exist yet (run the migration). */
  missingTable: boolean;
  error: string | null;
}

/** Admin: ALL contests, newest first. Surfaces the pre-migration state. */
export async function listContests(): Promise<ListContestsResult> {
  try {
    const { data, error } = await supabase
      .from('contests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      return { contests: [], missingTable: isMissingTable(error.message), error: error.message };
    }
    return { contests: (data as any[]).map(rowToContest), missingTable: false, error: null };
  } catch (e: any) {
    return { contests: [], missingTable: isMissingTable(e?.message), error: e?.message ?? String(e) };
  }
}

// ---------------------------------------------------------------------------
// Admin writes (RLS: is_admin() only). All return an error string or null.
// ---------------------------------------------------------------------------

const invalidateLiveCache = () => {
  liveCache = null;
  liveFetchedAt = 0;
};

export interface EngineContestInput {
  type: EngineContestType;
  title: string;
  message: string | null;
  puzzleId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  prizeUsd: number;
  winnersCount: number;
  partnerName: string | null;
  partnerUrl: string | null;
  partnerLogoUrl: string | null;
  params: Record<string, unknown>;
}

export async function createContest(input: EngineContestInput): Promise<string | null> {
  const invalid = validateEngineContest(input);
  if (invalid) return invalid;
  try {
    const { error } = await supabase.from('contests').insert([contestToRow(input)]);
    if (error) return error.message;
    invalidateLiveCache();
    return null;
  } catch (e: any) {
    return e?.message ?? String(e);
  }
}

export async function updateContest(
  id: string,
  patch: Partial<EngineContest>
): Promise<string | null> {
  try {
    const { error } = await supabase.from('contests').update(contestToRow(patch)).eq('id', id);
    if (error) return error.message;
    invalidateLiveCache();
    return null;
  } catch (e: any) {
    return e?.message ?? String(e);
  }
}

export async function deleteContest(id: string): Promise<string | null> {
  try {
    const { error } = await supabase.from('contests').delete().eq('id', id);
    if (error) return error.message;
    invalidateLiveCache();
    return null;
  } catch (e: any) {
    return e?.message ?? String(e);
  }
}

/** One winner slot handed to settleContest, in rank order. */
export interface SettleWinner {
  userId: string | null;
  solutionId?: string | null;
  puzzleId?: string | null;
  note?: string | null;
}

/** Writes one contest_awards row per winner (rank = position, amount =
 *  prize_usd each) and flips the contest to 'settled'. */
export async function settleContest(
  contest: EngineContest,
  winners: SettleWinner[]
): Promise<string | null> {
  if (winners.length === 0) return 'No winners to settle.';
  try {
    const rows = winners.map((w, i) => ({
      contest_id: contest.id,
      user_id: w.userId,
      solution_id: w.solutionId ?? null,
      puzzle_id: w.puzzleId ?? contest.puzzleId,
      rank: i + 1,
      amount_usd: contest.prizeUsd,
      note: w.note ?? null,
    }));
    const { error: awardErr } = await supabase.from('contest_awards').insert(rows);
    if (awardErr) return awardErr.message;
    const { error: statusErr } = await supabase
      .from('contests')
      .update({ status: 'settled' })
      .eq('id', contest.id);
    if (statusErr) return statusErr.message;
    invalidateLiveCache();
    return null;
  } catch (e: any) {
    return e?.message ?? String(e);
  }
}

/** Awards for a contest, rank order. [] on any error (RLS lets users see
 *  only their own — public callers just get an empty list). */
export async function listAwards(contestId: string): Promise<EngineAward[]> {
  try {
    const { data, error } = await supabase
      .from('contest_awards')
      .select('*')
      .eq('contest_id', contestId)
      .order('rank', { ascending: true });
    if (error || !data) return [];
    return (data as any[]).map((r) => ({
      id: r.id,
      contestId: r.contest_id,
      userId: r.user_id ?? null,
      solutionId: r.solution_id ?? null,
      puzzleId: r.puzzle_id ?? null,
      rank: Number(r.rank ?? 1),
      amountUsd: Number(r.amount_usd ?? 0),
      note: r.note ?? null,
      awardedAt: r.awarded_at,
      paidAt: r.paid_at ?? null,
    }));
  } catch {
    return [];
  }
}

/** Toggle the paid ledger on one award (mirrors contest_payouts semantics). */
export async function setAwardPaid(awardId: string, paid: boolean): Promise<string | null> {
  try {
    const { error } = await supabase
      .from('contest_awards')
      .update({ paid_at: paid ? new Date().toISOString() : null })
      .eq('id', awardId);
    return error ? error.message : null;
  } catch (e: any) {
    return e?.message ?? String(e);
  }
}

// ---------------------------------------------------------------------------
// Standings — client-side, bounded queries, top-10. Only manual solves by
// signed-in users count (created_by not null). Each returns display-ready
// entries with usernames resolved in ONE getUsernames batch.
// ---------------------------------------------------------------------------

export interface StandingsResult<T> {
  entries: T[];
  computedAt: string;
}

const TOP_N = 10;
const emptyStandings = <T>(): StandingsResult<T> => ({
  entries: [],
  computedAt: new Date().toISOString(),
});

export interface PopularityEntry {
  puzzleId: string;
  puzzleName: string;
  /** The winner — the puzzle's creator. */
  creatorUserId: string;
  creatorName: string;
  distinctSolvers: number;
  /** False when below the contest's minSolvers threshold (still listed). */
  eligible: boolean;
}

/** new_puzzle_popularity: puzzles created inside the window, ranked by
 *  distinct signed-in solvers (creator's own solves excluded). */
export async function standingsNewPuzzlePopularity(
  contest: EngineContest
): Promise<StandingsResult<PopularityEntry>> {
  try {
    let pq = supabase
      .from('puzzles')
      .select('id, name, created_by, created_at')
      .not('created_by', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (contest.startsAt) pq = pq.gte('created_at', contest.startsAt);
    if (contest.endsAt) pq = pq.lte('created_at', contest.endsAt);
    const { data: puzzles, error: pErr } = await pq;
    if (pErr || !puzzles || puzzles.length === 0) return emptyStandings();

    const ids = (puzzles as any[]).map((p) => p.id);
    let sq = supabase
      .from('solutions')
      .select('puzzle_id, created_by, created_at, solution_type')
      .in('puzzle_id', ids)
      .not('created_by', 'is', null)
      .eq('solution_type', 'manual')
      .limit(5000);
    if (contest.startsAt) sq = sq.gte('created_at', contest.startsAt);
    if (contest.endsAt) sq = sq.lte('created_at', contest.endsAt);
    const { data: solutions, error: sErr } = await sq;
    if (sErr) return emptyStandings();

    const byPuzzle = new Map<string, { creator: string; name: string; createdAt: string }>();
    for (const p of puzzles as any[]) {
      byPuzzle.set(p.id, { creator: p.created_by, name: p.name ?? 'Untitled', createdAt: p.created_at });
    }
    const solvers = new Map<string, Set<string>>();
    for (const s of (solutions ?? []) as any[]) {
      const meta = byPuzzle.get(s.puzzle_id);
      if (!meta || s.created_by === meta.creator) continue; // creator can't solve their own into a win
      let set = solvers.get(s.puzzle_id);
      if (!set) solvers.set(s.puzzle_id, (set = new Set()));
      set.add(s.created_by);
    }

    const minSolvers = Number((contest.params as any)?.minSolvers ?? 0) || 0;
    const ranked = [...byPuzzle.entries()]
      .map(([puzzleId, meta]) => ({
        puzzleId,
        puzzleName: meta.name,
        creatorUserId: meta.creator,
        distinctSolvers: solvers.get(puzzleId)?.size ?? 0,
        createdAt: meta.createdAt,
      }))
      .sort(
        (a, b) =>
          b.distinctSolvers - a.distinctSolvers || a.createdAt.localeCompare(b.createdAt)
      )
      .slice(0, TOP_N);

    const names = await getUsernames(ranked.map((e) => e.creatorUserId));
    return {
      entries: ranked.map((e) => ({
        puzzleId: e.puzzleId,
        puzzleName: e.puzzleName,
        creatorUserId: e.creatorUserId,
        creatorName: names.get(e.creatorUserId) ?? 'Anonymous',
        distinctSolvers: e.distinctSolvers,
        eligible: e.distinctSolvers >= minSolvers,
      })),
      computedAt: new Date().toISOString(),
    };
  } catch {
    return emptyStandings();
  }
}

export interface RushEntry {
  userId: string;
  userName: string;
  discoveries: number;
  lastDiscoveryAt: string;
  /** Their most recent counted discovery — context for settlement. */
  lastSolutionId: string;
}

/** solution_rush: most first-EVER discoveries on the target puzzle inside the
 *  window. A signature's discoverer is whoever saved it first ALL-TIME (any
 *  solve type blocks novelty — same rule as the legacy challenge); it only
 *  scores if that first save is a manual, signed-in solve inside the window. */
export async function standingsSolutionRush(
  contest: EngineContest
): Promise<StandingsResult<RushEntry>> {
  if (!contest.puzzleId) return emptyStandings();
  try {
    const { data, error } = await supabase
      .from('solutions')
      .select('id, signature, created_by, solver_name, created_at, solution_type')
      .eq('puzzle_id', contest.puzzleId)
      .not('signature', 'is', null)
      .order('created_at', { ascending: true })
      .limit(5000);
    if (error || !data) return emptyStandings();

    const inWindow = (iso: string) =>
      (!contest.startsAt || iso >= contest.startsAt) &&
      (!contest.endsAt || iso <= contest.endsAt);

    const seen = new Set<string>();
    const byUser = new Map<string, { count: number; lastAt: string; lastId: string }>();
    for (const s of data as any[]) {
      const sig = s.signature as string;
      const isFirstEver = !seen.has(sig);
      seen.add(sig);
      if (!isFirstEver) continue;
      if (s.solution_type !== 'manual' || !s.created_by || !inWindow(s.created_at)) continue;
      const cur = byUser.get(s.created_by);
      if (cur) {
        cur.count += 1;
        cur.lastAt = s.created_at;
        cur.lastId = s.id;
      } else {
        byUser.set(s.created_by, { count: 1, lastAt: s.created_at, lastId: s.id });
      }
    }

    // Most discoveries wins; ties go to whoever REACHED that count first
    // (earlier last-counted-discovery timestamp).
    const ranked = [...byUser.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[1].lastAt.localeCompare(b[1].lastAt))
      .slice(0, TOP_N);

    const names = await getUsernames(ranked.map(([id]) => id));
    return {
      entries: ranked.map(([userId, v]) => ({
        userId,
        userName: names.get(userId) ?? 'Anonymous',
        discoveries: v.count,
        lastDiscoveryAt: v.lastAt,
        lastSolutionId: v.lastId,
      })),
      computedAt: new Date().toISOString(),
    };
  } catch {
    return emptyStandings();
  }
}

export interface SpeedEntry {
  userId: string;
  userName: string;
  durationMs: number;
  solutionId: string;
}

/** speed_trial: fastest manual solve per signed-in user on the target puzzle
 *  inside the window, on the contest's palette (params.palette, default
 *  'classic'; rows with piece_set null count as classic). */
export async function standingsSpeedTrial(
  contest: EngineContest
): Promise<StandingsResult<SpeedEntry>> {
  if (!contest.puzzleId) return emptyStandings();
  try {
    const palette = String((contest.params as any)?.palette ?? 'classic') || 'classic';
    let q = supabase
      .from('solutions')
      .select('id, created_by, solver_name, created_at, duration_ms, piece_set, solution_type')
      .eq('puzzle_id', contest.puzzleId)
      .eq('solution_type', 'manual')
      .not('created_by', 'is', null)
      .not('duration_ms', 'is', null)
      .order('created_at', { ascending: true })
      .limit(5000);
    if (contest.startsAt) q = q.gte('created_at', contest.startsAt);
    if (contest.endsAt) q = q.lte('created_at', contest.endsAt);
    const { data, error } = await q;
    if (error || !data) return emptyStandings();

    const best = new Map<string, { durationMs: number; solutionId: string }>();
    for (const s of data as any[]) {
      if ((s.piece_set ?? 'classic') !== palette) continue;
      const d = Number(s.duration_ms);
      if (!Number.isFinite(d) || d <= 0) continue;
      const cur = best.get(s.created_by);
      // Strictly-better only — rows arrive created_at asc, so on a duration
      // tie the earlier solve keeps the spot.
      if (!cur || d < cur.durationMs) best.set(s.created_by, { durationMs: d, solutionId: s.id });
    }

    const ranked = [...best.entries()]
      .sort((a, b) => a[1].durationMs - b[1].durationMs)
      .slice(0, TOP_N);

    const names = await getUsernames(ranked.map(([id]) => id));
    return {
      entries: ranked.map(([userId, v]) => ({
        userId,
        userName: names.get(userId) ?? 'Anonymous',
        durationMs: v.durationMs,
        solutionId: v.solutionId,
      })),
      computedAt: new Date().toISOString(),
    };
  } catch {
    return emptyStandings();
  }
}
