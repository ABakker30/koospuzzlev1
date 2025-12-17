import { supabase } from '../lib/supabase';

export interface SolutionRecord {
  id: string;
  puzzle_id: string;
  solution_id: string; // Required - every movie must reference a solution
  title: string;
  description?: string;
  challenge_text: string;
  creator_name: string;
  effect_type: 'turntable' | 'gravity' | 'reveal';
  effect_config: Record<string, unknown>;
  studio_settings?: Record<string, unknown>; // Optional studio/scene settings
  credits_config?: Record<string, unknown>;
  duration_sec: number;
  file_size_bytes?: number;
  solve_time_ms?: number;
  move_count?: number;
  pieces_placed?: number;
  puzzle_mode?: string;
  view_count: number;
  like_count: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  thumbnail_url?: string; // URL to thumbnail image in storage
  // From joined tables
  puzzle_name?: string;
  solution_data?: any; // Optional joined solution data
}

/**
 * Fetch all public movies with puzzle info
 */
export async function getPublicSolutions(): Promise<SolutionRecord[]> {
  const { data, error } = await supabase
    .from('movies')
    .select(`
      *,
      puzzles!inner(name),
      solutions(placed_pieces, solve_time_ms, move_count)
    `)
    .eq('is_public', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch public movies:', error);
    throw new Error(`Failed to fetch movies: ${error.message}`);
  }

  // Flatten the joined data
  const flattened = (data || []).map((row: any) => ({
    ...row,
    puzzle_name: row.puzzles?.name,
    solution_data: row.solutions, // Add solution data
    puzzles: undefined, // Remove the nested object
    solutions: undefined // Remove the nested object
  }));

  return flattened;
}

/**
 * Fetch movies created by the current user
 * For now, returns empty array (no auth yet)
 */
export async function getMySolutions(): Promise<SolutionRecord[]> {
  // TODO: Filter by creator when auth is implemented
  return [];
}

/**
 * Fetch a single movie by ID with solution data
 */
export async function getSolutionById(id: string): Promise<SolutionRecord | null> {
  const { data, error } = await supabase
    .from('movies')
    .select(`
      *,
      puzzles(name),
      solutions(placed_pieces, solve_time_ms, move_count)
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Failed to fetch movie:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return null;
  }

  // Flatten the joined data
  return {
    ...data,
    puzzle_name: data.puzzles?.name,
    solution_data: data.solutions,
    puzzles: undefined,
    solutions: undefined
  };
}

/**
 * Increment view count for a movie
 */
export async function incrementSolutionViews(id: string): Promise<void> {
  const { error } = await supabase.rpc('increment_movie_views', { movie_id: id });
  
  if (error) {
    console.error('Failed to increment views:', error);
    // Don't throw - this is not critical
  }
}

/**
 * Toggle like on a movie (increment/decrement)
 */
export async function toggleSolutionLike(id: string, liked: boolean): Promise<void> {
  const { data: current } = await supabase
    .from('movies')
    .select('like_count')
    .eq('id', id)
    .single();

  if (!current) return;

  const newCount = liked 
    ? current.like_count + 1 
    : Math.max(0, current.like_count - 1);

  const { error } = await supabase
    .from('movies')
    .update({ like_count: newCount })
    .eq('id', id);

  if (error) {
    console.error('Failed to toggle like:', error);
  }
}

/**
 * Delete a movie
 * DEV MODE: Works without authentication
 */
export async function deleteSolution(id: string): Promise<void> {
  const { error } = await supabase
    .from('movies')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete movie:', error);
    throw new Error(`Failed to delete movie: ${error.message}`);
  }
}

/**
 * Update movie metadata
 * DEV MODE: Works without authentication
 */
export async function updateSolution(
  id: string,
  updates: {
    title?: string;
    description?: string;
    challenge_text?: string;
    is_public?: boolean;
  }
): Promise<void> {
  const { error } = await supabase
    .from('movies')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Failed to update movie:', error);
    throw new Error(`Failed to update movie: ${error.message}`);
  }
}
