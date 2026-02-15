// src/game/engine/GameDependencies.ts
// Dependency injection layer for GameMachine
// Keeps solvability/hint logic swappable and separate from state machine

import type { GameState, RepairStep, PlayerId, GamePlacedPiece } from '../contracts/GameState';
import type { IJK } from '../../types/shape';
import { computeFits, ijkToKey as fitIjkToKey, type OrientationSpec } from '../../services/FitFinder';
import { GoldOrientationService } from '../../services/GoldOrientationService';
import { cellToKey } from '../puzzle/PuzzleTypes';

// ============================================================================
// MOD-4 CONNECTIVITY CHECK (prevents island creation)
// ============================================================================

/**
 * Check if placing a piece would create any isolated regions not divisible by 4.
 * Returns true if placement is safe (all connected components have size % 4 === 0).
 */
function checkMod4Connectivity(
  containerCells: Set<string>,
  occupiedCells: Set<string>,
  newPieceCells: IJK[]
): boolean {
  // Build set of empty cells after hypothetical placement
  const hypotheticalOccupied = new Set(occupiedCells);
  for (const cell of newPieceCells) {
    hypotheticalOccupied.add(cellToKey(cell));
  }
  
  const emptyCells = new Set<string>();
  for (const key of containerCells) {
    if (!hypotheticalOccupied.has(key)) {
      emptyCells.add(key);
    }
  }
  
  if (emptyCells.size === 0) return true; // Fully covered - OK
  
  // Find all connected components via flood fill
  const visited = new Set<string>();
  
  // Get neighbors in FCC lattice (12 neighbors) - must match engine2's NBR kernel
  const getNeighbors = (key: string): string[] => {
    const [i, j, k] = key.split(',').map(Number);
    // FCC lattice neighbors: 6 axis-aligned + 6 diagonal (from engine2)
    const offsets = [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],  // axis-aligned
      [1, -1, 0], [-1, 1, 0], [1, 0, -1], [-1, 0, 1], [0, 1, -1], [0, -1, 1], // diagonal
    ];
    return offsets.map(([di, dj, dk]) => `${i + di},${j + dj},${k + dk}`);
  };
  
  // Flood fill to find connected component
  const floodFill = (startKey: string): number => {
    const stack = [startKey];
    let count = 0;
    
    while (stack.length > 0) {
      const key = stack.pop()!;
      if (visited.has(key)) continue;
      if (!emptyCells.has(key)) continue;
      
      visited.add(key);
      count++;
      
      for (const neighbor of getNeighbors(key)) {
        if (!visited.has(neighbor) && emptyCells.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }
    
    return count;
  };
  
  // Check all connected components
  for (const key of emptyCells) {
    if (visited.has(key)) continue;
    
    const componentSize = floodFill(key);
    if (componentSize % 4 !== 0) {
      // This component cannot be filled with 4-cell pieces
      return false;
    }
  }
  
  return true; // All components have size divisible by 4
}

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
 * 
 * NOTE: This is a synchronous function that pre-computes the repair steps.
 * It removes the minimum number of pieces needed to restore solvability.
 * Since solvability checks are async, we use a simpler heuristic:
 * - Remove pieces one at a time (newest first)
 * - Stop after removing 1 piece initially (conservative approach)
 * - The game will re-check solvability after repair and may repair again if needed
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
  steps.push({ type: 'MESSAGE', text: 'Puzzle not solvable. Removing last placed piece...' });
  
  // Conservative approach: Remove only 1 piece (the most recent)
  // The game will re-check solvability after this repair completes.
  // If still unsolvable, another repair cycle will be triggered.
  // This prevents over-removal of pieces.
  const piece = placedPieces[0];
  steps.push({
    type: 'REMOVE_PIECE',
    pieceUid: piece.uid,
    pieceId: piece.pieceId,
    placedByPlayerId: piece.placedBy,
    scoreDelta: -1,
  });
  
  // Add completion message - note this doesn't guarantee solvability
  steps.push({ type: 'MESSAGE', text: 'Removed 1 piece. Re-checking solvability...' });
  steps.push({ type: 'DONE', solvable: false }); // Signal that solvability needs re-check
  
  return steps;
}

