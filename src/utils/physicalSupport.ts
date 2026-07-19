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
import { computeViewTransforms } from '../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../lib/quickhull-adapter';
import { ijkToXyz } from '../lib/ijk';

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
 *      stackings.
 *  v4: the build orientation IS the screen's orientation (largest hull face
 *      down via computeViewTransforms — the same code every view renders
 *      with), so what the player sees is exactly the frame gravity is
 *      computed in. No hidden frames. */
export const PHYSICAL_SUPPORT_VERSION = 4;

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

/** The SCREEN's orientation, from the exact code path every view uses
 *  (largest hull face down, resting on the XZ plane) — the internal build
 *  orientation is this by construction, so what the player sees IS the
 *  frame gravity is computed in. Falls back to the raw lattice embedding
 *  if hull computation fails. */
function screenWorldPhysics(cells: IJK[]): WorldPhysics {
  try {
    const { M_world: m } = computeViewTransforms(
      cells,
      ijkToXyz,
      T_IJK_TO_XYZ_4,
      quickHullWithCoplanarMerge
    );
    const worldPos = (c: IJK) => ({
      x: m[0][0] * c.i + m[0][1] * c.j + m[0][2] * c.k + m[0][3],
      y: m[1][0] * c.i + m[1][1] * c.j + m[1][2] * c.k + m[1][3],
      z: m[2][0] * c.i + m[2][1] * c.j + m[2][2] * c.k + m[2][3],
    });
    const step = Math.hypot(m[0][0], m[1][0], m[2][0]);
    let floorY = Infinity;
    for (const c of cells) floorY = Math.min(floorY, worldPos(c).y);
    return { worldPos, step, floorY };
  } catch {
    let floorY = Infinity;
    for (const c of cells) floorY = Math.min(floorY, stdWorldPos(c).y);
    return { worldPos: stdWorldPos, step: STD_STEP, floorY };
  }
}

const T_IJK_TO_XYZ_4 = [
  [0.5, 0.5, 0, 0],
  [0.5, 0, 0.5, 0],
  [0, 0.5, 0.5, 0],
  [0, 0, 0, 1],
];

/** Per-sphere support grading in an arbitrary orientation. A sphere is
 *  SOLID when the horizontal push directions of its load-bearing supporters
 *  strictly surround it (origin strictly inside their 2D hull) — exact for
 *  the square 4-pocket, the triangular 3-pocket, and everything between.
 *  Otherwise weak (some direction has no brace); zero = no supporters. */
function gradeSpheres(
  cells: IJK[],
  phys: WorldPhysics
): {
  floorCells: number;
  zeroSupportCells: number;
  weakSupportCells: number;
  levels: number;
  riskCellKeys: Set<string>;
} {
  const set = new Set(cells.map((c) => `${c.i},${c.j},${c.k}`));
  const floorEps = 0.25 * phys.step;
  const supportDrop = 0.3 * phys.step;
  let floorCells = 0;
  let zeroSupportCells = 0;
  let weakSupportCells = 0;
  const riskCellKeys = new Set<string>();
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
    if (pushes.length === 0) {
      zeroSupportCells++;
      riskCellKeys.add(`${c.i},${c.j},${c.k}`);
    } else if (!originStrictlyInside(pushes)) {
      weakSupportCells++;
      riskCellKeys.add(`${c.i},${c.j},${c.k}`);
    }
  }
  return { floorCells, zeroSupportCells, weakSupportCells, levels: yLevels.size, riskCellKeys };
}

// ---------------------------------------------------------------------------
// Gravity cell classes and the placement legality rule (gravity-support v1)
//
// Every cell of the shape falls into one of three classes, judged in the
// build (screen) orientation:
//
//   floor — the bottom layer, resting on the table. Never critical (a ball
//           on the table cannot fall) but also never an ANCHOR: the table
//           is flat and gives no lateral grip.
//   risk  — wall/overhang cells: spheres whose in-shape contacts from below
//           don't fully brace them (weak) or don't exist (zero).
//   body  — everything else: supported, non-floor cells. Anchoring here
//           locks a piece in.
//
// The single play/solve rule:
//
//   a placement containing any RISK ball must also contain a BODY ball.
//
// A piece may lean into a wall or overhang only when anchored in the body;
// a floor foot doesn't count (the piece tips out of the wall plane), and a
// piece lying entirely on the floor is always fine.
//
// This one rule filters every candidate pipeline (engine2 rows, DLX rows,
// hint fits, manual placement). It is deliberately simpler than per-piece
// statics; the end-of-game assembly-order check (orderForPhysicalBuild)
// remains the honest statics backstop for the finished arrangement.
// ---------------------------------------------------------------------------

