import { useCallback } from 'react';
import type { IJK } from '../../../types/shape';
import type { PlacedPiece } from '../types/manualSolve';
import { useOrientationService } from './useOrientationService';
import { findFirstMatchingPiece } from '../utils/manualSolveMatch';
import { DEFAULT_PIECE_LIST } from '../utils/manualSolveHelpers';

function cellKey(c: IJK): string {
  return `${c.i},${c.j},${c.k}`;
}

interface ComputerMove {
  pieceId: string;
  orientationId: string;
  cells: IJK[];
}

export function useComputerMoveGenerator(
  puzzle?: any,
  placedCountByPieceId?: Record<string, number>
) {
  const {
    service: orientationService,
    loading: orientationsLoading,
    error: orientationsError,
  } = useOrientationService();

  const generateMove = useCallback(
    (placedPieces: PlacedPiece[]): ComputerMove | null => {
      if (!puzzle) return null;
      if (orientationsLoading || !orientationService || orientationsError) {
        return null;
      }

      const containerCells: IJK[] = (puzzle as any).geometry || [];
      if (!containerCells.length) return null;

      // Build occupied set from placedPieces
      const occupied = new Set<string>();
      for (const p of placedPieces) {
        for (const c of p.cells) {
          occupied.add(cellKey(c));
        }
      }

      const emptyCells = containerCells.filter(
        c => !occupied.has(cellKey(c))
      );

      if (emptyCells.length < 4) {
        return null;
      }

      // Filter pieces to only include unused ones (one-of-each rule)
      const availablePieces = placedCountByPieceId
        ? DEFAULT_PIECE_LIST.filter(p => !placedCountByPieceId[p] || placedCountByPieceId[p] === 0)
        : DEFAULT_PIECE_LIST;

      console.log(`🤖 Computer available pieces: ${availablePieces.length}/${DEFAULT_PIECE_LIST.length}`);

      if (availablePieces.length === 0) {
        console.log('🤖 No pieces available for computer');
        return null;
      }

      // Try random 4-cell groups a limited number of times
      const maxAttempts = 200;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // pick 4 distinct random indices
        const indices = new Set<number>();
        while (indices.size < 4) {
          const idx = Math.floor(Math.random() * emptyCells.length);
          indices.add(idx);
        }
        const group = Array.from(indices).map(i => emptyCells[i]);

        const match = findFirstMatchingPiece(group, availablePieces, orientationService);
        if (!match) {
          continue;
        }

        return {
          pieceId: match.pieceId,
          orientationId: match.orientationId,
          cells: group,
        };
      }

      // No move found within attempts
      return null;
    },
    [puzzle, orientationsLoading, orientationsError, orientationService, placedCountByPieceId]
  );

  const ready =
    !!puzzle && !!orientationService && !orientationsLoading && !orientationsError;

  return {
    generateMove,
    ready,
  };
}
