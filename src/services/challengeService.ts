// Challenge target = the result a challenger is trying to beat (one solve).
// Shared by the challenge landing page (/c/:id) and the in-game challenge HUD/
// verdict. A challenge currently points at a solution by its UUID.

import { supabase } from '../lib/supabase';

export type ChallengeTarget = {
  id: string;
  puzzle_id: string;
  solver_name: string | null;
  placements_by_you: number | null;
  total_pieces: number | null;
  duration_ms: number | null;
  puzzle_name: string | null;
};

/** Resolve a challenge (solution id) into its target result + puzzle name. */
export async function fetchChallengeTarget(
  id: string
): Promise<ChallengeTarget | null> {
  const { data, error } = await supabase
    .from('solutions')
    .select('puzzle_id, solver_name, placements_by_you, total_pieces, duration_ms')
    .eq('id', id)
    .single();
  if (error || !data) return null;

  const { data: pz } = await supabase
    .from('puzzles')
    .select('name')
    .eq('id', data.puzzle_id)
    .single();

  return { id, ...data, puzzle_name: pz?.name ?? null };
}

/** M:SS, or null if no time. */
export function formatChallengeTime(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

/** "8/10", or null if the solve predates placement scoring. */
export function formatChallengeScore(
  placementsByYou: number | null | undefined,
  totalPieces: number | null | undefined
): string | null {
  if (placementsByYou == null || totalPieces == null) return null;
  return `${placementsByYou}/${totalPieces}`;
}

export type ChallengeOutcome = 'won' | 'lost' | 'tied';

/**
 * Compare a player's result to the target. Placements decide (more pieces you
 * placed yourself = win); equal placements break to time (faster wins). Falls
 * back to a pure time race when the target predates placement scoring.
 */
export function judgeChallenge(
  player: { placements: number | null; durationMs: number | null },
  target: { placements: number | null; durationMs: number | null }
): ChallengeOutcome {
  const haveScores = player.placements != null && target.placements != null;
  if (haveScores) {
    if (player.placements! > target.placements!) return 'won';
    if (player.placements! < target.placements!) return 'lost';
  }
  // Tie on placements (or no scores) -> time decides.
  if (player.durationMs != null && target.durationMs != null) {
    if (player.durationMs < target.durationMs) return 'won';
    if (player.durationMs > target.durationMs) return 'lost';
  }
  return 'tied';
}
