// src/engines/engine2/gravityFilter.ts
// Gravity-supported piece placement filtering for the solver.
//
// Gravity-support v1 rule (shape-derived, one predicate everywhere): the
// shape's cells are classed as FLOOR (bottom layer — safe on the table but
// non-anchoring), RISK (walls/overhangs), and BODY (supported, non-floor).
// A candidate placement survives iff any risk ball is accompanied by a
// body ball: a piece may lean into a wall or overhang only when anchored
// in the supported body — a floor foot doesn't count (the piece tips out
// of the wall plane), and a piece lying entirely on the floor is fine.
//
// The end-of-game assembly-order pass (orderForPhysicalBuild) remains the
// honest statics check for the finished arrangement.

import type { IJK } from "../types";
import { computeGravityCellClasses, type GravityCellClasses } from "../../utils/physicalSupport";

export type GravityConstraintSettings = {
  enable: boolean;
};

export type SupportContext = GravityCellClasses;

/** Precompute the shape's gravity cell classes once. */
export function computeSupportContext(cells: IJK[]): SupportContext {
  const objCells = cells.map((c) => ({ i: c[0], j: c[1], k: c[2] }));
  return computeGravityCellClasses(objCells);
}

/** Gravity-support v1: any risk ball requires a body ball. */
export function isGravitySupported(placementCells: IJK[], ctx: SupportContext): boolean {
  let hasRisk = false;
  let hasBody = false;
  for (const c of placementCells) {
    const key = `${c[0]},${c[1]},${c[2]}`;
    if (ctx.riskCells.has(key)) hasRisk = true;
    else if (!ctx.floorCells.has(key)) hasBody = true;
  }
  return !hasRisk || hasBody;
}
