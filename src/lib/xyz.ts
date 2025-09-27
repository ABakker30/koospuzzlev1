// XYZ coordinate system utilities
import { XYZ, IJK } from '../types/shape';

/**
 * Create a new XYZ coordinate
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param z - Z coordinate
 * @returns XYZ coordinate object
 */
export function createXYZ(x: number, y: number, z: number): XYZ {
  return { x, y, z };
}

/**
 * Convert IJK coordinates to XYZ world coordinates
 * @param ijk - IJK coordinate to convert
 * @param cellSize - Size of each cell in world units
 * @returns XYZ world coordinate
 */
export function ijkToXYZ(ijk: IJK, cellSize: number = 1): XYZ {
  return {
    x: ijk.i * cellSize,
    y: ijk.j * cellSize,
    z: ijk.k * cellSize,
  };
}

/**
 * Convert XYZ world coordinates to IJK coordinates
 * @param xyz - XYZ coordinate to convert
 * @param cellSize - Size of each cell in world units
 * @returns IJK grid coordinate
 */
export function xyzToIJK(xyz: XYZ, cellSize: number = 1): IJK {
  return {
    i: Math.round(xyz.x / cellSize),
    j: Math.round(xyz.y / cellSize),
    k: Math.round(xyz.z / cellSize),
  };
}

/**
 * Add two XYZ coordinates
 * @param a - First XYZ coordinate
 * @param b - Second XYZ coordinate
 * @returns Sum of the two coordinates
 */
export function addXYZ(a: XYZ, b: XYZ): XYZ {
  // TODO: Implement XYZ addition logic
  console.log('xyz.addXYZ - Not implemented yet', { a, b });
  return { x: 0, y: 0, z: 0 };
}

/**
 * Calculate distance between two XYZ coordinates
 * @param a - First XYZ coordinate
 * @param b - Second XYZ coordinate
 * @returns Euclidean distance
 */
export function distance(a: XYZ, b: XYZ): number {
  // TODO: Implement distance calculation logic
  console.log('xyz.distance - Not implemented yet', { a, b });
  return 0;
}

/**
 * Normalize an XYZ vector
 * @param xyz - XYZ vector to normalize
 * @returns Normalized XYZ vector
 */
export function normalize(xyz: XYZ): XYZ {
  // TODO: Implement vector normalization logic
  console.log('xyz.normalize - Not implemented yet', { xyz });
  return { x: 0, y: 0, z: 0 };
}
