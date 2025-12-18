import * as THREE from 'three';
import type { ViewTransforms } from '../../services/ViewTransforms';

/** White marble palette for movies */
export const WHITE_MARBLE_PALETTE = [
  0xf9fafb, // Very light gray-white
  0xf3f4f6, // Light gray-white
  0xe5e7eb, // Soft gray-white
  0xe7e5e4, // Warm gray-white
  0xf5f5f4, // Neutral white
  0xfafaf9, // Bright white
  0xf1f0ef, // Cream white
];

/** Vibrant color palette (exact copy from Solution Viewer) */
export const VIBRANT_COLORS = [
  0xff0000, // Bright Red
  0x00ff00, // Bright Green  
  0x0080ff, // Bright Blue
  0xffff00, // Bright Yellow
  0xff8000, // Orange
  0x8000ff, // Purple
  0xff0080, // Hot Pink
  0x00ffff, // Cyan
  0x80ff00, // Lime Green
  0xff4080, // Rose
  0x4080ff, // Sky Blue
  0xffc000, // Gold
  0xc000ff, // Violet
  0x00ff80, // Spring Green
  0xff8040, // Coral
  0x8040ff, // Blue Violet
  0x40ff80, // Sea Green
  0xff4000, // Red Orange
  0x0040ff, // Royal Blue
  0x80ff40, // Yellow Green
  0xff0040, // Crimson
  0x4000ff, // Indigo
  0x00c0ff, // Deep Sky Blue
  0xc0ff00, // Chartreuse
  0xff00c0  // Magenta
];

/** Generate highly distinct colors for up to 25+ pieces using optimized HSL distribution (Solution Viewer parity) */
export function getPieceColor(pieceId: string, theme?: 'default' | 'whiteMarbleCluster'): number {
  let hash = 0;
  for (let i = 0; i < pieceId.length; i++) {
    hash = (hash * 31 + pieceId.charCodeAt(i)) >>> 0;
  }
  
  // White marble theme for movies
  if (theme === 'whiteMarbleCluster') {
    const colorIndex = hash % WHITE_MARBLE_PALETTE.length;
    return WHITE_MARBLE_PALETTE[colorIndex];
  }
  
  // Select color based on hash
  const colorIndex = hash % VIBRANT_COLORS.length;
  return VIBRANT_COLORS[colorIndex];
}

export function mat4ToThree(M: number[][]): THREE.Matrix4 { 
  return new THREE.Matrix4().set(
    M[0][0], M[0][1], M[0][2], M[0][3],
    M[1][0], M[1][1], M[1][2], M[1][3],
    M[2][0], M[2][1], M[2][2], M[2][3],
    M[3][0], M[3][1], M[3][2], M[3][3]
  );
}

export function estimateSphereRadiusFromView(view: ViewTransforms): number {
  // sample ijk (0,0,0) and (1,0,0) through M_world, distance/2
  const toV3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(mat4ToThree(view.M_world));
  const p0 = toV3(0, 0, 0), p1 = toV3(1, 0, 0);
  const distance = p0.distanceTo(p1);
  const radius = distance / 2;
  return radius;
}
