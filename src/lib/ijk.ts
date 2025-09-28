// IJK coordinate system utilities
import { IJK } from '../types/shape';

export type { IJK };

export const keyOf = (c: IJK) => `${c.i},${c.j},${c.k}`;

export const neighbors6 = (c: IJK): IJK[] => [
  { i:c.i+1, j:c.j,   k:c.k   },
  { i:c.i-1, j:c.j,   k:c.k   },
  { i:c.i,   j:c.j+1, k:c.k   },
  { i:c.i,   j:c.j-1, k:c.k   },
  { i:c.i,   j:c.j,   k:c.k+1 },
  { i:c.i,   j:c.j,   k:c.k-1 },
];

/**
 * Create a new IJK coordinate
 * @param i - I coordinate
 * @param j - J coordinate  
 * @param k - K coordinate
 * @returns IJK coordinate object
 */
export function createIJK(i: number, j: number, k: number): IJK {
  return { i, j, k };
}

/**
 * Add two IJK coordinates
 * @param a - First IJK coordinate
 * @param b - Second IJK coordinate
 * @returns Sum of the two coordinates
 */
export function addIJK(a: IJK, b: IJK): IJK {
  return { i: a.i + b.i, j: a.j + b.j, k: a.k + b.k };
}

/**
 * Subtract two IJK coordinates
 * @param a - First IJK coordinate
 * @param b - Second IJK coordinate
 * @returns Difference of the two coordinates
 */
export function subtractIJK(a: IJK, b: IJK): IJK {
  return { i: a.i - b.i, j: a.j - b.j, k: a.k - b.k };
}

/**
 * Check if two IJK coordinates are equal
 * @param a - First IJK coordinate
 * @param b - Second IJK coordinate
 * @returns True if coordinates are equal
 */
export function equalIJK(a: IJK, b: IJK): boolean {
  return a.i === b.i && a.j === b.j && a.k === b.k;
}

/**
 * @returns Manhattan distance
 */
export function manhattanDistance(a: IJK, b: IJK): number {
  return Math.abs(a.i - b.i) + Math.abs(a.j - b.j) + Math.abs(a.k - b.k);
}

/**
 * Get all 6 neighboring IJK coordinates
 * @param ijk - Center IJK coordinate
 * @returns Array of 6 neighboring coordinates
 */
export function getNeighbors(ijk: IJK): IJK[] {
  return neighbors6(ijk);
}

/**
 * Convert IJK coordinates to XYZ coordinates using FCC lattice transform
 * This is a simple FCC transform where each unit cell has edge length 1
 */
export function ijkToXyz(ijk: IJK): { x: number; y: number; z: number } {
  // FCC lattice transformation
  // In FCC, the basis vectors are:
  // a1 = (0.5, 0.5, 0)
  // a2 = (0.5, 0, 0.5) 
  // a3 = (0, 0.5, 0.5)
  const { i, j, k } = ijk;
  
  return {
    x: 0.5 * (i + j),
    y: 0.5 * (i + k), 
    z: 0.5 * (j + k)
  };
}
