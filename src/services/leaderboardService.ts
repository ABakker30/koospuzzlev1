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
  created_at: string;
};

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
      created_at
      `
    )
    .eq('puzzle_id', puzzleId)
    .not('duration_ms', 'is', null)
    .order('duration_ms', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('❌ Error loading leaderboard:', error);
    return [];
  }

  return data ?? [];
}