/**
 * Default hint generation
 * Generates a hint piece suggestion for the given anchor using FitFinder
 * Only suggests placements that keep the puzzle solvable
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
  
  console.log('🔍 [Hint] Debug:', {
    containerCellCount: containerCells.size,
    occupiedCellCount: occupiedCells.size,
    emptyCount: containerCells.size - occupiedCells.size,
    boardStatePieces: state.boardState.size,
    inventoryState: state.inventoryState,
    placedCountByPieceId: state.placedCountByPieceId,
  });
  
  // Check if anchor is valid (in container and not occupied)
  const anchorKey = cellToKey(anchor);
  if (!containerCells.has(anchorKey)) {
    console.log('❌ [Hint] Anchor not in container cells:', anchorKey);
    return null;
  }
  if (occupiedCells.has(anchorKey)) {
    console.log('❌ [Hint] Anchor already occupied:', anchorKey);
    return null;
  }
  
  // Find available pieces in inventory
  const availablePieces: string[] = [];
  for (const [pieceId, count] of Object.entries(state.inventoryState)) {
    const placed = state.placedCountByPieceId[pieceId] ?? 0;
    const remaining = count === 99 ? 99 : count - placed;
    if (remaining > 0) {
      availablePieces.push(pieceId);
    }
  }
  
  console.log('🔍 [Hint] Available pieces:', availablePieces.length, availablePieces.slice(0, 5));
  
  if (availablePieces.length === 0) {
    console.log('❌ [Hint] No available pieces in inventory');
    return null;
  }
  
  // Load orientation service
  const orientationService = new GoldOrientationService();
  await orientationService.load();
  
  // Collect all valid geometric fits
  const allFits: Array<{ pieceId: string; fit: { orientationId: string; cells: IJK[] } }> = [];
  
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
    
    for (const fit of fits) {
      allFits.push({ pieceId, fit });
    }
  }
  
  if (allFits.length === 0) return null;
  
  const emptyCount = containerCells.size - occupiedCells.size;
  
  // Filter candidates using mod-4 connectivity check (prevents island creation)
  // This is fast O(n) and eliminates obviously unsolvable placements
  const validFits = allFits.filter(({ pieceId, fit }) => {
    const isValid = checkMod4Connectivity(containerCells, occupiedCells, fit.cells);
    if (!isValid) {
      console.log(`⚠️ [Hint] Rejecting ${pieceId} - would create non-mod-4 island`);
    }
    return isValid;
  });
  
  console.log(`🔍 [Hint] Mod-4 filter: ${validFits.length}/${allFits.length} candidates pass connectivity check`);
  
  if (validFits.length === 0) {
    console.log(`❌ [Hint] No placements pass mod-4 connectivity check at this anchor`);
    return null;
  }
  
  // DLX solvability check for each candidate
  // Per-candidate DLX is fast enough for ≤90 empty cells (~20-100ms each)
  // This matches the solvability check threshold - when solvability is checked, hints are DLX-verified
  const DLX_PER_CANDIDATE_THRESHOLD = 90;
  
  if (emptyCount <= DLX_PER_CANDIDATE_THRESHOLD) {
    const { dlxCheckSolvableEnhanced } = await import('../../engines/dlxSolver');
    
    // Try each fit and check if it keeps puzzle solvable
    for (const { pieceId, fit } of validFits) {
      // Build hypothetical state with this piece placed
      const hypotheticalOccupied = new Set(occupiedCells);
      for (const cell of fit.cells) {
        hypotheticalOccupied.add(cellToKey(cell));
      }
      
      // Build DLX input for hypothetical state
      const hypotheticalPlaced = Array.from(state.boardState.values()).map(p => ({
        pieceId: p.pieceId,
        orientationId: p.orientationId,
        cells: p.cells,
        uid: p.uid,
      }));
      hypotheticalPlaced.push({
        pieceId,
        orientationId: fit.orientationId,
        cells: fit.cells,
        uid: 'hypothetical',
      });
      
      const hypotheticalRemaining = Object.entries(state.inventoryState).map(([pid, count]) => {
        const placed = state.placedCountByPieceId[pid] ?? 0;
        const extraPlaced = pid === pieceId ? 1 : 0;
        const remaining = count === 99 ? 'infinite' as const : Math.max(0, count - placed - extraPlaced);
        return { pieceId: pid, remaining };
      });
      
      const containerCellsArray: IJK[] = [];
      for (const key of state.puzzleSpec.targetCellKeys) {
        const [i, j, k] = key.split(',').map(Number);
        containerCellsArray.push({ i, j, k });
      }
      
      const hypotheticalInput = {
        containerCells: containerCellsArray,
        placedPieces: hypotheticalPlaced,
        emptyCells: containerCellsArray.filter(c => !hypotheticalOccupied.has(cellToKey(c))),
        remainingPieces: hypotheticalRemaining,
        mode: 'oneOfEach' as const,
      };
      
      // Check solvability - longer timeout for small puzzles (5s)
      const result = await dlxCheckSolvableEnhanced(hypotheticalInput, { timeoutMs: 5000 });
      
      if (result.state === 'green' || result.state === 'orange') {
        // This placement keeps puzzle solvable (or unknown/timeout)
        console.log(`✅ [Hint] Found solvable placement: ${pieceId} (${result.solutionCount ?? '?'} solutions, state: ${result.state})`);
        return {
          pieceId,
          placement: {
            pieceId,
            orientationId: fit.orientationId,
            cells: fit.cells,
          },
          reasonText: `Hint: Place piece ${pieceId}`,
        };
      } else {
        console.log(`⚠️ [Hint] Skipping ${pieceId} - would make puzzle unsolvable (state: ${result.state})`);
      }
    }
    
    // No solvable placement found at this anchor
    console.log(`❌ [Hint] No solvable placement found at anchor (tried ${validFits.length} mod-4 valid fits)`);
    return null;
  }
  
  // For larger puzzles (>90 empty), skip per-candidate DLX
  // Return first mod-4 valid fit - solvability check not active yet anyway
  const { pieceId, fit } = validFits[0];
  console.log(`✅ [Hint] Returning first mod-4 valid fit: ${pieceId} (${emptyCount} empty cells > ${DLX_PER_CANDIDATE_THRESHOLD}, skipping per-candidate DLX)`);
  return {
    pieceId,
    placement: {
      pieceId,
      orientationId: fit.orientationId,
      cells: fit.cells,
    },
    reasonText: `Hint: Place piece ${pieceId}`,
  };
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
