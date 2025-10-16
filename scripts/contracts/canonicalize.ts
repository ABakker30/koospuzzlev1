// scripts/contracts/canonicalize.ts
// Deterministic canonicalization and hashing for Koos Puzzle contracts
// Implements rules from id-hashing.md

import { createHash } from 'crypto';

/**
 * Koos Shape contract (immutable geometry)
 */
export interface KoosShape {
  schema: 'koos.shape';
  version: 1;
  id?: string; // computed, not part of canonical form
  lattice: string;
  cells: number[][];
}

/**
 * Koos State contract (working config or solution)
 */
export interface KoosState {
  schema: 'koos.state';
  version: 1;
  id?: string; // computed, not part of canonical form
  shapeRef: string;
  placements: Array<{
    pieceId: string;
    anchorIJK: number[];
    orientationIndex: number;
  }>;
}

/**
 * Compare two [i,j,k] cells lexicographically
 */
function compareCells(a: number[], b: number[]): number {
  if (a[0] !== b[0]) return a[0] - b[0]; // i
  if (a[1] !== b[1]) return a[1] - b[1]; // j
  return a[2] - b[2]; // k
}

/**
 * Compare two placements for sorting
 * Sort by: pieceId → anchorIJK (i,j,k) → orientationIndex
 */
function comparePlacements(
  a: { pieceId: string; anchorIJK: number[]; orientationIndex: number },
  b: { pieceId: string; anchorIJK: number[]; orientationIndex: number }
): number {
  // 1. Compare pieceId (case-insensitive)
  const pidA = a.pieceId.toUpperCase();
  const pidB = b.pieceId.toUpperCase();
  if (pidA < pidB) return -1;
  if (pidA > pidB) return 1;

  // 2. Compare anchorIJK lexicographically
  const cellCmp = compareCells(a.anchorIJK, b.anchorIJK);
  if (cellCmp !== 0) return cellCmp;

  // 3. Compare orientationIndex
  return a.orientationIndex - b.orientationIndex;
}

/**
 * Deduplicate and sort cells lexicographically
 */
function canonicalizeCells(cells: number[][]): number[][] {
  // Deduplicate using Set with string keys
  const seen = new Set<string>();
  const unique: number[][] = [];

  for (const cell of cells) {
    const key = `${cell[0]},${cell[1]},${cell[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push([cell[0], cell[1], cell[2]]);
    }
  }

  // Sort lexicographically
  unique.sort(compareCells);
  return unique;
}

/**
 * Canonicalize placements: normalize pieceId casing and sort
 */
function canonicalizePlacements(
  placements: Array<{
    pieceId: string;
    anchorIJK: number[];
    orientationIndex: number;
  }>
): Array<{ pieceId: string; anchorIJK: number[]; orientationIndex: number }> {
  // Normalize pieceId to uppercase
  const normalized = placements.map((p) => ({
    pieceId: p.pieceId.toUpperCase(),
    anchorIJK: [p.anchorIJK[0], p.anchorIJK[1], p.anchorIJK[2]],
    orientationIndex: p.orientationIndex,
  }));

  // Sort
  normalized.sort(comparePlacements);
  return normalized;
}

/**
 * Serialize object with stable key order (alphabetical)
 * No whitespace, UTF-8 encoding
 */
function stableStringify(obj: any): string {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const items = obj.map(stableStringify);
    return `[${items.join(',')}]`;
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort(); // Alphabetical order
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
    return `{${pairs.join(',')}}`;
  }

  // Primitives
  return JSON.stringify(obj);
}

/**
 * Compute SHA256 hash of canonical JSON bytes
 * Returns "sha256:<hex>"
 */
function computeHash(canonicalJson: string): string {
  const hash = createHash('sha256');
  hash.update(canonicalJson, 'utf-8');
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Canonicalize and hash a Koos Shape
 * Returns the shape with computed ID
 */
export function canonicalizeShape(shape: Omit<KoosShape, 'id'>): KoosShape {
  // Canonicalize cells
  const cells = canonicalizeCells(shape.cells);

  // Build canonical object (no id field)
  const canonical = {
    schema: 'koos.shape' as const,
    version: 1 as const,
    lattice: shape.lattice,
    cells,
  };

  // Serialize and hash
  const canonicalJson = stableStringify(canonical);
  const id = computeHash(canonicalJson);

  return {
    ...canonical,
    id,
  };
}

/**
 * Canonicalize and hash a Koos State/Solution
 * Returns the state with computed ID
 */
export function canonicalizeState(state: Omit<KoosState, 'id'>): KoosState {
  // Canonicalize placements
  const placements = canonicalizePlacements(state.placements);

  // Build canonical object (no id field)
  const canonical = {
    schema: 'koos.state' as const,
    version: 1 as const,
    shapeRef: state.shapeRef,
    placements,
  };

  // Serialize and hash
  const canonicalJson = stableStringify(canonical);
  const id = computeHash(canonicalJson);

  return {
    ...canonical,
    id,
  };
}

/**
 * Verify idempotency: re-hash should produce the same ID
 * Returns true if idempotent, false otherwise
 */
export function verifyIdempotency(contract: KoosShape | KoosState): boolean {
  const original = contract.id;
  if (!original) return false;

  // Remove id and re-canonicalize
  const { id, ...withoutId } = contract;

  let recomputed: string;
  if (contract.schema === 'koos.shape') {
    const shape = canonicalizeShape(withoutId as Omit<KoosShape, 'id'>);
    recomputed = shape.id!;
  } else {
    const state = canonicalizeState(withoutId as Omit<KoosState, 'id'>);
    recomputed = state.id!;
  }

  return original === recomputed;
}
