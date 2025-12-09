// src/engines/dlxSolver.ts
// Typed interface for DLX / exact cover solver used by ManualSolvePage.
// Routes to hintEngine for actual implementation.

import type { IJK } from '../types/shape';
import {
  loadHintEnginePiecesDb,
  checkSolvableFromPartial,
  computeHintFromPartial,
} from './hintEngine';

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
  mode: 'full' | 'lightweight';
  emptyCount: number;
  definiteFailure?: boolean;
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
 * Routes through hintEngine for implementation.
 */
export async function dlxCheckSolvable(
  input: DLXCheckInput
): Promise<DLXCheckResult> {
  console.log('🧠 DLX solvability check (via hintEngine)');

  try {
    const piecesDb = await loadHintEnginePiecesDb();
    const result = await checkSolvableFromPartial(input, piecesDb);
    console.log('🧠 DLX/hintEngine solvable result:', result);
    return result;  // Return full result with mode, emptyCount, definiteFailure
  } catch (err) {
    console.error('❌ DLX solvable check failed in hintEngine:', err);
    return { 
      solvable: false,
      mode: 'full',
      emptyCount: 0,
      definiteFailure: true
    };
  }
}

/**
 * Compute a hint for the next move at a target cell.
 * Routes through hintEngine for implementation.
 */
export async function dlxGetHint(
  input: DLXCheckInput,
  targetCell: IJK
): Promise<DLXHintResult> {
  console.log('💡 DLX hint (via hintEngine):', { targetCell });

  try {
    const piecesDb = await loadHintEnginePiecesDb();
    const result = await computeHintFromPartial(input, targetCell, piecesDb);
    console.log('💡 DLX/hintEngine hint result:', result);

    if (!result || !result.solvable || !result.hintedPieceId || !result.hintedAnchorCell) {
      return { solvable: false };
    }

    return {
      solvable: true,
      hintedPieceId: result.hintedPieceId,
      // orientationId is optional; ManualSolvePage has fallback to first orientation
      hintedOrientationId: result.hintedOrientationId,
      hintedAnchorCell: result.hintedAnchorCell,
    };
  } catch (err) {
    console.error('❌ DLX hint failed in hintEngine:', err);
    return { solvable: false };
  }
}