export interface GravityCellClasses {
  /** Wall/overhang cells ("i,j,k" keys) — the red cells. */
  riskCells: Set<string>;
  /** Bottom-layer cells ("i,j,k" keys) — safe but non-anchoring. */
  floorCells: Set<string>;
}

/** Classify the shape's cells for the gravity rule. O(cells). */
export function computeGravityCellClasses(cells: IJK[]): GravityCellClasses {
  const phys = screenWorldPhysics(cells);
  const riskCells = gradeSpheres(cells, phys).riskCellKeys;
  const floorEps = 0.25 * phys.step;
  const floorCells = new Set<string>();
  for (const c of cells) {
    if (phys.worldPos(c).y <= phys.floorY + floorEps) floorCells.add(`${c.i},${c.j},${c.k}`);
  }
  return { riskCells, floorCells };
}

/** Wall/overhang cells of a shape, as "i,j,k" keys (display + verdict). */
export function computeGravityRiskCells(cells: IJK[]): Set<string> {
  return computeGravityCellClasses(cells).riskCells;
}

/** Gravity-support v1 placement rule: a placement with any risk ball must
 *  also have a body ball (supported, non-floor, non-risk). */
export function isGravityLegalPlacement(cells: IJK[], classes: GravityCellClasses): boolean {
  let hasRisk = false;
  let hasBody = false;
  for (const c of cells) {
    const key = `${c.i},${c.j},${c.k}`;
    if (classes.riskCells.has(key)) hasRisk = true;
    else if (!classes.floorCells.has(key)) hasBody = true;
  }
  return !hasRisk || hasBody;
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

/**
 * Judge the shape in the orientation the SCREEN shows it: largest hull face
 * down, resting on the ground plane (computeViewTransforms — the same code
 * every view uses). A physical builder replicates what they see; the tower
 * appears lying on its side on screen and is judged lying on its side.
 * Returns the report plus the physics of that orientation.
 */
export function bestBuildAnalysis(cells: IJK[]): { report: PhysicalSupportReport; phys: WorldPhysics } {
  // ONE orientation: the screen's (largest hull face down, resting on the
  // ground plane). The player builds what they see — no hidden frames.
  const phys = screenWorldPhysics(cells);
  const g = gradeSpheres(cells, phys);

  // Whole-shape tip check: the assembly's center of mass must stand over
  // its floor footprint, else the finished shape topples as one body.
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
    // Screen orientation IS the build orientation — never reoriented.
    reoriented: false,
  };
  return { report, phys };
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
// This statics core exists for the ASSEMBLY-ORDER concern only (the
// end-of-game buildability verdict and Explore's construction playback).
// Play/solve-time filtering uses the simpler risk-cell rule above.
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

type Contact = { x: number; z: number; table: boolean; pocket: boolean };

/** Collect the external contacts of a piece: table under floor spheres,
 *  plus contacts against supporter spheres steeply enough below to bear
 *  load. Contacts are graded: `pocket` (table, or drop ≥ 0.6·step — a
 *  seated pocket) vs shelf (0.3–0.6·step — holds in ideal statics but slips
 *  in practice on polished spheres). Also counts lateral/above kissing
 *  contacts with placed spheres — they can't carry weight, but they block
 *  roll-out escape paths (bracing). */
function collectContacts(
  cells: IJK[],
  hasSupporter: (i: number, j: number, k: number) => boolean,
  phys: WorldPhysics
): { pts: Contact[]; comX: number; comZ: number; allCellsOnFloor: boolean; lateralContacts: number } {
  const floorEps = 0.25 * phys.step;
  const supportDrop = 0.3 * phys.step;
  const pocketDrop = 0.6 * phys.step;
  const pts: Contact[] = [];
  let comX = 0;
  let comZ = 0;
  let allCellsOnFloor = true;
  let lateralContacts = 0;

  for (const c of cells) {
    const p = phys.worldPos(c);
    comX += p.x;
    comZ += p.z;
    if (p.y <= phys.floorY + floorEps) {
      pts.push({ x: p.x, z: p.z, table: true, pocket: true });
    } else {
      allCellsOnFloor = false;
    }
    for (const [di, dj, dk] of N12) {
      const ni = c.i + di;
      const nj = c.j + dj;
      const nk = c.k + dk;
      if (!hasSupporter(ni, nj, nk)) continue;
      const pn = phys.worldPos({ i: ni, j: nj, k: nk });
      const drop = p.y - pn.y;
      if (drop > supportDrop) {
        pts.push({ x: (p.x + pn.x) / 2, z: (p.z + pn.z) / 2, table: false, pocket: drop >= pocketDrop });
      } else {
        lateralContacts++;
      }
    }
  }
  return { pts, comX: comX / cells.length, comZ: comZ / cells.length, allCellsOnFloor, lateralContacts };
}

export type StabilityBand = 'solid' | 'delicate' | 'fall';

/**
 * v4 stability assessment: stability is a QUANTITY, not a boolean.
 * `margin` approximates the escape barrier — how deep the CoM sits inside
 * the support polygon (in sphere radii), discounted when the piece rests
 * only on slippery shelf contacts, credited for lateral bracing (neighbors
 * that block the roll-out path). Bands:
 *   solid    — place freely (margin ≥ 0.25 R)
 *   delicate — holds in ideal statics but fragile in real hands: flag it,
 *              delay it in build orders, brace it with neighbors soon
 *   fall     — statically unstable (same hard rule as before)
 */
export function pieceStabilityAssessment(
  cells: IJK[],
  hasSupporter: (i: number, j: number, k: number) => boolean,
  phys: WorldPhysics
): { band: StabilityBand; margin: number } {
  const { pts, comX, comZ, allCellsOnFloor, lateralContacts } = collectContacts(cells, hasSupporter, phys);
  if (!stableFromContacts(pts, comX, comZ, allCellsOnFloor)) {
    return { band: 'fall', margin: 0 };
  }
  const R = phys.step / 2;

  // Lying fully on the table: as solid as it gets.
  if (allCellsOnFloor === false || pts.some((p) => !p.table)) {
    // fall through to hull margin below
  } else {
    return { band: 'solid', margin: 1 };
  }

  // Depth of the CoM inside the contact hull, in sphere radii.
  const hull = convexHull(pts);
  let margin = Infinity;
  if (hull.length < 3) {
    margin = 1; // degenerate but stable → the all-table lying case
  } else {
    for (let a = 0; a < hull.length; a++) {
      const b = (a + 1) % hull.length;
      const ex = hull[b].x - hull[a].x;
      const ez = hull[b].z - hull[a].z;
      const len = Math.hypot(ex, ez) || 1;
      const dist = (ex * (comZ - hull[a].z) - ez * (comX - hull[a].x)) / len;
      if (dist < margin) margin = dist;
    }
    margin /= R;
  }

  // Resting only on shelf contacts: slick spheres slip — discount heavily.
  const hasPocketGrade = pts.some((p) => p.pocket);
  if (!hasPocketGrade) margin *= 0.4;

  // Lateral bracing raises the escape barrier even though it bears no load.
  margin += Math.min(3, lateralContacts) * 0.08;

  return { band: margin >= 0.25 ? 'solid' : 'delicate', margin };
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
    const scored: Array<{ idx: number; minY: number; height: number; connected: number; margin: number }> = [];
    for (let idx = 0; idx < n; idx++) {
      if (used[idx]) continue;
      const cells = placements[idx].cells;
      const assess = pieceStabilityAssessment(cells, hasSupporter, phys);
      if (assess.band === 'fall') continue;
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
      scored.push({ idx, minY: meta[idx].minY, height: meta[idx].height, connected, margin: assess.margin });
    }
    scored.sort(
      (a, b) =>
        a.minY - b.minY ||          // 1. lowest first
        a.height - b.height ||      // 2. flattest first
        b.connected - a.connected ||// 3. connected to the assembled mass
        b.margin - a.margin ||      // 4. calmest first — delicate goes late,
                                    //    ideally after its bracing neighbors
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
