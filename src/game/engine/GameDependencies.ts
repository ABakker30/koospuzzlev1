// src/game/engine/GameDependencies.ts
// Dependency injection layer for GameMachine
// Keeps solvability/hint logic swappable and separate from state machine

import type { GameState, RepairStep, PlayerId, GamePlacedPiece } from '../contracts/GameState';
import type { IJK } from '../../types/shape';
import { computeFits, ijkToKey as fitIjkToKey, type OrientationSpec } from '../../services/FitFinder';
import { GoldOrientationService } from '../../services/GoldOrientationService';
import { cellToKey } from '../puzzle/PuzzleTypes';

// ============================================================================
// SOLVABILITY CHECK TYPES
// ============================================================================

export type SolvabilityStatus = 'solvable' | 'unsolvable' | 'unknown';

export interface SolvabilityResult {
  status: SolvabilityStatus;
  /** If status is 'unsolvable' via lightweight check */
  definiteFailure?: boolean;
  /** Number of solutions found (if full check) */
  solutionCount?: number;
  /** Time taken for check */
  computeTimeMs?: number;
  /** Reason for unknown status (timeout, etc) */
  reason?: string;
}

// ============================================================================
// HINT TYPES (Phase 2B)
// ============================================================================

/** Anchor for hint - the cell/position where user wants a hint */
export type Anchor = IJK;

/** Placement info for a piece */
export interface PlacementInfo {
  pieceId: string;
  orientationId: string;
  cells: IJK[];
}

/** Hint suggestion returned by generateHint */
export interface HintSuggestion {
  pieceId: string;
  placement: PlacementInfo;
  /** Optional message for UI */
  reasonText?: string;
}

/** Result of hint generation attempt */
export type HintResult =
  | { status: 'no_hints' }
  | { status: 'invalid_turn' }
  | { status: 'no_suggestion' }
  | { status: 'suggestion'; suggestion: HintSuggestion }
  | { status: 'error'; message: string };

// ============================================================================
// GAME DEPENDENCIES INTERFACE
// ============================================================================

export interface GameDependencies {
  /**
   * Check if current board state is solvable
   * Returns 'solvable', 'unsolvable', or 'unknown' (timeout)
   */
  solvabilityCheck(state: GameState): Promise<SolvabilityResult>;
  
  /**
   * Compute repair plan to make puzzle solvable
   * Returns deterministic list of steps to remove pieces until solvable
   */
  computeRepairPlan(state: GameState): RepairStep[];
  
  /**
   * Generate a hint piece suggestion for the given anchor
   * Returns placement info or null if no valid hint found
   */
  generateHint(state: GameState, anchor: Anchor): Promise<HintSuggestion | null>;
  
  /**
   * Check if the puzzle is complete (all required cells filled)
   * Used to trigger end-of-game condition (Phase 2C)
   */
  isPuzzleComplete(state: GameState): boolean;
}

// ============================================================================
// DEFAULT IMPLEMENTATION (integrates with existing hintEngine/dlxSolver)
// ============================================================================

/**
 * Build DLXCheckInput from GameState
 */
function buildDLXInput(state: GameState) {
  // Get container cells from puzzle spec
  const containerCells: IJK[] = [];
  for (const key of state.puzzleSpec.targetCellKeys) {
    const [i, j, k] = key.split(',').map(Number);
    containerCells.push({ i, j, k });
  }
  
  // Get placed pieces from board state
  const placedPieces = Array.from(state.boardState.values()).map(p => ({
    pieceId: p.pieceId,
    orientationId: p.orientationId,
    cells: p.cells,
    uid: p.uid,
  }));
  
  // Compute empty cells
  const ijkToKey = (cell: IJK) => `${cell.i},${cell.j},${cell.k}`;
  const occupied = new Set<string>();
  placedPieces.forEach(piece => {
    piece.cells.forEach(c => occupied.add(ijkToKey(c)));
  });
  const emptyCells = containerCells.filter(c => !occupied.has(ijkToKey(c)));
  
  // Build remaining pieces from inventory
  const remainingPieces = Object.entries(state.inventoryState).map(([pieceId, count]) => {
    const placed = state.placedCountByPieceId[pieceId] ?? 0;
    const remaining = count === 99 ? 'infinite' as const : Math.max(0, count - placed);
    return { pieceId, remaining };
  });
  
  // Debug: uncomment to see DLX input details
  // console.log('🔍 [GameDeps] DLX Input:', { containerCells: containerCells.length, placedPieces: placedPieces.length });
  
  return {
    containerCells,
    placedPieces,
    emptyCells,
    remainingPieces,
    mode: 'oneOfEach' as const, // TODO: Make configurable
  };
}

