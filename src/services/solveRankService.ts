// solveRankService — picks "the most motivating slice" for a solve, per the
// launch strategy: surface ONE rank a viewer could plausibly beat, never the
// leaderboard machinery. Ladder (docs/launch-runway.md):
//   1. First-ever human solve of this puzzle+palette → "First ever …"
//   2. Top-3 among ≥2 solvers on this puzzle+palette → "#2 of 7 …"
//   3. Otherwise null — callers fall back to the existing X/N · time framing.
//
// Palettes (20260727): every (puzzle × palette) pair is its own board, so a
// solve ranks against its OWN palette — Classic vs Classic, "only D+Y" vs
// "only D+Y". Free Pieces ranks by fewest duplicates first, then the shared
// placements-desc / time-asc ordering (must match leaderboardService).

import { supabase } from '../lib/supabase';
import { paletteLabel } from '../utils/piecePalette';

export interface SolveRank {
  /** Ready-to-display slice, e.g. "First ever to solve this puzzle". */
  label: string;
  /** Short form for captions, e.g. "First ever" / "#2 of 7". */
  short: string;
  rank: number;
  totalSolvers: number;
  firstEver: boolean;
  /** Palette this rank applies to: 'classic' | 'free' | 'only:D+Y'. */
  palette: string;
}

type Row = {
  id: string;
  created_at: string;
  created_by: string | null;
  solver_name: string | null;
  placements_by_you: number | null;
  duration_ms: number | null;
  duplicate_count?: number | null;
};

/** Better result first. Free palette: fewest duplicates leads; then the
 *  shared placements-desc (nulls last) / time-asc (nulls last) ordering. */
export function betterForPalette(palette: string) {
  return (a: Row, b: Row): number => {
    if (palette === 'free') {
      const adup = a.duplicate_count;
      const bdup = b.duplicate_count;
      if (adup != null && bdup != null && adup !== bdup) return adup - bdup;
      if ((adup != null) !== (bdup != null)) return adup != null ? -1 : 1;
    }
    const ap = a.placements_by_you;
    const bp = b.placements_by_you;
    if (ap != null && bp != null && ap !== bp) return bp - ap;
    if ((ap != null) !== (bp != null)) return ap != null ? -1 : 1;
    const ad = a.duration_ms;
    const bd = b.duration_ms;
    if (ad != null && bd != null && ad !== bd) return ad - bd;
    if ((ad != null) !== (bd != null)) return ad != null ? -1 : 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  };
}

const solverKey = (r: Row): string => r.created_by ?? r.solver_name ?? r.id;

/**
 * Compute the motivating rank slice for a saved solution, within its own
 * palette. Returns null when no slice clears the bar.
 */
export async function getSolveRank(solutionId: string): Promise<SolveRank | null> {
  try {
    let { data: target, error: tErr } = await supabase
      .from('solutions')
      .select('id, puzzle_id, created_at, created_by, solver_name, placements_by_you, duration_ms, piece_set, duplicate_count')
      .eq('id', solutionId)
      .maybeSingle();
    // Migration-order safety: retry without the palette columns if absent.
    if (tErr && /piece_set|duplicate_count/.test(tErr.message)) {
      ({ data: target } = await supabase
        .from('solutions')
        .select('id, puzzle_id, created_at, created_by, solver_name, placements_by_you, duration_ms')
        .eq('id', solutionId)
        .maybeSingle());
    }
    if (!target) return null;
    const palette: string = (target as any).piece_set ?? 'classic';

    let { data: rows, error: rErr } = await supabase
      .from('solutions')
      .select('id, created_at, created_by, solver_name, placements_by_you, duration_ms, duplicate_count')
      .eq('puzzle_id', target.puzzle_id)
      .eq('solution_type', 'manual')
      .eq('piece_set', palette)
      .limit(1000);
    if (rErr && /piece_set|duplicate_count/.test(rErr.message)) {
      // Pre-palette fallback: rank Classic solves via the old piece_mode key.
      if (palette !== 'classic') return null;
      const legacy = await supabase
        .from('solutions')
        .select('id, created_at, created_by, solver_name, placements_by_you, duration_ms')
        .eq('puzzle_id', target.puzzle_id)
        .eq('solution_type', 'manual')
        .eq('piece_mode', 'unique')
        .limit(1000);
      rows = (legacy.data ?? []) as typeof rows;
    }
    if (!rows || rows.length === 0) return null;

    const targetAt = new Date(target.created_at).getTime();
    const firstEver = !rows.some(
      (r) => r.id !== target.id && new Date(r.created_at).getTime() < targetAt
    );

    // Best result per solver, then rank the target's solver.
    const better = betterForPalette(palette);
    const bestBySolver = new Map<string, Row>();
    for (const r of rows as Row[]) {
      const k = solverKey(r);
      const prev = bestBySolver.get(k);
      if (!prev || better(r, prev) < 0) bestBySolver.set(k, r);
    }
    const ranked = Array.from(bestBySolver.values()).sort(better);
    const myKey = solverKey(target as Row);
    const rank = ranked.findIndex((r) => solverKey(r) === myKey) + 1;
    const totalSolvers = ranked.length;

    if (firstEver) {
      // Honest founding claim: a non-Classic first is first on its BOARD
      // (this puzzle × palette), not first on the puzzle.
      return {
        label:
          palette === 'classic'
            ? 'First ever to solve this puzzle'
            : `First ever on the ${paletteLabel(palette)} board`,
        short: 'First ever',
        rank: rank || 1,
        totalSolvers,
        firstEver: true,
        palette,
      };
    }
    if (rank >= 1 && rank <= 3 && totalSolvers >= 2) {
      return {
        label: `#${rank}/${totalSolvers} on this puzzle`,
        // Language-neutral "#1/7" — interpolated into translated sentences.
        short: `#${rank}/${totalSolvers}`,
        rank,
        totalSolvers,
        firstEver: false,
        palette,
      };
    }
    return null;
  } catch {
    return null; // rank is a bonus — never block the share flow on it
  }
}
