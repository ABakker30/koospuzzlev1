// Physical-buildability analysis for FCC shapes.
//
// When a puzzle is assembled with real (physical) pieces, gravity acts at
// every step: a sphere only stays put if it rests on the table or in a
// pocket of spheres below it. This module classifies a shape once, at
// creation time, so the app never has to ask the question again — the
// verdict is stored in puzzles.physical_support and drives whether solo
// play offers a "Physical build" option.
//
// Model (matches the game view's ijkToXyz): height y = 0.5*(i+k), so
// level L = i+k. Constant-L planes are square-packed layers; a sphere at
// level L rests in a pocket of up to 4 spheres at level L-1, at ijk
// offsets (-1,0,0), (0,0,-1), (-1,+1,0), (0,+1,-1). The bottom level
// rests on the table. Analysis is combinatorial (no physics engine) and
// runs in O(cells).
//
// Verdicts:
//   any_order        - every non-floor sphere rests in a solid pocket
//                      (below-contacts spanning both horizontal axes):
//                      any solution is physically stable; only assembly
//                      order matters.
//   needs_anchoring  - the shape has flare, overhang, or thin-wall regions
//                      (spheres with no contact below, a single contact, or
//                      only a collinear groove they can roll out of): those
//                      spheres are only held by their piece's rigidity, so
//                      solutions must route anchored pieces through them
//                      and be built in order.
//   not_freestanding - the shape stands on fewer than 3 spheres (point or
//                      edge balance): it cannot be assembled freestanding
//                      in this orientation at all.
import type { IJK } from '../types/shape';

/** Offsets (in ijk) of the up-to-4 pocket spheres one level below a cell,
 *  tagged with the horizontal axis the contact acts along. The four
 *  supporters sit in the four cardinal horizontal directions; a sphere is
 *  only SOLIDLY pocketed if its contacts span both axes — two contacts on
 *  the same axis (a one-sphere-thick vertical wall) form a knife-edge
 *  groove the sphere can roll out of sideways. */
const BELOW: ReadonlyArray<{ off: readonly [number, number, number]; axis: 'x' | 'z' }> = [
  { off: [-1, 0, 0], axis: 'x' },
  { off: [0, 1, -1], axis: 'x' },
  { off: [0, 0, -1], axis: 'z' },
  { off: [-1, 1, 0], axis: 'z' },
];

export type PhysicalSupportVerdict = 'any_order' | 'needs_anchoring' | 'not_freestanding';

export interface PhysicalSupportReport {
  /** Analysis schema version (bump when the rule changes). */
  version: 1;
  verdict: PhysicalSupportVerdict;
  /** Spheres in the bottom layer (rest on the table). */
  floorCells: number;
  /** Number of layers (bottom level .. top level). */
  levels: number;
  /** Non-floor spheres with zero contacts below (held only by their piece). */
  zeroSupportCells: number;
  /** Non-floor spheres whose below-contacts don't span both horizontal
   *  axes: a single contact (point balance) or a collinear pair (the
   *  thin-wall groove a piece can roll out of). */
  weakSupportCells: number;
}

export function analyzePhysicalSupport(cells: IJK[]): PhysicalSupportReport {
  const set = new Set(cells.map((c) => `${c.i},${c.j},${c.k}`));
  const level = (c: IJK) => c.i + c.k;
  let lMin = Infinity;
  let lMax = -Infinity;
  for (const c of cells) {
    const l = level(c);
    if (l < lMin) lMin = l;
    if (l > lMax) lMax = l;
  }

  let floorCells = 0;
  let zeroSupportCells = 0;
  let weakSupportCells = 0;
  for (const c of cells) {
    if (level(c) === lMin) {
      floorCells++;
      continue;
    }
    let contacts = 0;
    let hasX = false;
    let hasZ = false;
    for (const { off: [di, dj, dk], axis } of BELOW) {
      if (set.has(`${c.i + di},${c.j + dj},${c.k + dk}`)) {
        contacts++;
        if (axis === 'x') hasX = true;
        else hasZ = true;
      }
    }
    if (contacts === 0) zeroSupportCells++;
    else if (!(hasX && hasZ)) weakSupportCells++;
  }

  const verdict: PhysicalSupportVerdict =
    floorCells < 3
      ? 'not_freestanding'
      : zeroSupportCells + weakSupportCells > 0
        ? 'needs_anchoring'
        : 'any_order';

  return {
    version: 1,
    verdict,
    floorCells,
    levels: lMax - lMin + 1,
    zeroSupportCells,
    weakSupportCells,
  };
}

// ---------------------------------------------------------------------------
// Piece-level statics
//
// A rigid piece is stable iff its center of mass (projected to the floor
// plane) lies inside the support region formed by its external contacts:
// table contacts under floor spheres, and pocket contacts against supporter
// spheres one level below. A degenerate (collinear) contact set is a
// knife-edge the piece can roll about — only acceptable when every contact
// is a flat table contact (a straight piece lying on the table is fine; the
// same piece lying in a thin-wall groove is not).
//
// Used by the solver's gravity filter (final state: supporters = any other
// in-shape cell) and by the build-order pass (mid-assembly: supporters =
// already-placed cells only).
// ---------------------------------------------------------------------------

const EPS = 1e-6;

/** World-plan coordinates of a cell (x = 0.5(i+j), z = 0.5(j+k)); vertical is y = 0.5(i+k). */
const planX = (c: IJK) => 0.5 * (c.i + c.j);
const planZ = (c: IJK) => 0.5 * (c.j + c.k);

