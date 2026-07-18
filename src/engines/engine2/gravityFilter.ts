// src/engines/engine2/gravityFilter.ts
// Gravity-supported piece placement filtering for the solver.
//
// Gravity-support v1 rule (shape-derived, one predicate everywhere):
// the shape's RISK CELLS are its wall/overhang spheres — cells whose
// in-shape contacts from below don't brace them, judged in the build
// (screen) orientation. A candidate placement survives iff at least one
// of its balls is a non-risk cell: a piece may lean into a wall or
// overhang, but not lie entirely within one.
//
// The end-of-game assembly-order pass (orderForPhysicalBuild) remains the
// honest statics check for the finished arrangement.

import type { IJK } from "../types";
import { computeGravityRiskCells } from "../../utils/physicalSupport";

export type GravityConstraintSettings = {
  enable: boolean;
};

export type SupportContext = {
  riskCells: Set<string>;
};

/** Precompute the shape's risk-cell set once. */
export function computeSupportContext(cells: IJK[]): SupportContext {
  const objCells = cells.map((c) => ({ i: c[0], j: c[1], k: c[2] }));
  return { riskCells: computeGravityRiskCells(objCells) };
}

/** Gravity-support v1: legal iff any ball is a non-risk cell. */
export function isGravitySupported(placementCells: IJK[], ctx: SupportContext): boolean {
  for (const c of placementCells) {
    if (!ctx.riskCells.has(`${c[0]},${c[1]},${c[2]}`)) return true;
  }
  return false;
}
