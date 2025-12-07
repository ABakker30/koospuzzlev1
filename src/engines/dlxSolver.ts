// src/engines/dlxSolver.ts
// Typed interface for DLX / exact cover solver used by ManualSolvePage.
// Currently stubs; ready to be implemented later.

import type { IJK } from '../types/shape';

export type RemainingPieceInfo = {
  pieceId: string;
  remaining: number | 'infinite';
};

export type PlacedPieceLike = {
  pieceId: string;
  orientationId: string;
  anchorSphereIndex: number;
  cells: IJK[];
  uid?: string;
};

export type Mode = 'oneOfEach' | 'unlimited' | 'single';

export type DLXCheckInput = {
  containerCells: IJK[];          // full puzzle geometry
  placedPieces: PlacedPieceLike[]; // current placed pieces
  emptyCells: IJK[];              // remaining empty container cells
  remainingPieces: RemainingPieceInfo[]; // available pieces with counts
  mode: Mode;
};

export type DLXCheckResult = {
  solvable: boolean;
};

export type DLXHintResult = {
  solvable: boolean;
  // optional hint info (to be used once implemented)
  hintedPieceId?: string;
  hintedOrientationId?: string;
  hintedAnchorCell?: IJK;
};

/**
 * Check if a partial puzzle state is solvable.
 * Uses engine2 as a "micro-solver" to check if any valid completion exists.
 */
export async function dlxCheckSolvable(
  input: DLXCheckInput
): Promise<DLXCheckResult> {
  console.log('🧠 DLX solvability micro-check started');
  console.log('📊 Empty cells:', input.emptyCells.length);
  console.log('📦 Remaining pieces:', input.remainingPieces);

  try {
    // Load pieces DB (same as AutoSolvePage)
    const { loadAllPieces } = await import('./piecesLoader');
    const { engine2Precompute, engine2Solve } = await import('./engine2');
    const piecesDb = await loadAllPieces();

    // Use ONLY empty cells as the container (already-placed pieces are excluded)
    const containerCells = input.emptyCells.map(
      (c) => [c.i, c.j, c.k] as [number, number, number]
    );

    if (containerCells.length === 0) {
      // No empty cells = already solved
      return { solvable: true };
    }

    // Precompute engine state for the empty cells
    const pre = engine2Precompute(
      { cells: containerCells, id: 'solvability-check' },
      piecesDb
    );

    // Build inventory from remaining pieces
    const inventory: Record<string, number> = {};
    for (const rem of input.remainingPieces) {
      if (rem.remaining === 'infinite') {
        // Treat as very large number (engine2 doesn't have true infinity)
        inventory[rem.pieceId] = 999;
      } else {
        inventory[rem.pieceId] = rem.remaining;
      }
    }

    console.log('🎯 Micro-solve inventory:', inventory);

    // Track if any solution is found
    let foundSolution = false;

    // Run engine2 with strict limits
    const handle = engine2Solve(
      pre,
      {
        maxSolutions: 1,        // Stop after first solution
        timeoutMs: 500,         // 500ms timeout
        statusIntervalMs: 100,
        pieces: {
          inventory,
          allow: input.remainingPieces.map(r => r.pieceId),
        },
      },
      {
        onStatus: (status) => {
          console.log('📊 Solvability status:', status);
        },
        onSolution: () => {
          console.log('✅ Found solution - position is solvable!');
          foundSolution = true;
          handle.pause(); // Stop immediately
        },
      }
    );

    // Start solving
    handle.resume();

    // Wait for solver to complete or timeout
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Stop solver
    handle.pause();

    console.log(`🧠 DLX solvability result: ${foundSolution ? 'SOLVABLE' : 'UNSOLVABLE'}`);
    return { solvable: foundSolution };
  } catch (error) {
    console.error('❌ Solvability check error:', error);
    // On error, return unsolvable to be safe
    return { solvable: false };
  }
}

/**
 * Compute a hint for the next move at a target cell.
 * TODO: Replace stub implementation with real DLX hint logic.
 */
export async function dlxGetHint(
  input: DLXCheckInput,
  targetCell: IJK
): Promise<DLXHintResult> {
  console.log('💡 DLX hint input:', { input, targetCell });
  // Stub: always return "no hint" for now.
  return { solvable: false };
}
