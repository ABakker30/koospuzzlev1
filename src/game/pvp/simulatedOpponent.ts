// src/game/pvp/simulatedOpponent.ts
// Simulated AI opponent for "Random Match" mode
// Plays like a human: varied timing, sparse hints, no solvability checks

import type { IJK } from '../../types/shape';
import type { PvPPlacedPiece } from './types';
import { computeFits, type OrientationSpec } from '../../services/FitFinder';
import { GoldOrientationService } from '../../services/GoldOrientationService';
import { cellToKey } from '../puzzle/PuzzleTypes';

// ============================================================================
// TYPES
// ============================================================================

export interface SimulatedMoveResult {
  type: 'place' | 'hint' | 'check' | 'pass';
  pieceId?: string;
  orientationId?: string;
  cells?: IJK[];
  thinkingDelayMs: number; // How long to "think" before making the move
}

interface BoardContext {
  containerCells: Set<string>;
  occupiedCells: Set<string>;
  emptyCells: IJK[];
  inventoryState: Record<string, number>;
  placedCount: Record<string, number>;
  boardPieces: PvPPlacedPiece[];
}

// ============================================================================
// THINKING TIME SIMULATION
// ============================================================================

/**
 * Generate a realistic "thinking" delay
 * Early game: faster moves (3-6s)
 * Mid game: moderate (5-10s)
 * Late game: slower, more careful (8-15s)
 * Occasional quick moves and long pauses
 */
function getThinkingDelay(emptyCount: number, totalCells: number): number {
  const progress = 1 - (emptyCount / totalCells); // 0 = start, 1 = almost done
  
  // Base range depends on game progress
  let minMs: number, maxMs: number;
  if (progress < 0.3) {
    // Early game - confident moves
    minMs = 3000;
    maxMs = 7000;
  } else if (progress < 0.7) {
    // Mid game - thinking more
    minMs = 5000;
    maxMs = 12000;
  } else {
    // Late game - careful consideration
    minMs = 7000;
    maxMs = 15000;
  }
  
  // 15% chance of a quick "snap decision"
  if (Math.random() < 0.15) {
    return 2000 + Math.random() * 2000;
  }
  
  // 10% chance of a long pause (thinking hard)
  if (Math.random() < 0.10) {
    return maxMs + Math.random() * 5000;
  }
  
  return minMs + Math.random() * (maxMs - minMs);
}

// ============================================================================
// MOVE GENERATION (Human-like, no solvability checks)
// ============================================================================

let orientationServiceInstance: GoldOrientationService | null = null;

async function getOrientationService(): Promise<GoldOrientationService> {
  if (!orientationServiceInstance) {
    orientationServiceInstance = new GoldOrientationService();
    await orientationServiceInstance.load();
  }
  return orientationServiceInstance;
}

/**
 * Find all valid placements for available pieces at empty cells
 * Does NOT check solvability - just geometric fit (like a human guessing)
 */
async function findValidPlacements(
  ctx: BoardContext,
  exhaustive: boolean = false
): Promise<Array<{ pieceId: string; orientationId: string; cells: IJK[]; anchor: IJK }>> {
  const orientationService = await getOrientationService();
  const placements: Array<{ pieceId: string; orientationId: string; cells: IJK[]; anchor: IJK }> = [];
  
  // Get available pieces
  const availablePieces: string[] = [];
  for (const [pieceId, count] of Object.entries(ctx.inventoryState)) {
    const placed = ctx.placedCount[pieceId] ?? 0;
    const remaining = count === 99 ? 99 : count - placed;
    if (remaining > 0) {
      availablePieces.push(pieceId);
    }
  }
  
  if (availablePieces.length === 0) return [];
  
  // Sample a subset of empty cells to try (don't check all - humans don't)
  // In exhaustive mode, try ALL empty cells
  const cellsToTry = [...ctx.emptyCells];
  shuffleArray(cellsToTry);
  const sampledCells = exhaustive ? cellsToTry : cellsToTry.slice(0, Math.min(15, cellsToTry.length));
  
  // Also shuffle pieces (humans don't try alphabetically)
  const shuffledPieces = [...availablePieces];
  shuffleArray(shuffledPieces);
  
  for (const anchor of sampledCells) {
    for (const pieceId of shuffledPieces) {
      const orientations = orientationService.getOrientations(pieceId);
      if (!orientations || orientations.length === 0) continue;
      
      const fitOrientations: OrientationSpec[] = orientations.map(o => ({
        orientationId: o.orientationId,
        ijkOffsets: o.ijkOffsets,
      }));
      
      const fits = computeFits({
        containerCells: ctx.containerCells,
        occupiedCells: ctx.occupiedCells,
        anchor,
        pieceId,
        orientations: fitOrientations,
      });
      
      for (const fit of fits) {
        placements.push({
          pieceId,
          orientationId: fit.orientationId,
          cells: fit.cells,
          anchor,
        });
      }
      
      // Don't find ALL placements - stop after finding enough (human-like)
      if (placements.length >= 20) break;
    }
    if (placements.length >= 20) break;
  }
  
  return placements;
}

