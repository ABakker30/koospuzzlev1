// boardAnalysisService — shared "(puzzle × palette) board" standings for the
// signed-in user: which boards they currently lead (thrones on Home) and
// where a later solve knocked them off #1 (dethroneService). One bounded
// batch of queries, computed at most once per session (sessionStorage), so
// both Home surfaces ride the same data.
//
// Ordering matches leaderboardService/solveRankService exactly
// (betterForPalette), and rows are duration-filtered like the leaderboard
// page — a "throne" here is always visible as #1 on /leaderboards.

import { supabase } from '../lib/supabase';
import { betterForPalette } from './solveRankService';

export interface BoardStanding {
  puzzleId: string;
  puzzleName: string;
  /** Palette signature: 'classic' | 'free' | 'only:D+Y'. */
  palette: string;
  /** The user's current rank among solvers on this board (1-based). */
  myRank: number;
  totalSolvers: number;
  /** The board's current #1 solve. */
  leaderSolutionId: string;
  leaderUserId: string | null;
  /** Denormalized fallback name — resolve live via usernameService. */
  leaderStoredName: string | null;
  leaderSolvedAt: string;
  /** True when the user held #1 until a later solve overtook them. */
  wasDethroned: boolean;
}

type Row = {
  id: string;
  puzzle_id: string;
  piece_set?: string | null;
  created_at: string;
  created_by: string | null;
  solver_name: string | null;
  placements_by_you: number | null;
  duration_ms: number | null;
  duplicate_count?: number | null;
};

const ROW_COLS =
  'id, puzzle_id, piece_set, created_at, created_by, solver_name, placements_by_you, duration_ms, duplicate_count';

/** At most this many boards analyzed per user — bounds the batch query. */
const MAX_BOARDS = 20;

const solverKey = (r: Row): string => r.created_by ?? r.solver_name ?? r.id;
const boardKey = (puzzleId: string, palette: string) => `${puzzleId}::${palette}`;
const cacheKey = (userId: string) => `boardStandings:v1:${userId}`;

/** Best row per solver, ranked best-first (the leaderboard's dedupe). */
function rankSolvers(rows: Row[], palette: string): Row[] {
  const better = betterForPalette(palette);
  const bestBySolver = new Map<string, Row>();
  for (const r of rows) {
    const k = solverKey(r);
    const prev = bestBySolver.get(k);
    if (!prev || better(r, prev) < 0) bestBySolver.set(k, r);
  }
  return Array.from(bestBySolver.values()).sort(better);
}

// In-memory dedupe: thrones strip + dethrone banner mount together on Home.
let inflight: { userId: string; promise: Promise<BoardStanding[]> } | null = null;

/**
 * Analyze every board the user has ranked solves on (capped at MAX_BOARDS,
 * most recently played first). Cached per session; [] on any error — these
 * are bonus surfaces, never blockers.
 */
export function analyzeUserBoards(userId: string): Promise<BoardStanding[]> {
  try {
    const cached = sessionStorage.getItem(cacheKey(userId));
    if (cached) return Promise.resolve(JSON.parse(cached) as BoardStanding[]);
  } catch {
    /* storage unavailable — compute fresh */
  }
  if (inflight && inflight.userId === userId) return inflight.promise;
  const promise = computeUserBoards(userId).then((standings) => {
    try {
      sessionStorage.setItem(cacheKey(userId), JSON.stringify(standings));
    } catch {
      /* storage unavailable */
    }
    return standings;
  });
  inflight = { userId, promise };
  return promise;
}

/** Boards the user currently leads. */
export async function getUserThrones(userId: string): Promise<BoardStanding[]> {
  const standings = await analyzeUserBoards(userId);
  return standings.filter((s) => s.myRank === 1);
}

async function computeUserBoards(userId: string): Promise<BoardStanding[]> {
  try {
    // 1. My ranked solves → my best per (puzzle × palette) board.
    const { data: mine, error: mineErr } = await supabase
      .from('solutions')
      .select(ROW_COLS)
      .eq('created_by', userId)
      .eq('solution_type', 'manual')
      .not('duration_ms', 'is', null)
      .limit(400);
    // Pre-palette-migration DBs have no piece_set — skip quietly.
    if (mineErr || !mine || mine.length === 0) return [];

    const myBest = new Map<string, Row>();
    for (const r of mine as Row[]) {
      const palette = r.piece_set ?? 'classic';
      const k = boardKey(r.puzzle_id, palette);
      const prev = myBest.get(k);
      if (!prev || betterForPalette(palette)(r, prev) < 0) myBest.set(k, r);
    }
    // Most recently played boards first; cap the work.
    const boards = Array.from(myBest.entries())
      .sort(
        (a, b) =>
          new Date(b[1].created_at).getTime() - new Date(a[1].created_at).getTime()
      )
      .slice(0, MAX_BOARDS);
    const puzzleIds = [...new Set(boards.map(([, r]) => r.puzzle_id))];
    if (puzzleIds.length === 0) return [];

    // 2. Everyone's ranked solves on those puzzles, one batched query.
    const { data: all, error: allErr } = await supabase
      .from('solutions')
      .select(ROW_COLS)
      .in('puzzle_id', puzzleIds)
      .eq('solution_type', 'manual')
      .not('duration_ms', 'is', null)
      .limit(2000);
    if (allErr || !all) return [];
    const rowsByBoard = new Map<string, Row[]>();
    for (const r of all as Row[]) {
      const k = boardKey(r.puzzle_id, r.piece_set ?? 'classic');
      const arr = rowsByBoard.get(k) ?? [];
      arr.push(r);
      rowsByBoard.set(k, arr);
    }

    // 3. Puzzle names, batched.
    const names = new Map<string, string>();
    const { data: puzzles } = await supabase
      .from('puzzles')
      .select('id, name')
      .in('id', puzzleIds);
    for (const p of (puzzles ?? []) as Array<{ id: string; name: string }>) {
      names.set(p.id, p.name);
    }

    // 4. Standings per board.
    const standings: BoardStanding[] = [];
    for (const [key, best] of boards) {
      const palette = best.piece_set ?? 'classic';
      const rows = rowsByBoard.get(key) ?? [];
      if (rows.length === 0) continue;
      const ranked = rankSolvers(rows, palette);
      const myRank = ranked.findIndex((r) => solverKey(r) === userId) + 1;
      if (myRank === 0) continue; // my rows fell outside the batch — skip
      const leader = ranked[0];

      // Dethroned = not #1 now, but #1 among solves up to my best's time
      // (i.e. a LATER solve overtook me).
      let wasDethroned = false;
      if (myRank > 1) {
        const cutoff = new Date(best.created_at).getTime();
        const earlier = rows.filter(
          (r) => new Date(r.created_at).getTime() <= cutoff
        );
        const rankedEarlier = rankSolvers(earlier, palette);
        wasDethroned =
          rankedEarlier.length > 0 && solverKey(rankedEarlier[0]) === userId;
      }

      standings.push({
        puzzleId: best.puzzle_id,
        puzzleName: names.get(best.puzzle_id) ?? '?',
        palette,
        myRank,
        totalSolvers: ranked.length,
        leaderSolutionId: leader.id,
        leaderUserId: leader.created_by,
        leaderStoredName: leader.solver_name,
        leaderSolvedAt: leader.created_at,
        wasDethroned,
      });
    }
    return standings;
  } catch {
    return [];
  }
}
