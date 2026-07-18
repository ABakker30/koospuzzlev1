import { supabase } from '../lib/supabase';
import { betterForPalette } from './solveRankService';

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
  duplicate_count?: number | null;
  created_at: string;
};

const solverKey = (e: LeaderboardEntry): string =>
  e.created_by ?? e.solver_name ?? e.id;

const ENTRY_COLS = `
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
`;

function dedupeAndRank(rows: LeaderboardEntry[], palette: string, limit: number): LeaderboardEntry[] {
  // One row per solver (their best) — a grinder replaying must not fill the
  // whole board, and the ordering MUST match solveRankService exactly.
  const better = betterForPalette(palette);
  const bestBySolver = new Map<string, LeaderboardEntry>();
  for (const e of rows) {
    const k = solverKey(e);
    const prev = bestBySolver.get(k);
    if (!prev || better(e, prev) < 0) bestBySolver.set(k, e);
  }
  return Array.from(bestBySolver.values()).sort(better).slice(0, limit);
}

/**
 * Leaderboard for one (puzzle × palette) board. Every palette is its own
 * board: 'classic' (the canonical ranked surface), 'free' (ranked by fewest
 * duplicates first), and any 'only:D+Y' piece-set challenge.
 */
export async function getFastestSolutionsForPuzzle(
  puzzleId: string,
  palette: string = 'classic',
  limit = 50
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('solutions')
    .select(`${ENTRY_COLS}, duplicate_count`)
    .eq('puzzle_id', puzzleId)
    // Human solves only — auto-solver runs don't compete.
    .eq('solution_type', 'manual')
    .eq('piece_set', palette)
    .not('duration_ms', 'is', null)
    .limit(500);

  if (error) {
    // Migration-order safety: before 20260727_piece_palettes.sql runs, the
    // columns don't exist — Classic falls back to the piece_mode key
    // (and before 20260721, to the unfiltered all-Classic query).
    if (/piece_set|duplicate_count/.test(error.message)) {
      if (palette !== 'classic') return [];
      let { data: legacy, error: lErr } = await supabase
        .from('solutions')
        .select(ENTRY_COLS)
        .eq('puzzle_id', puzzleId)
        .eq('solution_type', 'manual')
        .eq('piece_mode', 'unique')
        .not('duration_ms', 'is', null)
        .limit(500);
      if (lErr && /piece_mode/.test(lErr.message)) {
        ({ data: legacy } = await supabase
          .from('solutions')
          .select(ENTRY_COLS)
          .eq('puzzle_id', puzzleId)
          .eq('solution_type', 'manual')
          .not('duration_ms', 'is', null)
          .limit(500));
      }
      return dedupeAndRank((legacy ?? []) as LeaderboardEntry[], palette, limit);
    }
    console.error('❌ Error loading leaderboard:', error);
    return [];
  }

  return dedupeAndRank((data ?? []) as LeaderboardEntry[], palette, limit);
}

export type PaletteBoard = { palette: string; solves: number };

/**
 * Which palette boards exist for this puzzle (have at least one human solve),
 * with Classic and Free always listed first (even when still empty — they are
 * the standing challenges).
 */
export async function listPuzzlePalettes(puzzleId: string): Promise<PaletteBoard[]> {
  const counts = new Map<string, number>([
    ['classic', 0],
    ['free', 0],
  ]);
  const { data, error } = await supabase
    .from('solutions')
    .select('piece_set')
    .eq('puzzle_id', puzzleId)
    .eq('solution_type', 'manual')
    .not('duration_ms', 'is', null)
    .limit(1000);
  if (!error) {
    for (const row of (data ?? []) as Array<{ piece_set: string | null }>) {
      const p = row.piece_set ?? 'classic';
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  const fixed: PaletteBoard[] = [
    { palette: 'classic', solves: counts.get('classic') ?? 0 },
    { palette: 'free', solves: counts.get('free') ?? 0 },
  ];
  const sets = Array.from(counts.entries())
    .filter(([p]) => p !== 'classic' && p !== 'free')
    .map(([palette, solves]) => ({ palette, solves }))
    .sort((a, b) => b.solves - a.solves || a.palette.localeCompare(b.palette));
  return [...fixed, ...sets];
}
