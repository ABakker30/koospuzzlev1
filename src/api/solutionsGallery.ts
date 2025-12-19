import { supabase } from '../lib/supabase';

export interface SolutionRecord {
  id: string;
  puzzle_id: string;
  created_by: string;
  solver_name: string;
  solution_type: string;
  final_geometry: any;
  thumbnail_url?: string;
  total_moves?: number;
  undo_count?: number;
  hints_used?: number;
  solvability_checks_used?: number;
  duration_ms?: number;
  solve_time_ms?: number;
  move_count?: number;
  created_at: string;
  updated_at?: string;
  // From joined tables
  puzzle_name?: string;
}

/**
 * Fetch all public solutions with puzzle info
 */
export async function getPublicSolutions(): Promise<SolutionRecord[]> {
  const { data, error } = await supabase
    .from('solutions')
    .select(`
      *,
      puzzles!inner(name)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch public solutions:', error);
    throw new Error(`Failed to fetch solutions: ${error.message}`);
  }

  // Flatten the joined data
  const flattened = (data || []).map((row: any) => ({
    ...row,
    puzzle_name: row.puzzles?.name,
    puzzles: undefined // Remove the nested object
  }));

  return flattened;
}

/**
 * Fetch solutions created by the current user
 */
export async function getMySolutions(): Promise<SolutionRecord[]> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return [];

  const { data, error } = await supabase
    .from('solutions')
    .select(`
      *,
      puzzles!inner(name)
    `)
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch user solutions:', error);
    return [];
  }

  const flattened = (data || []).map((row: any) => ({
    ...row,
    puzzle_name: row.puzzles?.name,
    puzzles: undefined
  }));

  return flattened;
}

/**
 * Fetch a single solution by ID
 */
export async function getSolutionById(id: string): Promise<SolutionRecord | null> {
  const { data, error } = await supabase
    .from('solutions')
    .select(`
      *,
      puzzles(name)
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Failed to fetch solution:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return null;
  }

  // Flatten the joined data
  return {
    ...data,
    puzzle_name: data.puzzles?.name,
    puzzles: undefined
  };
}

/**
 * Increment view count for a solution (if view_count column exists)
 */
export async function incrementSolutionViews(id: string): Promise<void> {
  // Currently solutions table doesn't have view_count
  // This is a no-op for now
  console.log('View tracking not yet implemented for solutions');
}

/**
 * Toggle like on a solution
 */
export async function toggleSolutionLike(id: string, liked: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User must be logged in to like solutions');
  }

  if (liked) {
    // Add like
    const { error: insertError } = await supabase
      .from('solution_likes')
      .insert({
        solution_id: id,
        user_id: user.id
      });

    if (insertError) {
      console.error('Error adding like:', insertError);
      throw insertError;
    }

    // Increment like count
    const { error: updateError } = await supabase.rpc('increment_solution_likes', {
      solution_id: id
    });

    if (updateError) {
      console.error('Error incrementing like count:', updateError);
    }
  } else {
    // Remove like
    const { error: deleteError } = await supabase
      .from('solution_likes')
      .delete()
      .eq('solution_id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error removing like:', deleteError);
      throw deleteError;
    }

    // Decrement like count
    const { error: updateError } = await supabase.rpc('decrement_solution_likes', {
      solution_id: id
    });

    if (updateError) {
      console.error('Error decrementing like count:', updateError);
    }
  }
}

/**
 * Delete a solution
 */
export async function deleteSolution(id: string): Promise<void> {
  const { error } = await supabase
    .from('solutions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete solution:', error);
    throw new Error(`Failed to delete solution: ${error.message}`);
  }
}

/**
 * Update solution metadata
 */
export async function updateSolution(
  id: string,
  updates: {
    solver_name?: string;
    thumbnail_url?: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from('solutions')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Failed to update solution:', error);
    throw new Error(`Failed to update solution: ${error.message}`);
  }
}
