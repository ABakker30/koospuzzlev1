// Challenge target = the result a challenger is trying to beat (one solve).
// Shared by the challenge landing page (/c/:id) and the in-game challenge HUD/
// verdict. A challenge currently points at a solution by its UUID.

import { supabase } from '../lib/supabase';
import { getUsername } from './usernameService';
import { effectiveCategory, type PuzzleCategory } from '../utils/puzzleCategory';

export type ChallengeTarget = {
  /** The solution UUID (resolved, even when looked up by short code). */
  id: string;
  /** Short share code (koospuzzle.com/c/<code>), when one has been minted. */
  share_code: string | null;
  puzzle_id: string;
  solver_name: string | null;
  placements_by_you: number | null;
  total_pieces: number | null;
  duration_ms: number | null;
  puzzle_name: string | null;
  /** Difficulty category id — translate at render (categories.<id>.label). */
  puzzle_category: PuzzleCategory | null;
  /** Live display name (users.username by owner), fallback to stored name. */
  display_name: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve a challenge (solution UUID or short share code) into its target. */
export async function fetchChallengeTarget(
  idOrCode: string
): Promise<ChallengeTarget | null> {
  const byCode = !UUID_RE.test(idOrCode);
  const { data, error } = await supabase
    .from('solutions')
    .select('id, share_code, puzzle_id, solver_name, created_by, placements_by_you, total_pieces, duration_ms')
    .eq(byCode ? 'share_code' : 'id', byCode ? idOrCode.toLowerCase() : idOrCode)
    .maybeSingle();
  if (error || !data) return null;

  const { data: pz } = await supabase
    .from('puzzles')
    .select('name, sphere_count, category')
    .eq('id', data.puzzle_id)
    .single();

  const liveName = await getUsername(data.created_by);
  const display_name = liveName || data.solver_name?.split('@')[0] || 'a solver';

  const puzzle_category = pz ? effectiveCategory(pz) : null;

  return { ...data, puzzle_name: pz?.name ?? null, puzzle_category, display_name };
}

/**
 * Mint (or fetch) the short share code for a solution. Owner-only, enforced
 * server-side by the ensure_share_code RPC. Returns null on any failure —
 * callers fall back to UUID links, so sharing never blocks on this.
 */
export async function ensureShareCode(solutionId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('ensure_share_code', { sid: solutionId });
    if (error || typeof data !== 'string') return null;
    return data;
  } catch {
    return null;
  }
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
