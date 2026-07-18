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
//   any_order        - every non-floor sphere rests in a FULL 4-pocket:
//                      braced in every direction, so any solution is
//                      physically stable; only assembly order matters.
//                      (Shapes that shrink as they rise.)
//   needs_anchoring  - the shape has faces, walls, flares, or overhangs
//                      (spheres missing one or more of the 4 pocket
//                      supporters): a missing quadrant leaves a direction
//                      with no brace — the contacts there can only push,
//                      so a piece relying on them alone balances on a
//                      knife-edge and can roll out (the classic case: a
//                      flat piece lying fully in a vertical wall face).
//                      Solutions must route anchored pieces through those
//                      regions and be built in order.
//   not_freestanding - the shape stands on fewer than 3 spheres (point or
//                      edge balance): it cannot be assembled freestanding
//                      in this orientation at all.
import type { IJK } from '../types/shape';

/** All 12 FCC nearest-neighbor offsets (kissing spheres). */
const N12: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  [1, -1, 0], [-1, 1, 0], [1, 0, -1], [-1, 0, 1], [0, 1, -1], [0, -1, 1],
];

/** Bump when the analysis rule changes — stale stored reports are
 *  recomputed on read (see api/puzzles.getPuzzleById).
 *  v2: solid = full 4-pocket.
 *  v3: best RESTING ORIENTATION is chosen (a tip-down tower is judged lying
 *      on its side, an octahedron on a triangular face), and sphere support
 *      uses the general force rule (supporter push directions must strictly
 *      surround the sphere) which is exact in square AND triangular
 *      stackings. */
export const PHYSICAL_SUPPORT_VERSION = 3;

export type PhysicalSupportVerdict = 'any_order' | 'needs_anchoring' | 'not_freestanding';

export interface PhysicalSupportReport {
  /** Analysis schema version (PHYSICAL_SUPPORT_VERSION at write time). */
  version: number;
  verdict: PhysicalSupportVerdict;
  /** Spheres resting on the table in the chosen build orientation. */
  floorCells: number;
  /** Layer count in the chosen build orientation. */
  levels: number;
  /** Non-floor spheres with no load-bearing contact below (piece-carried). */
  zeroSupportCells: number;
  /** Non-floor spheres whose contacts don't fully brace them. */
  weakSupportCells: number;
  /** "Down" direction (unit-ish xyz in the standard embedding) of the chosen
   *  build orientation. [0,-1,0] = as displayed. */
  buildDown?: [number, number, number];
  /** True when the best build orientation differs from the displayed one —
   *  the physical puzzle is built resting on a different face. */
  reoriented?: boolean;
}

// Candidate "down" directions: face- (100), edge- (110) and corner-type
// (111) rest orientations in the standard embedding. 26 total; the first is
// the displayed orientation and wins ties.
const DOWN_DIRS: Array<[number, number, number]> = (() => {
  const dirs: Array<[number, number, number]> = [[0, -1, 0]];
  const vals = [-1, 0, 1];
  for (const x of vals) for (const y of vals) for (const z of vals) {
    if (x === 0 && y === 0 && z === 0) continue;
    if (x === 0 && y === -1 && z === 0) continue; // already first
    dirs.push([x, y, z]);
  }
  return dirs;
})();

/** WorldPhysics for a given down-direction (azimuth is irrelevant to
 *  statics, any orthonormal completion works). */
