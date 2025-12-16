// Configuration for DLX (Dancing Links) exact cover solver
// Used for hints and solvability checks in Manual Solve and VS modes

export const DLX_CONFIG = {
  // Use DLX for hints when state has ≤ this many open cells
  HINT_THRESHOLD: 100,
  
  // Use DLX for solvability checks when ≤ this many open cells
  SOLVE_THRESHOLD: 100,
  
  // Maximum number of solutions to count (stops after this)
  COUNT_LIMIT: 100000,
  
  // Timeout in milliseconds (5 minutes for extremely hard puzzles)
  TIMEOUT_MS: 300000,
} as const;
