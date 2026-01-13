// src/game/puzzle/PuzzleRepo.ts
// Phase 3A-2: Puzzle repository for loading puzzles from Supabase
// Reuses existing puzzle loading logic from usePuzzleLoader

import { supabase } from '../../lib/supabase';
import { createPuzzleData, type PuzzleData, type PuzzleGeometry, type CellCoord } from './PuzzleTypes';

// ============================================================================
// ERROR TYPES
// ============================================================================

export class PuzzleNotFoundError extends Error {
  constructor(puzzleId: string) {
    super(`Puzzle not found: ${puzzleId}`);
    this.name = 'PuzzleNotFoundError';
  }
}

export class PuzzleLoadError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'PuzzleLoadError';
  }
}

// ============================================================================
// FALLBACK PUZZLE (development/offline mode)
// ============================================================================

const FALLBACK_PUZZLE: PuzzleGeometry = {
  id: 'fallback-puzzle',
  shape_id: 'fallback-shape',
  name: 'Fallback Puzzle',
  creator_name: 'System',
  description: 'Default fallback puzzle for development',
  challenge_message: null,
  visibility: 'public',
  geometry: [
    { i: 0, j: 0, k: 0 }, { i: 1, j: 0, k: 0 }, { i: 2, j: 0, k: 0 }, { i: 3, j: 0, k: 0 },
    { i: 0, j: 1, k: 0 }, { i: 1, j: 1, k: 0 }, { i: 2, j: 1, k: 0 }, { i: 3, j: 1, k: 0 },
    { i: 0, j: 2, k: 0 }, { i: 1, j: 2, k: 0 },
    { i: 0, j: 0, k: 1 }, { i: 1, j: 0, k: 1 }, { i: 2, j: 0, k: 1 }, { i: 3, j: 0, k: 1 },
    { i: 0, j: 1, k: 1 }, { i: 1, j: 1, k: 1 }, { i: 2, j: 1, k: 1 }, { i: 3, j: 1, k: 1 },
    { i: 0, j: 2, k: 1 }, { i: 1, j: 2, k: 1 },
  ],
  actions: [],
  preset_config: null,
  sphere_count: 20,
  creation_time_ms: null,
  created_at: new Date().toISOString(),
};

// ============================================================================
// LOAD PUZZLE BY ID
// ============================================================================

/**
 * Load a puzzle by ID from Supabase
 * @throws PuzzleNotFoundError if puzzle doesn't exist
 * @throws PuzzleLoadError for other errors
 */
export async function loadPuzzleById(puzzleId: string): Promise<PuzzleData> {
  console.log('🔍 [PuzzleRepo] Loading puzzle:', puzzleId);
  
  try {
    const { data, error: fetchError } = await supabase
      .from('puzzles')
      .select(`
        id,
        shape_id,
        name,
        creator_name,
        description,
        challenge_message,
        visibility,
        geometry,
        sphere_count,
        actions,
        preset_config,
        creation_time_ms,
        created_at,
        contracts_shapes (
          cells,
          size
        )
      `)
      .eq('id', puzzleId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        throw new PuzzleNotFoundError(puzzleId);
      }
      console.error('[PuzzleRepo] Supabase error:', fetchError);
      throw new PuzzleLoadError(`Failed to load puzzle: ${fetchError.message}`, fetchError);
    }

    if (!data) {
      throw new PuzzleNotFoundError(puzzleId);
    }

    // Parse geometry from contracts_shapes or puzzles.geometry
    const geometry = parseGeometry(data);
    
    const puzzleGeometry: PuzzleGeometry = {
      id: data.id,
      shape_id: data.shape_id,
      name: data.name,
      creator_name: data.creator_name,
      description: data.description,
      challenge_message: data.challenge_message,
      visibility: data.visibility as 'public' | 'private',
      geometry,
      actions: data.actions,
      preset_config: data.preset_config,
      sphere_count: geometry.length,
      creation_time_ms: data.creation_time_ms,
      created_at: data.created_at,
    };

    console.log('✅ [PuzzleRepo] Puzzle loaded:', puzzleGeometry.name, `(${puzzleGeometry.sphere_count} spheres)`);
    return createPuzzleData(puzzleGeometry);
    
  } catch (err) {
    if (err instanceof PuzzleNotFoundError || err instanceof PuzzleLoadError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('❌ [PuzzleRepo] Failed to load puzzle:', message);
    throw new PuzzleLoadError(message, err);
  }
}

// ============================================================================
// LOAD DEFAULT PUZZLE
// ============================================================================

/**
 * Load a default puzzle for the given mode
 * Falls back to FALLBACK_PUZZLE if no puzzles available
 */
export async function loadDefaultPuzzle(mode?: 'solo' | 'vs'): Promise<PuzzleData> {
  console.log('🔍 [PuzzleRepo] Loading default puzzle for mode:', mode ?? 'any');
  
  try {
    // Try to load a random public puzzle with reasonable size
    const { data, error: fetchError } = await supabase
      .from('puzzles')
      .select(`
        id,
        shape_id,
        name,
        creator_name,
        description,
        challenge_message,
        visibility,
        geometry,
        sphere_count,
        actions,
        preset_config,
        creation_time_ms,
        created_at,
        contracts_shapes (
          cells,
          size
        )
      `)
      .eq('visibility', 'public')
      .gte('sphere_count', 15)
      .lte('sphere_count', 50)
      .limit(10);

    if (fetchError) {
      console.warn('[PuzzleRepo] Failed to load default puzzles, using fallback:', fetchError.message);
      return createPuzzleData(FALLBACK_PUZZLE);
    }

    if (!data || data.length === 0) {
      console.warn('[PuzzleRepo] No public puzzles found, using fallback');
      return createPuzzleData(FALLBACK_PUZZLE);
    }

    // Pick a random puzzle from the results
    const randomIndex = Math.floor(Math.random() * data.length);
    const selected = data[randomIndex];
    
    const geometry = parseGeometry(selected);
    
    const puzzleGeometry: PuzzleGeometry = {
      id: selected.id,
      shape_id: selected.shape_id,
      name: selected.name,
      creator_name: selected.creator_name,
      description: selected.description,
      challenge_message: selected.challenge_message,
      visibility: selected.visibility as 'public' | 'private',
      geometry,
      actions: selected.actions,
      preset_config: selected.preset_config,
      sphere_count: geometry.length,
      creation_time_ms: selected.creation_time_ms,
      created_at: selected.created_at,
    };

    console.log('✅ [PuzzleRepo] Default puzzle loaded:', puzzleGeometry.name, `(${puzzleGeometry.sphere_count} spheres)`);
    return createPuzzleData(puzzleGeometry);
    
  } catch (err) {
    console.warn('[PuzzleRepo] Error loading default puzzle, using fallback:', err);
    return createPuzzleData(FALLBACK_PUZZLE);
  }
}

// ============================================================================
// HELPER: Parse geometry from Supabase response
// ============================================================================

function parseGeometry(data: any): CellCoord[] {
  const shapeData = data.contracts_shapes;
  
  if (shapeData && shapeData.cells && shapeData.cells.length > 0) {
    const firstCell = shapeData.cells[0];
    
    if (Array.isArray(firstCell)) {
      // Contract format: [[i,j,k], ...]
      return shapeData.cells.map((cell: number[]) => ({
        i: cell[0],
        j: cell[1],
        k: cell[2],
      }));
    }
  }
  
  if (data.geometry && Array.isArray(data.geometry)) {
    // Direct format: [{i,j,k}, ...]
    return data.geometry;
  }
  
  throw new PuzzleLoadError('Puzzle has no valid geometry data');
}
