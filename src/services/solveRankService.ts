// solveRankService — picks "the most motivating slice" for a solve, per the
// launch strategy: surface ONE rank a viewer could plausibly beat, never the
// leaderboard machinery. Ladder (docs/launch-runway.md):
//   1. First-ever human solve of this puzzle  → "First ever to solve this puzzle"
//   2. Top-3 among ≥2 solvers on this puzzle  → "#2 of 7 on this puzzle"
//   3. Otherwise null — callers fall back to the existing X/N · time framing.
//
// Ranking mirrors judgeChallenge: self-placements (X/N) decide, ties break to
// time. Only manual (human) solves count; one best entry per solver. No geo
// slices at launch — see the runway doc for why.

import { supabase } from '../lib/supabase';

export interface SolveRank {
  /** Ready-to-display slice, e.g. "First ever to solve this puzzle". */
  label: string;
  /** Short form for captions, e.g. "First ever" / "#2 of 7". */
  short: string;
  rank: number;
  totalSolvers: number;
  firstEver: boolean;
}

type Row = {
  id: string;
  created_at: string;
  created_by: string | null;
  solver_name: string | null;
  placements_by_you: number | null;
  duration_ms: number | null;
};

/** Better result first: placements desc (nulls last), then time asc (nulls last). */
function better(a: Row, b: Row): number {
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

const solverKey = (r: Row): string => r.created_by ?? r.solver_name ?? r.id;

/**
 * Compute the motivating rank slice for a saved solution.
 * Returns null when no slice clears the bar (callers keep their fallback).
 */
export async function getSolveRank(solutionId: string): Promise<SolveRank | null> {
  try {
    let { data: target, error: tErr } = await supabase
      .from('solutions')
      .select('id, puzzle_id, created_at, created_by, solver_name, placements_by_you, duration_ms, piece_mode')
      .eq('id', solutionId)
      .maybeSingle();
    // Migration-order safety: retry without piece_mode if the column is absent.
    if (tErr && /piece_mode/.test(tErr.message)) {
      ({ data: target } = await supabase
        .from('solutions')
        .select('id, puzzle_id, created_at, created_by, solver_name, placements_by_you, duration_ms')
        .eq('id', solutionId)
        .maybeSingle());
    }
    if (!target) return null;
    // Ranks are Classic-only — a Free Pieces / One Piece solve gets no slice.
    if ((target as any).piece_mode && (target as any).piece_mode !== 'unique') return null;

    let { data: rows, error: rErr } = await supabase
      .from('solutions')
      .select('id, created_at, created_by, solver_name, placements_by_you, duration_ms')
      .eq('puzzle_id', target.puzzle_id)
      .eq('solution_type', 'manual')
      .eq('piece_mode', 'unique')
      .limit(1000);
    if (rErr && /piece_mode/.test(rErr.message)) {
      ({ data: rows } = await supabase
        .from('solutions')
        .select('id, created_at, created_by, solver_name, placements_by_you, duration_ms')
        .eq('puzzle_id', target.puzzle_id)
        .eq('solution_type', 'manual')
        .limit(1000));
    }
    if (!rows || rows.length === 0) return null;

    const targetAt = new Date(target.created_at).getTime();
    const firstEver = !rows.some(
      (r) => r.id !== target.id && new Date(r.created_at).getTime() < targetAt
    );

    // Best result per solver, then rank the target's solver.
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
      return {
        label: 'First ever to solve this puzzle',
        short: 'First ever',
        rank: rank || 1,
        totalSolvers,
        firstEver: true,
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
      };
    }
    return null;
  } catch {
    return null; // rank is a bonus — never block the share flow on it
  }
}