function physicsForDown(cells: IJK[], down: [number, number, number]): WorldPhysics {
  const len = Math.hypot(down[0], down[1], down[2]);
  const up = { x: -down[0] / len, y: -down[1] / len, z: -down[2] / len };
  // Orthonormal u ⊥ up.
  const seed = Math.abs(up.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const dotSU = seed.x * up.x + seed.y * up.y + seed.z * up.z;
  let u = { x: seed.x - dotSU * up.x, y: seed.y - dotSU * up.y, z: seed.z - dotSU * up.z };
  const uLen = Math.hypot(u.x, u.y, u.z);
  u = { x: u.x / uLen, y: u.y / uLen, z: u.z / uLen };
  const w = {
    x: up.y * u.z - up.z * u.y,
    y: up.z * u.x - up.x * u.z,
    z: up.x * u.y - up.y * u.x,
  };
  const worldPos = (c: IJK) => {
    const p = stdWorldPos(c);
    return {
      x: p.x * u.x + p.y * u.y + p.z * u.z,
      y: p.x * up.x + p.y * up.y + p.z * up.z,
      z: p.x * w.x + p.y * w.y + p.z * w.z,
    };
  };
  let floorY = Infinity;
  for (const c of cells) floorY = Math.min(floorY, worldPos(c).y);
  return { worldPos, step: STD_STEP, floorY };
}

/** Per-sphere support grading in an arbitrary orientation. A sphere is
 *  SOLID when the horizontal push directions of its load-bearing supporters
 *  strictly surround it (origin strictly inside their 2D hull) — exact for
 *  the square 4-pocket, the triangular 3-pocket, and everything between.
 *  Otherwise weak (some direction has no brace); zero = no supporters. */
function gradeSpheres(
  cells: IJK[],
  phys: WorldPhysics
): { floorCells: number; zeroSupportCells: number; weakSupportCells: number; levels: number } {
  const set = new Set(cells.map((c) => `${c.i},${c.j},${c.k}`));
  const floorEps = 0.25 * phys.step;
  const supportDrop = 0.3 * phys.step;
  let floorCells = 0;
  let zeroSupportCells = 0;
  let weakSupportCells = 0;
  const yLevels = new Set<number>();
  for (const c of cells) {
    const p = phys.worldPos(c);
    yLevels.add(Math.round((p.y - phys.floorY) / (0.25 * phys.step)));
    if (p.y <= phys.floorY + floorEps) {
      floorCells++;
      continue;
    }
    const pushes: Array<{ x: number; z: number }> = [];
    for (const [di, dj, dk] of N12) {
      const ni = c.i + di;
      const nj = c.j + dj;
      const nk = c.k + dk;
      if (!set.has(`${ni},${nj},${nk}`)) continue;
      const pn = phys.worldPos({ i: ni, j: nj, k: nk });
      if (p.y - pn.y > supportDrop) pushes.push({ x: p.x - pn.x, z: p.z - pn.z });
    }
    if (pushes.length === 0) zeroSupportCells++;
    else if (!originStrictlyInside(pushes)) weakSupportCells++;
  }
  return { floorCells, zeroSupportCells, weakSupportCells, levels: yLevels.size };
}

/** Is the origin strictly inside the convex hull of these 2D points? */
function originStrictlyInside(pts: Array<{ x: number; z: number }>): boolean {
  if (pts.length < 3) return false;
  const hull = convexHull(pts);
  if (hull.length < 3) return false;
  for (let a = 0; a < hull.length; a++) {
    const b = (a + 1) % hull.length;
    const cross = (hull[b].x - hull[a].x) * (0 - hull[a].z) - (hull[b].z - hull[a].z) * (0 - hull[a].x);
    if (cross < 1e-9) return false;
  }
  return true;
}

const VERDICT_ORDER: Record<PhysicalSupportVerdict, number> = {
  any_order: 0,
  needs_anchoring: 1,
  not_freestanding: 2,
};

/**
 * Judge the shape in its BEST resting orientation — a physical builder is
 * free to lay the shape down however it stands best (a "tower" stored
 * tip-down is built lying on its side; an octahedron rests on a face).
 * Returns the report plus the physics of the chosen orientation.
 */
export function bestBuildAnalysis(cells: IJK[]): { report: PhysicalSupportReport; phys: WorldPhysics } {
  let best: { report: PhysicalSupportReport; phys: WorldPhysics; down: [number, number, number] } | null = null;
  for (const down of DOWN_DIRS) {
    const phys = physicsForDown(cells, down);
    const g = gradeSpheres(cells, phys);
    // Whole-shape tip check: the assembly's center of mass must stand over
    // its floor footprint, else the finished shape topples as one body (a
    // slab balanced on a 3-sphere corner tripod is not a build orientation).
    const floorEps = 0.25 * phys.step;
    const floorPts: Array<{ x: number; z: number }> = [];
    let comX = 0;
    let comZ = 0;
    for (const c of cells) {
      const p = phys.worldPos(c);
      comX += p.x;
      comZ += p.z;
      if (p.y <= phys.floorY + floorEps) floorPts.push({ x: p.x, z: p.z });
    }
    comX /= cells.length;
    comZ /= cells.length;
    const baseOk = g.floorCells >= 3 && comStrictlyOverBase(floorPts, comX, comZ);

    const verdict: PhysicalSupportVerdict = !baseOk
      ? 'not_freestanding'
      : g.zeroSupportCells + g.weakSupportCells > 0
        ? 'needs_anchoring'
        : 'any_order';
    const report: PhysicalSupportReport = {
      version: PHYSICAL_SUPPORT_VERSION,
      verdict,
      floorCells: g.floorCells,
      levels: g.levels,
      zeroSupportCells: g.zeroSupportCells,
      weakSupportCells: g.weakSupportCells,
      buildDown: down,
      reoriented: !(down[0] === 0 && down[1] === -1 && down[2] === 0),
    };
    const cur = best?.report;
    const beats =
      !cur ||
      VERDICT_ORDER[verdict] < VERDICT_ORDER[cur.verdict] ||
      (VERDICT_ORDER[verdict] === VERDICT_ORDER[cur.verdict] &&
        (g.zeroSupportCells + g.weakSupportCells < cur.zeroSupportCells + cur.weakSupportCells ||
          (g.zeroSupportCells + g.weakSupportCells === cur.zeroSupportCells + cur.weakSupportCells &&
            g.floorCells > cur.floorCells)));
    if (beats) best = { report, phys, down };
  }
  return { report: best!.report, phys: best!.phys };
}

/** Shape-level tipping: CoM strictly over the floor footprint (with margin). */
function comStrictlyOverBase(floorPts: Array<{ x: number; z: number }>, comX: number, comZ: number): boolean {
  if (floorPts.length < 3) return false;
  const hull = convexHull(floorPts);
  if (hull.length < 3) return false;
  const MARGIN = 0.02;
  for (let a = 0; a < hull.length; a++) {
    const b = (a + 1) % hull.length;
    const ex = hull[b].x - hull[a].x;
    const ez = hull[b].z - hull[a].z;
    const cross = ex * (comZ - hull[a].z) - ez * (comX - hull[a].x);
    if (cross < MARGIN * Math.hypot(ex, ez)) return false;
  }
  return true;
}

export function analyzePhysicalSupport(cells: IJK[]): PhysicalSupportReport {
  return bestBuildAnalysis(cells).report;
}

/** Physics of the shape's chosen build orientation — ALL physical-build
 *  machinery (solver filter, hints, live warnings, assembly order) must use
 *  this so gravity is computed the way the shape is actually built. */
export function buildWorldPhysics(cells: IJK[]): WorldPhysics {
  return bestBuildAnalysis(cells).phys;
}

// ---------------------------------------------------------------------------
// Piece-level statics (general, works in any world orientation)
//
// A rigid piece is stable iff its center of mass (projected to the floor
// plane) lies inside the support region formed by its external contacts:
// table contacts under floor spheres, and pocket contacts against supporter
// spheres below it. Pocket contacts can only push, so:
//  * a degenerate (collinear) contact set is a knife-edge — only acceptable
//    when every contact is a table contact AND the piece lies fully in the
//    floor layer (it may roll in place on the mat but cannot fall);
//  * otherwise the CoM must sit STRICTLY inside the contact hull, with a
//    margin — CoM exactly on a hull edge (a flat piece lying in an outer
//    vertical face) is a marginal balance that rolls out at a touch.
//
// The lattice entry points (isPieceStaticallyStable etc.) use the game
// view's standard embedding (up = i+k). The world entry points take an
// arbitrary worldPos, so display surfaces that re-orient the shape (the
// Explore/solution viewer rotates the largest hull face down) analyze
// gravity in the exact orientation the builder sees.
// ---------------------------------------------------------------------------

const EPS = 1e-6;

/** Standard game-view embedding of the FCC lattice. */
const stdWorldPos = (c: IJK) => ({
  x: 0.5 * (c.i + c.j),
  y: 0.5 * (c.i + c.k),
  z: 0.5 * (c.j + c.k),
});
/** Nearest-neighbor sphere distance under the standard embedding. */
const STD_STEP = Math.SQRT1_2;

export interface WorldPhysics {
  /** World position of a lattice cell, in the orientation being displayed/built. */
  worldPos: (c: IJK) => { x: number; y: number; z: number };
  /** Nearest-neighbor sphere distance in world units. */
  step: number;
  /** World y of the table plane (min sphere y across the whole assembly). */
  floorY: number;
}

type Contact = { x: number; z: number; table: boolean };

/** Collect the external contacts of a piece: table under floor spheres,
 *  plus pocket contacts against supporter spheres steeply enough below to
 *  bear load. Returns null CoM data implicitly via caller. */
function collectContacts(
  cells: IJK[],
  hasSupporter: (i: number, j: number, k: number) => boolean,
  phys: WorldPhysics
): { pts: Contact[]; comX: number; comZ: number; allCellsOnFloor: boolean } {
  const floorEps = 0.25 * phys.step;
  const supportDrop = 0.3 * phys.step;
  const pts: Contact[] = [];
  let comX = 0;
  let comZ = 0;
  let allCellsOnFloor = true;

  for (const c of cells) {
    const p = phys.worldPos(c);
    comX += p.x;
    comZ += p.z;
    if (p.y <= phys.floorY + floorEps) {
      pts.push({ x: p.x, z: p.z, table: true });
    } else {
      allCellsOnFloor = false;
    }
    for (const [di, dj, dk] of N12) {
      const ni = c.i + di;
      const nj = c.j + dj;
      const nk = c.k + dk;
      if (!hasSupporter(ni, nj, nk)) continue;
      const pn = phys.worldPos({ i: ni, j: nj, k: nk });
      if (p.y - pn.y > supportDrop) {
        pts.push({ x: (p.x + pn.x) / 2, z: (p.z + pn.z) / 2, table: false });
      }
    }
  }
  return { pts, comX: comX / cells.length, comZ: comZ / cells.length, allCellsOnFloor };
}

function stableFromContacts(pts: Contact[], comX: number, comZ: number, allCellsOnFloor: boolean): boolean {
  if (pts.length === 0) return false;

  // Degenerate (collinear or single-point) contact sets are knife-edges.
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
    if (!allCellsOnFloor) return false;
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
    let tMin = 0;
    let tMax = 0;
    for (const p of pts) {
      const pt = ((p.x - p0.x) * refDx + (p.z - p0.z) * refDz) / len2;
      if (pt < tMin) tMin = pt;
      if (pt > tMax) tMax = pt;
    }
    return t >= tMin - EPS && t <= tMax + EPS;
  }

  // Non-degenerate: CoM strictly inside the hull, with a margin.
  const MARGIN = 0.02;
  const hull = convexHull(pts);
  for (let a = 0; a < hull.length; a++) {
    const b = (a + 1) % hull.length;
    const ex = hull[b].x - hull[a].x;
    const ez = hull[b].z - hull[a].z;
    const cross = ex * (comZ - hull[a].z) - ez * (comX - hull[a].x);
    const edgeLen = Math.hypot(ex, ez);
    if (cross < MARGIN * edgeLen) return false;
  }
  return true;
}