export interface PieceStabilityInput {
  /** The piece's cells. */
  cells: IJK[];
  /** Bottom level (i+k) of the shape — cells at this level rest on the table. */
  minLevel: number;
  /** Whether an external supporter sphere occupies the given cell. Callers
   *  must exclude the piece's own cells (a piece cannot rest on itself). */
  hasSupporter: (i: number, j: number, k: number) => boolean;
}

export function isPieceStaticallyStable({ cells, minLevel, hasSupporter }: PieceStabilityInput): boolean {
  // Collect contact points in the floor plane.
  const pts: Array<{ x: number; z: number; table: boolean }> = [];
  for (const c of cells) {
    if (c.i + c.k === minLevel) {
      pts.push({ x: planX(c), z: planZ(c), table: true });
      continue;
    }
    for (const { off } of BELOW) {
      const si = c.i + off[0];
      const sj = c.j + off[1];
      const sk = c.k + off[2];
      if (hasSupporter(si, sj, sk)) {
        const s = { i: si, j: sj, k: sk };
        pts.push({ x: (planX(c) + planX(s)) / 2, z: (planZ(c) + planZ(s)) / 2, table: false });
      }
    }
  }
  if (pts.length === 0) return false;

  let comX = 0;
  let comZ = 0;
  for (const c of cells) {
    comX += planX(c);
    comZ += planZ(c);
  }
  comX /= cells.length;
  comZ /= cells.length;

  // Degenerate (collinear or single-point) contact sets are knife-edges
  // unless every contact is a flat table contact with the CoM over the set.
  const [p0] = pts;
  let refDx = 0;
  let refDz = 0;
  let collinear = true;
  for (const p of pts) {
    const dx = p.x - p0.x;
    const dz = p.z - p0.z;
    if (refDx === 0 && refDz === 0) {
      refDx = dx;
      refDz = dz;
      continue;
    }
    if (Math.abs(refDx * dz - refDz * dx) > EPS) {
      collinear = false;
      break;
    }
  }

  if (collinear) {
    if (pts.some((p) => !p.table)) return false;
    // CoM must lie on the contact segment (within EPS).
    const dx = comX - p0.x;
    const dz = comZ - p0.z;
    if (refDx === 0 && refDz === 0) {
      return Math.abs(dx) < EPS && Math.abs(dz) < EPS;
    }
    const len2 = refDx * refDx + refDz * refDz;
    const t = (dx * refDx + dz * refDz) / len2;
    const perpX = dx - t * refDx;
    const perpZ = dz - t * refDz;
    if (perpX * perpX + perpZ * perpZ > EPS) return false;
    // Within the span of contact points along the line.
    let tMin = 0;
    let tMax = 0;
    for (const p of pts) {
      const pt = ((p.x - p0.x) * refDx + (p.z - p0.z) * refDz) / len2;
      if (pt < tMin) tMin = pt;
      if (pt > tMax) tMax = pt;
    }
    return t >= tMin - EPS && t <= tMax + EPS;
  }

  // Non-degenerate: CoM must lie inside (or on) the convex hull of contacts.
  const hull = convexHull(pts);
  for (let a = 0; a < hull.length; a++) {
    const b = (a + 1) % hull.length;
    const cross =
      (hull[b].x - hull[a].x) * (comZ - hull[a].z) - (hull[b].z - hull[a].z) * (comX - hull[a].x);
    if (cross < -EPS) return false;
  }
  return true;
}

/** Andrew monotone chain; returns CCW hull. */
function convexHull(points: Array<{ x: number; z: number }>): Array<{ x: number; z: number }> {
  const pts = [...points].sort((a, b) => (a.x - b.x) || (a.z - b.z));
  if (pts.length <= 2) return pts;
  const cross = (o: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower: typeof pts = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: typeof pts = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Order a solution's placements so that every piece is statically stable at
 * the moment it is placed, using only the table and already-placed pieces.
 * Greedy lowest-first; returns null if no such order exists (e.g. two pieces
 * that only hold each other up), which callers should treat as "solution not
 * physically buildable in sequence".
 */
export function orderForPhysicalBuild<T extends { cells: IJK[] }>(
  placements: T[],
  shapeCells: IJK[]
): T[] | null {
  let minLevel = Infinity;
  for (const c of shapeCells) minLevel = Math.min(minLevel, c.i + c.k);

  const placed = new Set<string>();
  const remaining = placements
    .map((p) => ({ p, low: Math.min(...p.cells.map((c) => c.i + c.k)) }))
    .sort((a, b) => a.low - b.low);
  const ordered: T[] = [];

  while (remaining.length > 0) {
    let pickedIdx = -1;
    for (let idx = 0; idx < remaining.length; idx++) {
      const cand = remaining[idx].p;
      const stable = isPieceStaticallyStable({
        cells: cand.cells,
        minLevel,
        hasSupporter: (i, j, k) => placed.has(`${i},${j},${k}`),
      });
      if (stable) {
        pickedIdx = idx;
        break;
      }
    }
    if (pickedIdx === -1) return null;
    const [{ p }] = remaining.splice(pickedIdx, 1);
    for (const c of p.cells) placed.add(`${c.i},${c.j},${c.k}`);
    ordered.push(p);
  }
  return ordered;
}
