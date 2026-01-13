// src/game/puzzle/PuzzleTypes.ts
// Phase 3A-2: Puzzle types for game layer
// Bridges 3D renderer (ManualGameBoard) and game completion logic

import type { IJK } from '../../services/FitFinder';
import type { StudioSettings } from '../../types/studio';

// ============================================================================
// IDENTIFIERS
// ============================================================================

export type PuzzleId = string;

/** Cell coordinate - same as IJK used throughout codebase */
export type CellCoord = IJK;

/** Cell key for Set/Map operations */
export type CellKey = string;

/** Convert IJK to string key for Set operations */
export function cellToKey(cell: CellCoord): CellKey {
  return `${cell.i},${cell.j},${cell.k}`;
}

/** Convert cell key back to IJK */
export function keyToCell(key: CellKey): CellCoord {
  const [i, j, k] = key.split(',').map(Number);
  return { i, j, k };
}

// ============================================================================
// PUZZLE SPEC (for game state - immutable after creation)
// ============================================================================

/**
 * Minimal puzzle specification stored in GameState
 * Contains only what's needed for game logic (completion check)
 */
export interface PuzzleSpec {
  id: PuzzleId;
  title: string;
  /** All cells that must be covered for puzzle completion */
  targetCells: CellCoord[];
  /** Precomputed keys for fast lookup */
  targetCellKeys: Set<CellKey>;
  /** Total sphere count (same as targetCells.length) */
  sphereCount: number;
}

/**
 * Create PuzzleSpec from target cells
 */
export function createPuzzleSpec(
  id: PuzzleId,
  title: string,
  targetCells: CellCoord[]
): PuzzleSpec {
  return {
    id,
    title,
    targetCells,
    targetCellKeys: new Set(targetCells.map(cellToKey)),
    sphereCount: targetCells.length,
  };
}

// ============================================================================
// PUZZLE GEOMETRY (for 3D renderer - ManualGameBoard compatible)
// ============================================================================

/**
 * Geometry data compatible with ManualGameBoard/useGameBoard
 * This matches the existing PuzzleData structure from usePuzzleLoader
 */
export interface PuzzleGeometry {
  id: string;
  shape_id: string;
  name: string;
  creator_name: string;
  description: string | null;
  challenge_message: string | null;
  visibility: 'public' | 'private';
  geometry: CellCoord[];
  actions: any[];
  preset_config: StudioSettings | null;
  sphere_count: number;
  creation_time_ms: number | null;
  created_at: string;
}

// ============================================================================
// PUZZLE DATA (complete package for GamePage)
// ============================================================================

/**
 * Complete puzzle data combining spec and geometry
 * - spec: for game logic (completion check)
 * - geometry: for 3D rendering (ManualGameBoard)
 * - raw: original data from source (optional)
 */
export interface PuzzleData {
  spec: PuzzleSpec;
  geometry: PuzzleGeometry;
  raw?: unknown;
}

/**
 * Create PuzzleData from raw puzzle data (as loaded from Supabase)
 */
export function createPuzzleData(rawPuzzle: PuzzleGeometry): PuzzleData {
  const spec = createPuzzleSpec(
    rawPuzzle.id,
    rawPuzzle.name,
    rawPuzzle.geometry
  );
  
  return {
    spec,
    geometry: rawPuzzle,
    raw: rawPuzzle,
  };
}

// ============================================================================
// RE-EXPORT IJK for convenience
// ============================================================================

export type { IJK } from '../../services/FitFinder';
