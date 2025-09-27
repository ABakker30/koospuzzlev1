// IJK coordinate system utilities
import { IJK } from '../types/shape';

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
 * Calculate Manhattan distance between two IJK coordinates
 * @param a - First IJK coordinate
 * @param b - Second IJK coordinate
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
  return [
    { i: ijk.i + 1, j: ijk.j, k: ijk.k }, // +i
    { i: ijk.i - 1, j: ijk.j, k: ijk.k }, // -i
    { i: ijk.i, j: ijk.j + 1, k: ijk.k }, // +j
    { i: ijk.i, j: ijk.j - 1, k: ijk.k }, // -j
    { i: ijk.i, j: ijk.j, k: ijk.k + 1 }, // +k
    { i: ijk.i, j: ijk.j, k: ijk.k - 1 }, // -k
  ];
}
