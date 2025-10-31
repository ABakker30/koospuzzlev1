import { supabase } from '../lib/supabase';

export interface MovieRecord {
  id: string;
  puzzle_id: string;
  solution_id: string; // Required - every movie must reference a solution
  title: string;
  description?: string;
  challenge_text: string;
  creator_name: string;
  effect_type: 'turntable' | 'gravity' | 'reveal';
  effect_config: Record<string, unknown>;
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
  // From joined tables
  puzzle_name?: string;
  solution_data?: any; // Optional joined solution data
}

/**
 * Fetch all public movies with puzzle info
 */
export async function getPublicMovies(): Promise<MovieRecord[]> {
  const { data, error } = await supabase
    .from('movies')
    .select(`
      *,
      puzzles!inner(name)
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
    puzzles: undefined // Remove the nested object
  }));

  return flattened;
}

/**
 * Fetch movies created by the current user
 * For now, returns empty array (no auth yet)
 */
export async function getMyMovies(): Promise<MovieRecord[]> {
  // TODO: Filter by creator when auth is implemented
  return [];
}

/**
 * Fetch a single movie by ID with solution data
 */
export async function getMovieById(id: string): Promise<MovieRecord | null> {
  const { data, error } = await supabase
    .from('movies')
    .select(`
      *,
      puzzles!inner(name),
      solutions!inner(placed_pieces, solve_time_ms, move_count)
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Failed to fetch movie:', error);
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
export async function incrementMovieViews(id: string): Promise<void> {
  const { error } = await supabase.rpc('increment_movie_views', { movie_id: id });
  
  if (error) {
    console.error('Failed to increment views:', error);
    // Don't throw - this is not critical
  }
}

/**
 * Toggle like on a movie (increment/decrement)
 */
export async function toggleMovieLike(id: string, liked: boolean): Promise<void> {
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