/**
 * Default solvability check using existing dlxSolver
 */
async function defaultSolvabilityCheck(state: GameState): Promise<SolvabilityResult> {
  
  // For Phase 2A: Use a simple stub that can be replaced with real dlxSolver
  // In production, this would call dlxCheckSolvableEnhanced
  
  try {
    // Dynamic import to avoid circular deps
    const { dlxCheckSolvableEnhanced } = await import('../../engines/dlxSolver');
    
    const input = buildDLXInput(state);
    
    // Skip if no container cells (placeholder state)
    if (input.containerCells.length === 0) {
      // For testing: randomly return solvable/unsolvable
      const isSolvable = state.boardState.size < 3; // Stub: unsolvable if 3+ pieces
      return {
        status: isSolvable ? 'solvable' : 'unsolvable',
        reason: 'Stub: Based on piece count',
      };
    }
    
    const result = await dlxCheckSolvableEnhanced(input, { timeoutMs: 5000 });
    
    // Map enhanced result to our simplified interface
    if (result.state === 'green') {
      return { status: 'solvable', solutionCount: result.solutionCount };
    } else if (result.state === 'red') {
      return { status: 'unsolvable', definiteFailure: true };
    } else if (result.timedOut) {
      return { status: 'unknown', reason: 'Timeout' };
    } else {
      // Orange or unknown
      return { status: 'unknown', reason: result.reason };
    }
  } catch (err) {
    console.error('❌ [GameDeps] Solvability check failed:', err);
    return { status: 'unknown', reason: String(err) };
  }
}

/**
 * Default repair plan computation
 * Removes pieces in reverse placement order until solvable
 */
function defaultComputeRepairPlan(state: GameState): RepairStep[] {
  
  const steps: RepairStep[] = [];
  
  // Get placed pieces sorted by placement time (newest first for removal)
  const placedPieces = Array.from(state.boardState.values())
    .sort((a, b) => b.placedAt - a.placedAt);
  
  if (placedPieces.length === 0) {
    // No pieces to remove
    steps.push({ type: 'MESSAGE', text: 'No pieces to remove.' });
    steps.push({ type: 'DONE', solvable: true });
    return steps;
  }
  
  // Add initial message
  steps.push({ type: 'MESSAGE', text: 'Puzzle not solvable. Removing pieces...' });
  
  // For Phase 2A: Remove pieces one by one (newest first)
  // In production, this would use smarter heuristics (e.g., witness-based removal)
  // For now: remove up to 3 pieces maximum (stub behavior)
  const maxRemovals = Math.min(3, placedPieces.length);
  
  for (let i = 0; i < maxRemovals; i++) {
    const piece = placedPieces[i];
    steps.push({
      type: 'REMOVE_PIECE',
      pieceUid: piece.uid,
      pieceId: piece.pieceId,
      placedByPlayerId: piece.placedBy,
      scoreDelta: -1,
    });
  }
  
  // Add completion message
  steps.push({ type: 'MESSAGE', text: 'Repair complete. Puzzle is now solvable.' });
  steps.push({ type: 'DONE', solvable: true });
  
  return steps;
}

/**
 * Default hint generation
 * Generates a hint piece suggestion for the given anchor using FitFinder
 */
