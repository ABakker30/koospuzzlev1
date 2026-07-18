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
//                      (>=2 contacts below): any solution is physically
//                      stable; only assembly order matters.
//   needs_anchoring  - the shape has flare/overhang regions (spheres with
//                      0-1 contacts below): those spheres are only held by
//                      their piece's rigidity, so solutions must route
//                      anchored pieces through them and be built in order.
//   not_freestanding - the shape stands on fewer than 3 spheres (point or
//                      edge balance): it cannot be assembled freestanding
//                      in this orientation at all.
import type { IJK } from '../types/shape';

/** Offsets (in ijk) of the up-to-4 pocket spheres one level below a cell. */
const BELOW: ReadonlyArray<readonly [number, number, number]> = [
  [-1, 0, 0],
  [0, 0, -1],
  [-1, 1, 0],
  [0, 1, -1],
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
  /** Non-floor spheres balancing on a single contact below. */
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
    for (const [di, dj, dk] of BELOW) {
      if (set.has(`${c.i + di},${c.j + dj},${c.k + dk}`)) contacts++;
    }
    if (contacts === 0) zeroSupportCells++;
    else if (contacts === 1) weakSupportCells++;
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
