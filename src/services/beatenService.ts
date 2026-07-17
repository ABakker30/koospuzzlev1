// beatenService — "someone beat your best" detection, the comeback trigger.
// For the signed-in user: on puzzles where they have a ranked (manual,
// Classic) solve, find newer solves by OTHERS that outrank their best.
// Ordering matches leaderboardService/solveRankService exactly (placements
// desc, then time asc) so "beaten" here always agrees with the leaderboard.
//
// In-app layer: computed on Home mount, gated by a per-user localStorage
// watermark so each event is shown once. The email layer lives in
// supabase/functions/beaten-digest (same rules, server-side).

import { supabase } from '../lib/supabase';

export interface BeatenEvent {
  puzzleId: string;
  puzzleName: string;
  /** Display name of who beat you. */
  byName: string;
  /** Their winning solution — race it via /c/<id>. */
  solutionId: string;
  at: string;
}

type Row = {
  id: string;
  puzzle_id: string;
  created_by: string | null;
  solver_name: string | null;
  placements_by_you: number | null;
  duration_ms: number | null;
  created_at: string;
};

/** Better result first — keep identical to leaderboardService.better(). */
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

const seenKey = (userId: string) => `beatenSeenAt:${userId}`;

export function markBeatenSeen(userId: string): void {
  try {
    localStorage.setItem(seenKey(userId), new Date().toISOString());
  } catch { /* storage unavailable */ }
}

function getSeenAt(userId: string): string {
  try {
    const v = localStorage.getItem(seenKey(userId));
    if (v) return v;
  } catch { /* fall through */ }
  // First run: only surface beats from the last 7 days, not all history.
  return new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
}

/**
 * Unseen beaten events for this user, newest first, max 3 puzzles.
 * Returns [] on any error — this is a bonus surface, never a blocker.
 */
export async function fetchBeatenEvents(userId: string): Promise<BeatenEvent[]> {
  try {
    const sinceIso = getSeenAt(userId);

    // My ranked solves → my best per puzzle.
    const { data: mine, error: mineErr } = await supabase
      .from('solutions')
      .select('id, puzzle_id, created_by, solver_name, placements_by_you, duration_ms, created_at')
      .eq('created_by', userId)
      .eq('solution_type', 'manual')
      .eq('piece_mode', 'unique')
      .limit(300);
    if (mineErr || !mine || mine.length === 0) return [];
    const myBest = new Map<string, Row>();
    for (const r of mine as Row[]) {
      const prev = myBest.get(r.puzzle_id);
      if (!prev || better(r, prev) < 0) myBest.set(r.puzzle_id, r);
    }

    // Others' new solves on those puzzles since the watermark.
    const puzzleIds = [...myBest.keys()];
    const { data: theirs, error: theirsErr } = await supabase
      .from('solutions')
      .select(
        'id, puzzle_id, created_by, solver_name, placements_by_you, duration_ms, created_at, puzzles(name)'
      )
      .in('puzzle_id', puzzleIds)
      .eq('solution_type', 'manual')
      .eq('piece_mode', 'unique')
      .gt('created_at', sinceIso)
      .neq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (theirsErr || !theirs) return [];

    // One event per puzzle: the best new rival solve that outranks my best.
    const byPuzzle = new Map<string, BeatenEvent>();
    for (const r of theirs as (Row & { puzzles?: { name?: string } })[]) {
      const best = myBest.get(r.puzzle_id);
      if (!best || better(r, best) >= 0) continue; // doesn't outrank me
      if (byPuzzle.has(r.puzzle_id)) continue; // newest-first — keep first seen
      byPuzzle.set(r.puzzle_id, {
        puzzleId: r.puzzle_id,
        puzzleName: r.puzzles?.name ?? '?',
        byName: (r.solver_name || 'someone').split('@')[0],
        solutionId: r.id,
        at: r.created_at,
      });
    }
    return [...byPuzzle.values()].slice(0, 3);
  } catch {
    return [];
  }
}
