// src/services/shapeCanonical.ts
// Canonicalization and hashing for koos.shape@1 format
// Per /public/data/contracts/id-hashing.md

import type { KoosShape } from './shapeFormatReader';

/**
 * Canonicalize shape per contract rules:
 * 1. Sort cells lexicographically by [i, j, k]
 * 2. Remove duplicates
 * 3. Ensure stable key order (alphabetical)
 */
export function canonicalizeShape(
  shape: Omit<KoosShape, 'id'>
): Omit<KoosShape, 'id'> {
  // Sort cells lexicographically: compare i, then j, then k
  const sortedCells = [...shape.cells].sort((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0]; // Compare i
    if (a[1] !== b[1]) return a[1] - b[1]; // Compare j
    return a[2] - b[2]; // Compare k
  });
  
  // Remove duplicates (compare stringified cells)
  const uniqueCells: [number, number, number][] = [];
  const seen = new Set<string>();
  
  for (const cell of sortedCells) {
    const key = `${cell[0]},${cell[1]},${cell[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCells.push(cell);
    }
  }
  
  return {
    schema: 'koos.shape',
    version: 1,
    lattice: 'fcc',
    cells: uniqueCells
  };
}

/**
 * Compute content-addressed ID for a shape
 * 
 * Per contract: SHA-256 of canonical JSON (excluding id field)
 * Keys in alphabetical order at every level
 */
export async function computeShapeId(
  shape: Omit<KoosShape, 'id'>
): Promise<string> {
  // Serialize to canonical JSON (alphabetical keys, no id field)
  const canonical = JSON.stringify(shape, Object.keys(shape).sort());
  
  // Compute SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `sha256:${hashHex}`;
}

/**
 * Verify that a shape's ID matches its content
 */
export async function verifyShapeId(shape: KoosShape): Promise<boolean> {
  const { id, ...content } = shape;
  const canonical = canonicalizeShape(content);
  const computedId = await computeShapeId(canonical);
  return computedId === id;
}
