// Helper functions and constants for ManualSolvePage
import type { IJK } from '../../../types/shape';
import type { PlacedPiece } from '../types/manualSolve';

export const DEFAULT_PIECE_LIST = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y'
];

export const STANDARD_PIECE_COUNT = 25;

export const ijkToKey = (cell: IJK) => `${cell.i},${cell.j},${cell.k}`;

export function estimatePuzzleComplexity(
  containerCellCount: number,
  totalPieces: number
) {
  if (!containerCellCount || !totalPieces) {
    return {
      level: 'Unknown' as const,
      description: 'Not enough data yet to estimate complexity.',
      orderOfMagnitude: null as number | null,
    };
  }

  const exponent = Math.round(
    (containerCellCount / 4) * Math.log10(Math.max(totalPieces, 2))
  );

  let level: 'Easy' | 'Medium' | 'Hard' = 'Medium';
  if (exponent < 4) level = 'Easy';
  else if (exponent > 7) level = 'Hard';

  return {
    level,
    description:
      level === 'Easy'
        ? 'Likely solvable with some experimentation and a bit of patience.'
        : level === 'Medium'
        ? 'Requires careful placement and attention to symmetry.'
        : 'Large search space – expect to explore many options before finding a solution.',
    orderOfMagnitude: exponent,
  };
}

export function computeEmptyCells(
  cells: IJK[],
  placed: Map<string, PlacedPiece>
) {
  const occupied = new Set<string>();
  placed.forEach(piece => {
    piece.cells.forEach(c => occupied.add(ijkToKey(c)));
  });
  return cells.filter(c => !occupied.has(ijkToKey(c)));
}
