// src/engines/engine2/gravityFilter.ts
// Gravity-supported piece placement filtering for the solver.
//
// A candidate placement survives iff the piece would be statically stable in
// the FINISHED puzzle: since a complete solution fills every container cell,
// each sphere's potential supporters are known from the shape alone — any
// in-container cell one pocket-step below that is NOT part of this placement
// (a piece cannot rest on itself), plus the table under bottom-level cells.
// The statics core (CoM inside a non-degenerate support polygon; thin-wall
// grooves and point balances rejected) lives in src/utils/physicalSupport.ts
// and is shared with the shape-level verdict and the build-order pass.
//
// Vertical axis matches the game view (ijkToXyz): y = 0.5*(i+k).

import type { IJK } from "../types";
import { isPieceStaticallyStable } from "../../utils/physicalSupport";

export type GravityConstraintSettings = {
  enable: boolean;
};

export type SupportContext = {
  cellSet: Set<string>;
  minLevel: number;
};

const key = (c: IJK) => `${c[0]},${c[1]},${c[2]}`;

/** Precompute the container lookup used by isGravitySupported. */
export function computeSupportContext(cells: IJK[]): SupportContext {
  const cellSet = new Set(cells.map(key));
  let minLevel = Infinity;
  for (const c of cells) minLevel = Math.min(minLevel, c[0] + c[2]);
  return { cellSet, minLevel };
}

/**
 * Final-state static stability of one placement within the container.
 */
export function isGravitySupported(placementCells: IJK[], ctx: SupportContext): boolean {
  const own = new Set(placementCells.map(key));
  return isPieceStaticallyStable({
    cells: placementCells.map((c) => ({ i: c[0], j: c[1], k: c[2] })),
    minLevel: ctx.minLevel,
    hasSupporter: (i, j, k) => {
      const s = `${i},${j},${k}`;
      return ctx.cellSet.has(s) && !own.has(s);
    },
  });
}