/** General world-orientation stability check for one piece. */
export function isPieceStaticallyStableWorld(
  cells: IJK[],
  hasSupporter: (i: number, j: number, k: number) => boolean,
  phys: WorldPhysics
): boolean {
  const { pts, comX, comZ, allCellsOnFloor } = collectContacts(cells, hasSupporter, phys);
  return stableFromContacts(pts, comX, comZ, allCellsOnFloor);
}

export interface PieceStabilityInput {
  /** The piece's cells. */
  cells: IJK[];
  /** Bottom level (i+k) of the shape — cells at this level rest on the table. */
  minLevel: number;
  /** Whether an external supporter sphere occupies the given cell. Callers
   *  must exclude the piece's own cells (a piece cannot rest on itself). */
  hasSupporter: (i: number, j: number, k: number) => boolean;
}

/** Lattice-orientation stability check (game view: up = i+k). */
export function isPieceStaticallyStable({ cells, minLevel, hasSupporter }: PieceStabilityInput): boolean {
  return isPieceStaticallyStableWorld(cells, hasSupporter, {
    worldPos: stdWorldPos,
    step: STD_STEP,
    floorY: 0.5 * minLevel,
  });
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
 * Check the pieces currently standing on the board: which of them could not
 * actually stay put under gravity? Supporters for each piece are the table
 * and every OTHER placed piece's spheres (a piece cannot rest on itself).
 * Used in solo Physical build mode to warn the moment a placement (or a
 * removal that orphans a neighbor) creates a piece that would fall.
 */
export function findUnstablePieces<T extends { uid: string; pieceId: string; cells: IJK[] }>(
  placed: T[],
  shapeCells: IJK[]
): T[] {
  // Gravity acts in the shape's chosen BUILD orientation (a tip-down tower
  // is built lying on its side), with the floor taken from the whole shape.
  const phys = buildWorldPhysics(shapeCells);

  const owner = new Map<string, string>();
  for (const p of placed) {
    for (const c of p.cells) owner.set(`${c.i},${c.j},${c.k}`, p.uid);
  }

  return placed.filter(
    (p) =>
      !isPieceStaticallyStableWorld(
        p.cells,
        (i, j, k) => {
          const o = owner.get(`${i},${j},${k}`);
          return o !== undefined && o !== p.uid;
        },
        phys
      )
  );
}

// ---------------------------------------------------------------------------
// Physical build ordering
//
// Hard constraint: a piece may only be placed when it is statically stable
// at that moment, supported by the table and pieces already down. Among the
// currently-placeable pieces, the pick follows a builder-friendly cascade:
//   1. lowest first        (anchor the foundation; layers emerge naturally)
//   2. flattest first      (low-profile pieces make pockets for the rest)
//   3. connected           (grow one solid mass instead of islands)
//   4. most secure         (place robust pieces early, delay delicate
//                           cantilevers until neighbors exist to brace them)
// Greedy with backtracking: if the preferred path dead-ends, earlier picks
// are revisited (bounded), so preferences never cost us a buildable order.
// Returns null only when no stable sequence exists at all (mutual-support
// arrangements) or the search budget is exhausted.
// ---------------------------------------------------------------------------

const ORDER_NODE_BUDGET = 20000;

export function orderForPhysicalBuildWorld<T extends { cells: IJK[] }>(
  placements: T[],
  physIn: { worldPos: WorldPhysics['worldPos']; step: number }
): T[] | null {
  const n = placements.length;
  if (n === 0) return [];

  let floorY = Infinity;
  for (const p of placements) {
    for (const c of p.cells) floorY = Math.min(floorY, physIn.worldPos(c).y);
  }
  const phys: WorldPhysics = { ...physIn, floorY };

  const key = (i: number, j: number, k: number) => `${i},${j},${k}`;

  // Per-piece precompute: cell keys, min world y, height (for flatness).
  const meta = placements.map((p) => {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of p.cells) {
      const y = physIn.worldPos(c).y;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return {
      cellKeys: p.cells.map((c) => key(c.i, c.j, c.k)),
      minY,
      height: maxY - minY,
    };
  });

  const placedCells = new Set<string>();
  const used = new Array<boolean>(n).fill(false);
  const orderIdx: number[] = [];
  const failMemo = new Set<string>();
  let nodes = 0;

  const hasSupporter = (i: number, j: number, k: number) => placedCells.has(key(i, j, k));

  const usedSignature = () => {
    let sig = '';
    for (let i = 0; i < n; i++) if (used[i]) sig += i + ',';
    return sig;
  };

  const candidateOrder = (): number[] => {
    const scored: Array<{ idx: number; minY: number; height: number; connected: number; contacts: number }> = [];
    for (let idx = 0; idx < n; idx++) {
      if (used[idx]) continue;
      const cells = placements[idx].cells;
      const { pts, comX, comZ, allCellsOnFloor } = collectContacts(cells, hasSupporter, phys);
      if (!stableFromContacts(pts, comX, comZ, allCellsOnFloor)) continue;
      // connected = touches the assembled mass (any kissing neighbor placed)
      let connected = 0;
      outer: for (const c of cells) {
        for (const [di, dj, dk] of N12) {
          if (placedCells.has(key(c.i + di, c.j + dj, c.k + dk))) {
            connected = 1;
            break outer;
          }
        }
      }
      scored.push({ idx, minY: meta[idx].minY, height: meta[idx].height, connected, contacts: pts.length });
    }
    scored.sort(
      (a, b) =>
        a.minY - b.minY ||          // 1. lowest first
        a.height - b.height ||      // 2. flattest first
        b.connected - a.connected ||// 3. connected to the assembled mass
        b.contacts - a.contacts ||  // 4. most secure (most contacts)
        a.idx - b.idx
    );
    return scored.map((s) => s.idx);
  };

  const dfs = (): boolean => {
    if (orderIdx.length === n) return true;
    if (++nodes > ORDER_NODE_BUDGET) return false;
    const sig = usedSignature();
    if (failMemo.has(sig)) return false;
    for (const idx of candidateOrder()) {
      used[idx] = true;
      orderIdx.push(idx);
      for (const ck of meta[idx].cellKeys) placedCells.add(ck);
      if (dfs()) return true;
      for (const ck of meta[idx].cellKeys) placedCells.delete(ck);
      orderIdx.pop();
      used[idx] = false;
      if (nodes > ORDER_NODE_BUDGET) return false;
    }
    failMemo.add(sig);
    return false;
  };

  return dfs() ? orderIdx.map((i) => placements[i]) : null;
}

/**
 * Lattice-orientation build ordering (game view: up = i+k). Same contract
 * as before: returns the stable assembly sequence, or null when none exists.
 */
export function orderForPhysicalBuild<T extends { cells: IJK[] }>(
  placements: T[],
  shapeCells: IJK[]
): T[] | null {
  // Sequence in the shape's chosen BUILD orientation.
  const phys = buildWorldPhysics(shapeCells);
  return orderForPhysicalBuildWorld(placements, { worldPos: phys.worldPos, step: phys.step });
}
