import type { IJK } from '../../../types/shape';
import { ijkToKey } from '../../../services/FitFinder';

/**
 * Check if two cells are FCC-adjacent.
 * In FCC, cells are neighbors if they differ by:
 * - ±1 in exactly one coordinate
 * - or ±1 in two coordinates (face diagonal)
 * - or (2,1,0) pattern (±2 in one, ±1 in another)
 */
export const areFCCAdjacent = (cell1: IJK, cell2: IJK): boolean => {
  const di = Math.abs(cell1.i - cell2.i);
  const dj = Math.abs(cell1.j - cell2.j);
  const dk = Math.abs(cell1.k - cell2.k);

  const oneCount = [di, dj, dk].filter(d => d === 1).length;
  const twoCount = [di, dj, dk].filter(d => d === 2).length;

  return (
    (oneCount === 1 && twoCount === 0) || // Single axis
    (oneCount === 2 && twoCount === 0) || // Face diagonal
    (oneCount === 1 && twoCount === 1) // (2,1,0) pattern
  );
};

/**
 * Normalize cells so the minimum i,j,k becomes (0,0,0).
 */
export const normalizeCells = (cells: IJK[]): IJK[] => {
  if (cells.length === 0) return [];

  const minI = Math.min(...cells.map(c => c.i));
  const minJ = Math.min(...cells.map(c => c.j));
  const minK = Math.min(...cells.map(c => c.k));

  return cells.map(c => ({
    i: c.i - minI,
    j: c.j - minJ,
    k: c.k - minK,
  }));
};

/**
 * Check if two normalized cell sets match (order-independent).
 */
export const cellsMatch = (cells1: IJK[], cells2: IJK[]): boolean => {
  if (cells1.length !== cells2.length) return false;

  const set1 = new Set(cells1.map(ijkToKey));
  const set2 = new Set(cells2.map(ijkToKey));

  if (set1.size !== set2.size) return false;
  for (const key of set1) {
    if (!set2.has(key)) return false;
  }
  return true;
};