/**
 * Generate a simulated opponent move
 * Strategy:
 * - ~85% of the time: find a valid placement (no solvability check)
 * - ~5% of the time: use hint (sparingly)
 * - ~10% of the time: pick a suboptimal placement (not the most constrained cell)
 */
export async function generateSimulatedMove(
  containerCellKeys: Set<string>,
  containerCells: IJK[],
  boardPieces: PvPPlacedPiece[],
  inventoryState: Record<string, number>,
  placedCount: Record<string, number>
): Promise<SimulatedMoveResult> {
  // Build context
  const occupiedCells = new Set<string>();
  for (const piece of boardPieces) {
    for (const cell of piece.cells) {
      occupiedCells.add(cellToKey(cell));
    }
  }
  
  const emptyCells: IJK[] = containerCells.filter(c => !occupiedCells.has(cellToKey(c)));
  const totalCells = containerCells.length;
  const thinkingDelay = getThinkingDelay(emptyCells.length, totalCells);
  
  if (emptyCells.length === 0) {
    return { type: 'pass', thinkingDelayMs: 2000 };
  }
  
  const ctx: BoardContext = {
    containerCells: containerCellKeys,
    occupiedCells,
    emptyCells,
    inventoryState,
    placedCount,
    boardPieces,
  };
  
  // Decide action: 5% chance to use hint (sparingly, like a human)
  const roll = Math.random();
  if (roll < 0.05 && emptyCells.length > 4) {
    return {
      type: 'hint',
      thinkingDelayMs: thinkingDelay + 2000, // Extra delay for "deciding to use hint"
    };
  }
  
  // Find valid placements (samples a subset of cells, human-like)
  let placements = await findValidPlacements(ctx);
  
  // If sampling found nothing, try ALL empty cells exhaustively
  if (placements.length === 0) {
    placements = await findValidPlacements(ctx, true);
  }

  if (placements.length === 0) {
    // Truly no valid placements exist - use hint (always play a piece)
    return {
      type: 'hint',
      thinkingDelayMs: thinkingDelay + 2000,
    };
  }
  
  // Pick a placement
  // 70% chance: pick a "good" placement (most constrained area)
  // 30% chance: pick a random one (suboptimal, human-like)
  let chosen;
  if (Math.random() < 0.7 && placements.length > 1) {
    // "Good" strategy: prefer placements near existing pieces (more constrained)
    chosen = pickConstrainedPlacement(placements, occupiedCells);
  } else {
    // Random pick
    chosen = placements[Math.floor(Math.random() * placements.length)];
  }
  
  return {
    type: 'place',
    pieceId: chosen.pieceId,
    orientationId: chosen.orientationId,
    cells: chosen.cells,
    thinkingDelayMs: thinkingDelay,
  };
}

/**
 * Pick a placement that's near existing pieces (more constrained = smarter)
 */
function pickConstrainedPlacement(
  placements: Array<{ pieceId: string; orientationId: string; cells: IJK[]; anchor: IJK }>,
  occupiedCells: Set<string>
): typeof placements[0] {
  // Score each placement by how many neighbors are occupied
  const scored = placements.map(p => {
    let neighborCount = 0;
    for (const cell of p.cells) {
      const neighbors = getNeighborKeys(cell);
      for (const n of neighbors) {
        if (occupiedCells.has(n)) neighborCount++;
      }
    }
    return { placement: p, score: neighborCount };
  });
  
  // Sort by score descending and pick from top 3
  scored.sort((a, b) => b.score - a.score);
  const topN = Math.min(3, scored.length);
  const idx = Math.floor(Math.random() * topN);
  return scored[idx].placement;
}

/**
 * Get FCC lattice neighbor keys for a cell
 */
function getNeighborKeys(cell: IJK): string[] {
  const { i, j, k } = cell;
  const offsets = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    [1, -1, 0], [-1, 1, 0], [1, 0, -1], [-1, 0, 1], [0, 1, -1], [0, -1, 1],
  ];
  return offsets.map(([di, dj, dk]) => `${i + di},${j + dj},${k + dk}`);
}

/**
 * Fisher-Yates shuffle
 */
function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
