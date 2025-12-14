// src/api/puzzleStats.ts
// API functions for puzzle_stats aggregates

import { supabase } from '../lib/supabase';

export interface PuzzleStats {
  puzzle_id: string;
  
  // Auto-solve aggregates
  auto_runs_count: number;
  auto_success_count: number;
  auto_solutions_found: number;
  auto_nodes_total: number;
  auto_elapsed_ms_total: number;
  auto_time_to_solution_ms_total: number;
  auto_nodes_to_solution_total: number;
  auto_best_placed_max: number;
  
  // Manual aggregates
  manual_solutions_count: number;
  manual_solve_time_ms_total: number;
  manual_move_count_total: number;
  
  // Overall
  solutions_total: number;
  
  updated_at: string;
}

/**
 * Fetch aggregate stats for a specific puzzle
 */
export async function getPuzzleStats(puzzleId: string): Promise<PuzzleStats | null> {
  try {
    const { data, error } = await supabase
      .from('puzzle_stats')
      .select('*')
      .eq('puzzle_id', puzzleId)
      .single();

    if (error) {
      // If no stats row exists yet, return zeros
      if (error.code === 'PGRST116') {
        console.log('No puzzle_stats row found for', puzzleId);
        return null;
      }
      throw error;
    }

    return data as PuzzleStats;
  } catch (error) {
    console.error('Error fetching puzzle stats:', error);
    return null;
  }
}

/**
 * Calculate derived metrics from puzzle stats
 */
export function calculatePuzzleMetrics(stats: PuzzleStats | null) {
  if (!stats) {
    return {
      nodesPerSolution: 0,
      avgTimePerAutoRun: 0,
      avgTimePerManualSolve: 0,
      avgMovesPerManualSolve: 0,
      autoSuccessRate: 0,
    };
  }

  return {
    // Solution scarcity: nodes per auto solution
    nodesPerSolution: stats.auto_solutions_found > 0 
      ? Math.round(stats.auto_nodes_total / stats.auto_solutions_found)
      : 0,
    
    // Average time per auto run
    avgTimePerAutoRun: stats.auto_runs_count > 0
      ? Math.round(stats.auto_elapsed_ms_total / stats.auto_runs_count)
      : 0,
    
    // Average time per manual solve
    avgTimePerManualSolve: stats.manual_solutions_count > 0
      ? Math.round(stats.manual_solve_time_ms_total / stats.manual_solutions_count)
      : 0,
    
    // Average moves per manual solve
    avgMovesPerManualSolve: stats.manual_solutions_count > 0
      ? Math.round(stats.manual_move_count_total / stats.manual_solutions_count)
      : 0,
    
    // Auto-solve success rate
    autoSuccessRate: stats.auto_runs_count > 0
      ? Math.round((stats.auto_success_count / stats.auto_runs_count) * 100)
      : 0,
  };
}
