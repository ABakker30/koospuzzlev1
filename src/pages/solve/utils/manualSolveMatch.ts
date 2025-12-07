import type { IJK } from '../../../types/shape';
import { GoldOrientationService } from '../../../services/GoldOrientationService';
import { normalizeCells, cellsMatch } from './manualSolveCells';

export type PieceMatch = {
  pieceId: string;
  orientationId: string;
};

/**
 * Given drawnCells and a set of piece IDs, find the first
 * piece/orientation whose normalized offsets match the normalized
 * drawn cells. Returns null if no match is found.
 */
export const findFirstMatchingPiece = (
  drawnCells: IJK[],
  pieceIds: string[],
  svc: GoldOrientationService
): PieceMatch | null => {
  if (drawnCells.length === 0 || pieceIds.length === 0) return null;

  // Normalize the drawn shape once
  const normalizedDrawn = normalizeCells(drawnCells);

  for (const pieceId of pieceIds) {
    const orientations = svc.getOrientations(pieceId);
    if (!orientations || orientations.length === 0) continue;

    for (const ori of orientations) {
      const normalizedOri = normalizeCells(ori.ijkOffsets);
      if (cellsMatch(normalizedDrawn, normalizedOri)) {
        return {
          pieceId,
          orientationId: ori.orientationId,
        };
      }
    }
  }

  return null;
};