async function defaultGenerateHint(
  state: GameState,
  anchor: Anchor
): Promise<HintSuggestion | null> {
  
  // Build container cells from puzzle spec
  const containerCells = new Set<string>(state.puzzleSpec.targetCellKeys);
  
  // Build occupied cells from board state
  const occupiedCells = new Set<string>();
  for (const piece of state.boardState.values()) {
    for (const cell of piece.cells) {
      occupiedCells.add(cellToKey(cell));
    }
  }
  
  // Check if anchor is valid (in container and not occupied)
  const anchorKey = cellToKey(anchor);
  if (!containerCells.has(anchorKey)) return null;
  if (occupiedCells.has(anchorKey)) return null;
  
  // Find available pieces in inventory
  const availablePieces: string[] = [];
  for (const [pieceId, count] of Object.entries(state.inventoryState)) {
    const placed = state.placedCountByPieceId[pieceId] ?? 0;
    const remaining = count === 99 ? 99 : count - placed;
    if (remaining > 0) {
      availablePieces.push(pieceId);
    }
  }
  
  if (availablePieces.length === 0) return null;
  
  // Load orientation service
  const orientationService = new GoldOrientationService();
  await orientationService.load();
  
  // Try each available piece until we find a valid fit
  for (const pieceId of availablePieces) {
    const orientations = orientationService.getOrientations(pieceId);
    if (!orientations || orientations.length === 0) continue;
    
    // Convert orientations to FitFinder format
    const fitOrientations: OrientationSpec[] = orientations.map(o => ({
      orientationId: o.orientationId,
      ijkOffsets: o.ijkOffsets,
    }));
    
    // Use FitFinder to find valid placements at anchor
    const fits = computeFits({
      containerCells,
      occupiedCells,
      anchor,
      pieceId,
      orientations: fitOrientations,
    });
    
    if (fits.length > 0) {
      const fit = fits[0]; // Take first valid fit
      
      return {
        pieceId,
        placement: {
          pieceId,
          orientationId: fit.orientationId,
          cells: fit.cells,
        },
        reasonText: `Hint: Place piece ${pieceId} at anchor`,
      };
    }
  }
  
  return null;
}

/**
 * Default puzzle completion check (Phase 3A-2)
 * Checks if all targetCells in puzzleSpec are covered by placed pieces
 */
function defaultIsPuzzleComplete(state: GameState): boolean {
  // Build set of occupied cells from all placed pieces
  const occupiedCells = new Set<string>();
  
  for (const piece of state.boardState.values()) {
    for (const cell of piece.cells) {
      occupiedCells.add(cellToKey(cell));
    }
  }
  
  // Check if all target cells are covered
  const targetCellKeys = state.puzzleSpec.targetCellKeys;
  const targetCount = targetCellKeys.size;
  let coveredCount = 0;
  
  for (const targetKey of targetCellKeys) {
    if (occupiedCells.has(targetKey)) {
      coveredCount++;
    }
  }
  
  const isComplete = coveredCount === targetCount;
  
  // Debug: uncomment to see completion status
  // console.log(`🏁 [GameDeps] Puzzle completion: ${coveredCount}/${targetCount} cells covered`);
  
  return isComplete;
}

// ============================================================================
// CREATE DEFAULT DEPENDENCIES
// ============================================================================

export function createDefaultDependencies(): GameDependencies {
  return {
    solvabilityCheck: defaultSolvabilityCheck,
    computeRepairPlan: defaultComputeRepairPlan,
    generateHint: defaultGenerateHint,
    isPuzzleComplete: defaultIsPuzzleComplete,
  };
}

// ============================================================================
// STUB DEPENDENCIES (for testing)
// ============================================================================

export function createStubDependencies(options: {
  alwaysSolvable?: boolean;
  alwaysUnsolvable?: boolean;
  alwaysUnknown?: boolean;
  repairSteps?: RepairStep[];
  hintSuggestion?: HintSuggestion | null;
  puzzleComplete?: boolean;
} = {}): GameDependencies {
  return {
    solvabilityCheck: async () => {
      if (options.alwaysUnsolvable) {
        return { status: 'unsolvable' };
      }
      if (options.alwaysUnknown) {
        return { status: 'unknown', reason: 'Stub: Always unknown' };
      }
      return { status: 'solvable' };
    },
    computeRepairPlan: (state) => {
      if (options.repairSteps) {
        return options.repairSteps;
      }
      return defaultComputeRepairPlan(state);
    },
    generateHint: async (state, anchor) => {
      if (options.hintSuggestion !== undefined) {
        return options.hintSuggestion;
      }
      return defaultGenerateHint(state, anchor);
    },
    isPuzzleComplete: (state) => {
      if (options.puzzleComplete !== undefined) {
        return options.puzzleComplete;
      }
      return defaultIsPuzzleComplete(state);
    },
  };
}
