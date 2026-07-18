// src/engines/engine2/gravityFilter.ts
// Gravity-supported piece placement filtering for the solver.
//
// A candidate placement survives iff the piece would be statically stable in
// the FINISHED puzzle: since a complete solution fills every container cell,
// each sphere's potential supporters are known from the shape alone — any
// in-container kissing neighbor steeply enough below to bear load that is
// NOT part of this placement (a piece cannot rest on itself), plus the
// table under bottom-layer cells.
//
// Gravity acts in the shape's chosen BUILD orientation (physicalSupport's
// best resting orientation — a tip-down tower is solved for building lying
// on its side). The statics core (CoM strictly inside the contact hull;
// knife-edges rejected) is shared with the shape verdict, solo-mode
// warnings, and the assembly-order pass.

import type { IJK } from "../types";
import {
  isPieceStaticallyStableWorld,
  buildWorldPhysics,
  type WorldPhysics,
} from "../../utils/physicalSupport";

export type GravityConstraintSettings = {
  enable: boolean;
};

export type SupportContext = {
  cellSet: Set<string>;
  phys: WorldPhysics;
};

const key = (c: IJK) => `${c[0]},${c[1]},${c[2]}`;

/** Precompute the container lookup + build orientation. */
export function computeSupportContext(cells: IJK[]): SupportContext {
  const objCells = cells.map((c) => ({ i: c[0], j: c[1], k: c[2] }));
  return {
    cellSet: new Set(cells.map(key)),
    phys: buildWorldPhysics(objCells),
  };
}

/**
 * Final-state static stability of one placement within the container.
 */
export function isGravitySupported(placementCells: IJK[], ctx: SupportContext): boolean {
  const own = new Set(placementCells.map(key));
  return isPieceStaticallyStableWorld(
    placementCells.map((c) => ({ i: c[0], j: c[1], k: c[2] })),
    (i, j, k) => {
      const s = `${i},${j},${k}`;
      return ctx.cellSet.has(s) && !own.has(s);
    },
    ctx.phys
  );
}
