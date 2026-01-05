// src/engines/dlxSolver.ts
// Typed interface for DLX / exact cover solver used by ManualSolvePage.
// Routes to hintEngine for actual implementation.

import type { IJK } from '../types/shape';
import {
  loadHintEnginePiecesDb,
  checkSolvableFromPartial,
  computeHintFromPartial,
  invalidateWitnessCache,
} from './hintEngine';

/**
 * Invalidate the witness cache when board state changes.
 * 
 * IMPORTANT: UI must call this when:
 * - A piece is placed (manual or hint)
 * - A piece is removed/undo
 * - The board is reset
 * 
 * This ensures hints always come from a consistent solution path.
 * 
 * RECOMMENDED: After manual placement at ≤90 cells, also call dlxCheckSolvable()
 * to verify the placement didn't create an unsolvable state. This gives immediate
 * feedback to the user (DLX is fast enough at ≤90 cells, ~5-50ms).
 * 
 * Example:
 *   handleManualPlacement(piece) {
 *     // ... place piece ...
 *     invalidateWitnessCache();
 *     
 *     if (emptyCount <= 90) {
 *       const result = await dlxCheckSolvable(currentState);
 *       if (!result.solvable) {
 *         showWarning("⚠️ This placement makes puzzle unsolvable!");
 *       }
 *     }
 *   }
 */
export { invalidateWitnessCache };

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

export type Mode = 'oneOfEach' | 'unlimited' | 'single' | 'customSet';

export type DLXCheckInput = {
  containerCells: IJK[];          // full puzzle geometry
  placedPieces: PlacedPieceLike[]; // current placed pieces
  emptyCells: IJK[];              // remaining empty container cells
  remainingPieces: RemainingPieceInfo[]; // available pieces with counts
  mode: Mode;
};

// Legacy result type (deprecated - use EnhancedDLXCheckResult)
export type DLXCheckResult = {
  solvable: boolean;
  mode: 'full' | 'lightweight';
  emptyCount: number;
  definiteFailure?: boolean;
  solutionCount?: number;
};

// Enhanced solver state - strict semantics
// green = solvable, red = unsolvable, orange = too early (threshold skipped), unknown = timed out
export type SolverState = 'green' | 'orange' | 'red' | 'unknown';
export type CheckDepth = 'none' | 'existence';
// Note: 'exhaustive' removed until hintEngine supports solution counting

// Enhanced result with rich metadata and honest uncertainty
export type EnhancedDLXCheckResult = {
  // Core state (required)
  state: SolverState; // green=solvable, red=unsolvable, orange=unknown
  emptyCellCount: number;
  checkedDepth: CheckDepth;
  timedOut: boolean;
  
  // Optional metadata (what the solver actually knows)
  solutionCount?: number; // Exact (exhaustive) or lower bound (partial)
  solutionsCapped?: boolean; // True if solutionCount hit limit (show "+")
  estimatedSearchSpace?: string; // e.g. "~10^12" or "< 10^6"
  validNextMoveCount?: number; // How many placements lead to ≥1 solution
  reason?: string; // Human-readable explanation
  
  // Diagnostic info
  computeTimeMs?: number;
  thresholdSkipped?: boolean;
};

// Options for solver check
export type DLXCheckOptions = {
  checkDepth?: CheckDepth; // Default: 'existence' (exhaustive not yet supported)
  timeoutMs?: number; // Default: 5000 (UI timeout only - solver continues in background)
  emptyThreshold?: number; // Skip expensive checks if empty > threshold (default: 90)
};

// Safe timer that works in browser and Node
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export type DLXHintResult = {
  solvable: boolean;
  // optional hint info (to be used once implemented)
  hintedPieceId?: string;
  hintedOrientationId?: string;
  hintedAnchorCell?: IJK;
};

/**
 * Check if a partial puzzle state is solvable (legacy version).
 * Routes through hintEngine for implementation.
 * @deprecated Use dlxCheckSolvableEnhanced for rich metadata
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
/**
 * Enhanced solvability check with rich metadata and honest uncertainty.
 * Returns what the solver actually knows, never guesses.
 * 
 * IMPORTANT LIMITATIONS:
 * - Timeout is UI-only; solver continues in background (no AbortSignal yet)
 * - checkDepth 'exhaustive' not yet supported (hintEngine limitation)
 * - Determinism depends on stable input ordering (not enforced here)
 */
export async function dlxCheckSolvableEnhanced(
  input: DLXCheckInput,
  options: DLXCheckOptions = {}
): Promise<EnhancedDLXCheckResult> {
  const startTime = now();
  const {
    timeoutMs = 5000,
    emptyThreshold = 90,
  } = options;

  const emptyCellCount = input.emptyCells.length;

  // Early exit: Too many empty cells (avoid expensive computation)
  if (emptyCellCount > emptyThreshold) {
    return {
      state: 'orange',
      emptyCellCount,
      checkedDepth: 'none',
      timedOut: false,
      thresholdSkipped: true,
      reason: `Too early to check (${emptyCellCount} empty cells > threshold ${emptyThreshold})`,
      computeTimeMs: now() - startTime,
    };
  }

  // Use Web Worker for non-blocking computation
  const { dlxWorkerCheck } = await import('./dlxWorkerClient');
  const result = await dlxWorkerCheck(input, { timeoutMs, emptyThreshold });
  
  // Add compute time
  const computeTimeMs = now() - startTime;
  return {
    ...result,
    computeTimeMs,
  };
}

/**
 * DETERMINISM REQUIREMENTS (for future hintEngine improvements):
 * 
 * For deterministic results across identical board states:
 * 1. Stable ordering: remainingPieces, emptyCells, placedPieces must have consistent order
 * 2. No RNG: hintEngine should not use random branching
 * 3. Canonical caching: cache keys should be order-independent (sorted/hashed)
 * 4. Stable traversal: DLX column/row selection must be deterministic
 * 
 * Currently: ordering depends on input array order, so same logical state
 * with different array orders may produce different timing/results.
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
