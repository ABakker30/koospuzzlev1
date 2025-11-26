// Utility for sorting pieces by Y-coordinate (centroid-based)
// Used for reveal slider to build pieces from ground up

import { IJK } from '../types/shape';

/**
 * Apply a 4x4 transformation matrix to a point
 */
function applyMatrix4(matrix: number[][], x: number, y: number, z: number): { x: number; y: number; z: number } {
  const w = matrix[3][0] * x + matrix[3][1] * y + matrix[3][2] * z + matrix[3][3];
  return {
    x: (matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z + matrix[0][3]) / w,
    y: (matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z + matrix[1][3]) / w,
    z: (matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z + matrix[2][3]) / w
  };
}

/**
 * Calculate the centroid Y coordinate for a piece in VISUAL space
 * @param cells - Array of IJK cells that make up the piece
 * @param ijkToXyz - Transformation function from IJK to XYZ (world space)
 * @param viewMatrix - Optional 4x4 view transformation matrix for final orientation
 * @returns The Y coordinate of the piece's centroid in visual space
 */
export function calculatePieceCentroidY(
  cells: IJK[],
  ijkToXyz: (ijk: IJK) => { x: number; y: number; z: number },
  viewMatrix?: number[][]
): number {
  if (!cells || cells.length === 0) return 0;
  
  let sumY = 0;
  for (const cell of cells) {
    const xyz = ijkToXyz(cell);
    
    // Apply view transformation if provided (for auto-oriented puzzles)
    if (viewMatrix) {
      const transformed = applyMatrix4(viewMatrix, xyz.x, xyz.y, xyz.z);
      sumY += transformed.y;
    } else {
      sumY += xyz.y;
    }
  }
  
  return sumY / cells.length;
}

/**
 * Sort placed pieces by centroid Y (lowest to highest) in VISUAL space
 * Secondary sort by placedAt for deterministic ordering
 * @param pieces - Array of placed pieces to sort (must have cells and placedAt)
 * @param ijkToXyz - Transformation function from IJK to XYZ
 * @param viewMatrix - Optional 4x4 view transformation matrix for auto-oriented puzzles
 * @returns Sorted array (does not mutate original)
 */
export function sortPiecesByHeight<T extends { cells: IJK[]; placedAt: number }>(
  pieces: T[],
  ijkToXyz: (ijk: IJK) => { x: number; y: number; z: number },
  viewMatrix?: number[][]
): T[] {
  // Calculate centroid Y for each piece once (in visual space if viewMatrix provided)
  const piecesWithHeight = pieces.map(piece => ({
    piece,
    centroidY: calculatePieceCentroidY(piece.cells, ijkToXyz, viewMatrix)
  }));
  
  // Sort by centroid Y (ascending), then by placedAt for deterministic ordering
  piecesWithHeight.sort((a, b) => {
    const yDiff = a.centroidY - b.centroidY;
    if (Math.abs(yDiff) > 0.001) { // Use small epsilon for float comparison
      return yDiff;
    }
    // If same height, fall back to placement order
    return a.piece.placedAt - b.piece.placedAt;
  });
  
  return piecesWithHeight.map(item => item.piece);
}
