// puzzleCategory — difficulty categories, derived from geometry, with an
// explicit stored override (admin "manager mode" can set/reassign; the
// stored puzzles.category wins over derivation when present).
//
// Tiers are honest facts of the shape, not vibes: flatness is geometric,
// tiers are sphere-count bands, and each band's search-space scale comes from
// docs/combinatorics.md (npm run combinatorics).

import { ijkToXyz } from '../lib/ijk';

export type PuzzleCategory = '2d' | 'easy' | 'medium' | 'hard' | 'impossible';

export const CATEGORY_META: Record<
  PuzzleCategory,
  { label: string; color: string; blurb: string }
> = {
  '2d': { label: '2D', color: '#38bdf8', blurb: 'Single layer — learn the moves' },
  easy: { label: 'Easy', color: '#10b981', blurb: 'Up to 16 spheres · ~10⁹ combinations' },
  medium: { label: 'Medium', color: '#feca57', blurb: '20–40 spheres · past 10¹² combinations' },
  hard: { label: 'Hard', color: '#f97316', blurb: '44–96 spheres · past 10³⁰ combinations' },
  impossible: { label: 'Nearly impossible', color: '#ef4444', blurb: '100+ spheres · past 10⁹⁰ combinations' },
};

export const CATEGORY_ORDER: PuzzleCategory[] = ['2d', 'easy', 'medium', 'hard', 'impossible'];

type IJK = { i: number; j: number; k: number };

/** All cells coplanar in world space (single-layer shape). */
export function isFlat(cells: IJK[]): boolean {
  if (!cells || cells.length === 0) return false;
  if (cells.length <= 3) return true;
  const pts = cells.map((c) => ijkToXyz(c));
  const [p0] = pts;
  // Find two independent direction vectors, then test all points against the
  // plane they span.
  let u: { x: number; y: number; z: number } | null = null;
  let n: { x: number; y: number; z: number } | null = null;
  for (let i = 1; i < pts.length; i++) {
    const v = { x: pts[i].x - p0.x, y: pts[i].y - p0.y, z: pts[i].z - p0.z };
    const len = Math.hypot(v.x, v.y, v.z);
    if (len < 1e-9) continue;
    if (!u) {
      u = v;
      continue;
    }
    const cross = {
      x: u.y * v.z - u.z * v.y,
      y: u.z * v.x - u.x * v.z,
      z: u.x * v.y - u.y * v.x,
    };
    if (Math.hypot(cross.x, cross.y, cross.z) > 1e-9) {
      n = cross;
      break;
    }
  }
  if (!n) return true; // all points collinear
  const nl = Math.hypot(n.x, n.y, n.z);
  return pts.every(
    (p) =>
      Math.abs((p.x - p0.x) * n.x + (p.y - p0.y) * n.y + (p.z - p0.z) * n.z) / nl < 1e-6
  );
}

/** Derive the category from shape facts (used when no stored override). */
export function derivePuzzleCategory(
  sphereCount: number,
  geometry?: IJK[] | null
): PuzzleCategory {
  if (geometry && geometry.length > 0 && isFlat(geometry)) return '2d';
  if (sphereCount <= 16) return 'easy';
  if (sphereCount <= 40) return 'medium';
  if (sphereCount <= 96) return 'hard';
  return 'impossible';
}

/** Stored override wins; otherwise derive. */
export function effectiveCategory(record: {
  category?: string | null;
  sphere_count?: number | null;
  shape_size?: number | null;
  geometry?: IJK[] | null;
}): PuzzleCategory {
  const stored = record.category as PuzzleCategory | null | undefined;
  if (stored && CATEGORY_ORDER.includes(stored)) return stored;
  const count = record.sphere_count ?? record.shape_size ?? record.geometry?.length ?? 0;
  return derivePuzzleCategory(count, record.geometry ?? undefined);
}
