// src/game/three/defaultPuzzle.ts
// Phase 3A-1: Default puzzle for testing before real puzzle loading

import type { PuzzleData } from '../../pages/solve/hooks/usePuzzleLoader';
import type { IJK } from '../../services/FitFinder';

// Simple 20-cell "L-shape" puzzle geometry for testing
// This is a minimal puzzle that works with the 3D renderer
const DEFAULT_GEOMETRY: IJK[] = [
  // Base layer (z=0)
  { i: 0, j: 0, k: 0 },
  { i: 1, j: 0, k: 0 },
  { i: 2, j: 0, k: 0 },
  { i: 3, j: 0, k: 0 },
  { i: 0, j: 1, k: 0 },
  { i: 1, j: 1, k: 0 },
  { i: 2, j: 1, k: 0 },
  { i: 3, j: 1, k: 0 },
  { i: 0, j: 2, k: 0 },
  { i: 1, j: 2, k: 0 },
  // Second layer (z=1)
  { i: 0, j: 0, k: 1 },
  { i: 1, j: 0, k: 1 },
  { i: 2, j: 0, k: 1 },
  { i: 3, j: 0, k: 1 },
  { i: 0, j: 1, k: 1 },
  { i: 1, j: 1, k: 1 },
  { i: 2, j: 1, k: 1 },
  { i: 3, j: 1, k: 1 },
  { i: 0, j: 2, k: 1 },
  { i: 1, j: 2, k: 1 },
];

export const DEFAULT_PUZZLE: PuzzleData = {
  id: 'default-test-puzzle',
  shape_id: 'default-shape',
  name: 'Test Puzzle',
  creator_name: 'System',
  description: 'Default puzzle for testing',
  challenge_message: null,
  visibility: 'public',
  geometry: DEFAULT_GEOMETRY,
  actions: [],
  preset_config: null,
  sphere_count: DEFAULT_GEOMETRY.length,
  creation_time_ms: null,
  created_at: new Date().toISOString(),
};

export default DEFAULT_PUZZLE;
