import { supabase } from '../lib/supabase';

export type LeaderboardEntry = {
  id: string;
  created_by: string | null;
  solver_name: string | null;
  puzzle_id: string;
  duration_ms: number | null;
  total_moves: number | null;
  undo_count: number | null;
  hints_used: number | null;
  solvability_checks_used: number | null;
  placements_by_you: number | null;
  total_pieces: number | null;
  created_at: string;
};

/** Better result first — MUST match solveRankService's ordering so the board
 *  always agrees with the "#2/7" rank slice shown after a solve. */
function better(a: LeaderboardEntry, b: LeaderboardEntry): number {
  const ap = a.placements_by_you;
  const bp = b.placements_by_you;
  if (ap != null && bp != null && ap !== bp) return bp - ap;
  if ((ap != null) !== (bp != null)) return ap != null ? -1 : 1;
  const ad = a.duration_ms;
  const bd = b.duration_ms;
  if (ad != null && bd != null && ad !== bd) return ad - bd;
  if ((ad != null) !== (bd != null)) return ad != null ? -1 : 1;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

const solverKey = (e: LeaderboardEntry): string =>
  e.created_by ?? e.solver_name ?? e.id;

export async function getFastestSolutionsForPuzzle(
  puzzleId: string,
  limit = 50
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('solutions')
    .select(
      `
      id,
      created_by,
      solver_name,
      puzzle_id,
      duration_ms,
      total_moves,
      undo_count,
      hints_used,
      solvability_checks_used,
      placements_by_you,
      total_pieces,
      created_at
      `
    )
    .eq('puzzle_id', puzzleId)
    // Human solves only — auto-solver runs don't compete.
    .eq('solution_type', 'manual')
    .not('duration_ms', 'is', null)
    .order('placements_by_you', { ascending: false, nullsFirst: false })
    .order('duration_ms', { ascending: true })
    .limit(500);

  if (error) {
    console.error('❌ Error loading leaderboard:', error);
    return [];
  }

  // One row per solver (their best) — a grinder replaying must not fill the
  // whole board, and the ranking must match solveRankService exactly.
  const bestBySolver = new Map<string, LeaderboardEntry>();
  for (const e of (data ?? []) as LeaderboardEntry[]) {
    const k = solverKey(e);
    const prev = bestBySolver.get(k);
    if (!prev || better(e, prev) < 0) bestBySolver.set(k, e);
  }
  return Array.from(bestBySolver.values()).sort(better).slice(0, limit);
}
