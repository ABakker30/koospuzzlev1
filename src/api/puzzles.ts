import { supabase } from '../lib/supabase';

export interface PuzzleRecord {
  id: string;
  created_at: string;
  shape_id: string;
  name: string;
  creator_name: string;
  created_by?: string | null; // owner uid (NULL for legacy/anonymous puzzles)
  description?: string;
  challenge_message?: string;
  visibility: 'public' | 'private';
  geometry?: Array<{ i: number; j: number; k: number }>; // IJK cell coordinates
  /** Difficulty category (NULL = auto-derived client-side). */
  category?: string | null;
  actions: unknown;
  preset_config?: Record<string, unknown>;
  creation_time_ms?: number;
  updated_at: string;
  thumbnail_url?: string;
  // From joined contracts_shapes table
  shape_size?: number;
  // Solution metadata (unified gallery)
  solution_count?: number;
  has_solutions?: boolean;
  featured_solution_id?: string;
}

/**
 * Fetch all public puzzles with shape size and solution count (unified gallery)
 */
export async function getPublicPuzzles(): Promise<PuzzleRecord[]> {
  const { data, error } = await supabase
    .from('puzzles')
    .select(`
      *,
      contracts_shapes(size),
      solutions(count)
    `)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch public puzzles:', error);
    throw new Error(`Failed to fetch puzzles: ${error.message}`);
  }

  // Flatten the joined data and calculate solution count
  const flattened = (data || []).map((row: any) => {
    const solutionCount = Array.isArray(row.solutions) ? row.solutions.length : 0;
    return {
      ...row,
      shape_size: row.contracts_shapes?.size || row.sphere_count,
      solution_count: solutionCount,
      has_solutions: solutionCount > 0,
      contracts_shapes: undefined, // Remove nested object
      solutions: undefined // Remove nested array
    };
  });

  return flattened;
}

/**
 * Fetch puzzles created by the current signed-in user (any visibility).
 * Filters by the `created_by` owner column. Returns [] for guests, and
 * degrades to [] if the column isn't present yet (migration not applied).
 */
export async function getMyPuzzles(): Promise<PuzzleRecord[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('puzzles')
    .select(`
      *,
      contracts_shapes(size),
      solutions(count)
    `)
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch my puzzles:', error);
    return [];
  }

  const flattened = (data || []).map((row: any) => {
    const solutionCount = Array.isArray(row.solutions) ? row.solutions.length : 0;
    return {
      ...row,
      shape_size: row.contracts_shapes?.size || row.sphere_count,
      solution_count: solutionCount,
      has_solutions: solutionCount > 0,
      contracts_shapes: undefined,
      solutions: undefined,
    };
  });

  return flattened;
}

/**
 * Fetch a single puzzle by ID
 * For old puzzles without geometry, fetch from contracts_shapes
 */
export async function getPuzzleById(id: string): Promise<PuzzleRecord | null> {
  const { data, error } = await supabase
    .from('puzzles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Failed to fetch puzzle:', error);
    return null;
  }

  // If puzzle has no geometry, try to get it from contracts_shapes
  if (data && (!data.geometry || data.geometry.length === 0) && data.shape_id) {
    console.log('📦 Puzzle missing geometry, loading from contracts_shapes:', data.shape_id);
    const { data: shapeData, error: shapeError } = await supabase
      .from('contracts_shapes')
      .select('cells')
      .eq('id', data.shape_id)
      .single();
    
    if (!shapeError && shapeData?.cells) {
      // Convert from [[i,j,k]] format to [{i,j,k}] format
      data.geometry = shapeData.cells.map(([i, j, k]: [number, number, number]) => ({ i, j, k }));
      console.log('✅ Loaded geometry from contracts_shapes:', data.geometry.length, 'cells');
    }
  }

  return data;
}

/**
 * Delete a puzzle
 * DEV MODE: Works without authentication
 */
export async function deletePuzzle(id: string): Promise<void> {
  const { error } = await supabase
    .from('puzzles')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete puzzle:', error);
    throw new Error(`Failed to delete puzzle: ${error.message}`);
  }
}

/**
 * Update puzzle metadata
 * DEV MODE: Works without authentication
 */
export async function updatePuzzle(
  id: string,
  updates: {
    name?: string;
    description?: string;
    challenge_message?: string;
    visibility?: 'public' | 'private';
    /** Difficulty category; null clears the override (back to auto-derived). */
    category?: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from('puzzles')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Failed to update puzzle:', error);
    throw new Error(`Failed to update puzzle: ${error.message}`);
  }
}
