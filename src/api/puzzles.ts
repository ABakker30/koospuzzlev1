import { supabase } from '../lib/supabase';

export interface PuzzleRecord {
  id: string;
  created_at: string;
  shape_id: string;
  name: string;
  creator_name: string;
  description?: string;
  challenge_message?: string;
  visibility: 'public' | 'private';
  actions: unknown;
  preset_config?: Record<string, unknown>;
  creation_time_ms?: number;
  updated_at: string;
  // From joined contracts_shapes table
  shape_size?: number;
}

/**
 * Fetch all public puzzles with shape size from contracts_shapes
 */
export async function getPublicPuzzles(): Promise<PuzzleRecord[]> {
  const { data, error } = await supabase
    .from('puzzles')
    .select(`
      *,
      contracts_shapes!inner(size)
    `)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch public puzzles:', error);
    throw new Error(`Failed to fetch puzzles: ${error.message}`);
  }

  // Flatten the joined data
  const flattened = (data || []).map((row: any) => ({
    ...row,
    shape_size: row.contracts_shapes?.size,
    contracts_shapes: undefined // Remove the nested object
  }));

  return flattened;
}

/**
 * Fetch puzzles created by the current user
 * For now, returns all puzzles (no auth yet)
 */
export async function getMyPuzzles(): Promise<PuzzleRecord[]> {
  // TODO: Filter by creator when auth is implemented
  // For now, return empty array or all puzzles
  return [];
}

/**
 * Fetch a single puzzle by ID
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
