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
  /** Piece mode of the target solve — races run under the same rules. */
  piece_mode: 'unique' | 'duplicates' | 'single' | null;
  single_piece_id: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve a challenge (solution UUID or short share code) into its target. */
export async function fetchChallengeTarget(
  idOrCode: string
): Promise<ChallengeTarget | null> {
  const byCode = !UUID_RE.test(idOrCode);
  let { data, error } = await supabase
    .from('solutions')
    .select('id, share_code, puzzle_id, solver_name, created_by, placements_by_you, total_pieces, duration_ms, piece_mode, single_piece_id')
    .eq(byCode ? 'share_code' : 'id', byCode ? idOrCode.toLowerCase() : idOrCode)
    .maybeSingle();
  // Migration-order safety: retry without piece_mode columns if absent.
  if (error && /piece_mode|single_piece_id/.test(error.message)) {
    ({ data, error } = await supabase
      .from('solutions')
      .select('id, share_code, puzzle_id, solver_name, created_by, placements_by_you, total_pieces, duration_ms')
      .eq(byCode ? 'share_code' : 'id', byCode ? idOrCode.toLowerCase() : idOrCode)
      .maybeSingle());
  }
  if (error || !data) return null;

  const { data: pz } = await supabase
    .from('puzzles')
    .select('name, sphere_count, category')
    .eq('id', data.puzzle_id)
    .single();

  const liveName = await getUsername(data.created_by);
  const display_name = liveName || data.solver_name?.split('@')[0] || 'a solver';

  const puzzle_category = pz ? effectiveCategory(pz) : null;

  return {
    ...(data as any),
    piece_mode: (data as any).piece_mode ?? 'unique',
    single_piece_id: (data as any).single_piece_id ?? null,
    puzzle_name: pz?.name ?? null,
    puzzle_category,
    display_name,
  };
}

export type PosedChallenge = {
  id: string;
  share_code: string;
  created_by: string | null;
  solver_name: string | null;
  placements_by_you: number | null;
  total_pieces: number | null;
  duration_ms: number | null;
  created_at: string;
  puzzle_id: string;
  puzzle_name: string | null;
  puzzle_thumbnail: string | null;
  puzzle_category: PuzzleCategory | null;
  piece_mode: 'unique' | 'duplicates' | 'single';
  single_piece_id: string | null;
};

/**
 * Open dares: solutions whose owner minted a share code. This is the
 * browsable ghost pool — every entry is a playable /c/<code> challenge.
 */
export async function getPosedChallenges(limit = 48): Promise<PosedChallenge[]> {
  const baseCols =
    'id, share_code, created_by, solver_name, placements_by_you, total_pieces, duration_ms, created_at, puzzle_id, puzzles(name, thumbnail_url, category, sphere_count)';
  let { data, error } = await supabase
    .from('solutions')
    .select(`${baseCols}, piece_mode, single_piece_id`)
    .not('share_code', 'is', null)
    .eq('solution_type', 'manual')
    .order('created_at', { ascending: false })
    .limit(limit);
  // Migration-order safety: retry without piece_mode columns if absent.
  if (error && /piece_mode|single_piece_id/.test(error.message)) {
    ({ data, error } = await supabase
      .from('solutions')
      .select(baseCols)
      .not('share_code', 'is', null)
      .eq('solution_type', 'manual')
      .order('created_at', { ascending: false })
      .limit(limit));
  }
  if (error || !data) return [];
  return (data as any[]).map((row) => ({
    id: row.id,
    share_code: row.share_code,
    created_by: row.created_by,
    solver_name: row.solver_name,
    placements_by_you: row.placements_by_you,
    total_pieces: row.total_pieces,
    duration_ms: row.duration_ms,
    created_at: row.created_at,
    puzzle_id: row.puzzle_id,
    puzzle_name: row.puzzles?.name ?? null,
    puzzle_thumbnail: row.puzzles?.thumbnail_url ?? null,
    puzzle_category: row.puzzles ? effectiveCategory(row.puzzles) : null,
    piece_mode: row.piece_mode ?? 'unique',
    single_piece_id: row.single_piece_id ?? null,
  }));
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
