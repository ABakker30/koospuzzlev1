// src/engines/engine2/gravityFilter.ts
// Gravity-supported piece placement filtering
// Filters out placements that would be unstable due to gravity

import type { IJK } from "../types";

export type GravityConstraintSettings = {
  enable: boolean;
  // Bottom plane is defined as the minimum k value in the container
  // All cells on the bottom plane are considered stable
};

type BoundaryInfo = {
  isInterior: boolean;
  isBottomPlane: boolean;
  // Which boundary planes this cell touches (using plane normals as keys)
  planes: Set<string>;
};

/**
 * Compute boundary information for all cells in a container.
 * A cell is on a boundary if it has fewer than 12 FCC neighbors within the container.
 */
export function computeBoundaryInfo(cells: IJK[]): Map<string, BoundaryInfo> {
  const cellSet = new Set(cells.map(c => `${c[0]},${c[1]},${c[2]}`));
  
  // Find the minimum k value (bottom plane)
  const minK = Math.min(...cells.map(c => c[2]));
  
  // FCC neighbor kernel (12 neighbors)
  const NBR: IJK[] = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    [1, -1, 0], [-1, 1, 0], [1, 0, -1], [-1, 0, 1], [0, 1, -1], [0, -1, 1],
  ];
  
  // Define plane normals for boundary detection
  // We use 6 primary directions to detect which "face" a cell is exposed to
  const PLANE_NORMALS: { normal: IJK; key: string }[] = [
    { normal: [1, 0, 0], key: "+X" },
    { normal: [-1, 0, 0], key: "-X" },
    { normal: [0, 1, 0], key: "+Y" },
    { normal: [0, -1, 0], key: "-Y" },
    { normal: [0, 0, 1], key: "+Z" },
    { normal: [0, 0, -1], key: "-Z" },
  ];
  
  const boundaryInfo = new Map<string, BoundaryInfo>();
  
  for (const cell of cells) {
    const key = `${cell[0]},${cell[1]},${cell[2]}`;
    const isBottomPlane = cell[2] === minK;
    
    // Check which directions have missing neighbors (exposed faces)
    const exposedPlanes = new Set<string>();
    let neighborCount = 0;
    
    for (const d of NBR) {
      const n: IJK = [cell[0] + d[0], cell[1] + d[1], cell[2] + d[2]];
      const nKey = `${n[0]},${n[1]},${n[2]}`;
      if (cellSet.has(nKey)) {
        neighborCount++;
      }
    }
    
    // Determine exposed planes by checking which directions lack neighbors
    for (const { normal, key: planeKey } of PLANE_NORMALS) {
      // Check neighbors in this direction
      const neighbor: IJK = [
        cell[0] + normal[0],
        cell[1] + normal[1],
        cell[2] + normal[2]
      ];
      const nKey = `${neighbor[0]},${neighbor[1]},${neighbor[2]}`;
      if (!cellSet.has(nKey)) {
        exposedPlanes.add(planeKey);
      }
    }
    
    // A cell is interior if it has all 12 FCC neighbors
    // (but we use a simpler heuristic: no exposed planes except bottom)
    const isInterior = exposedPlanes.size === 0 || 
      (exposedPlanes.size === 1 && exposedPlanes.has("-Z") && isBottomPlane);
    
    boundaryInfo.set(key, {
      isInterior,
      isBottomPlane,
      planes: exposedPlanes,
    });
  }
  
  return boundaryInfo;
}

/**
 * Check if a piece placement is gravity-supported.
 * 
 * Rules:
 * - Interior cells: always allowed
 * - Bottom plane cells: always allowed
 * - Cells on a single exposed plane (or edge): NOT allowed
 * - Cells spanning 2+ non-parallel planes: allowed (corner support)
 */
export function isGravitySupported(
  placementCells: IJK[],
  boundaryInfo: Map<string, BoundaryInfo>
): boolean {
  // Collect all exposed planes that this placement touches
  const allPlanes = new Set<string>();
  let hasExposedCell = false;
  
  for (const cell of placementCells) {
    const key = `${cell[0]},${cell[1]},${cell[2]}`;
    const info = boundaryInfo.get(key);
    
    if (!info) {
      // Cell not in container - this shouldn't happen but allow it
      continue;
    }
    
    // If all cells are interior or on bottom, placement is allowed
    if (info.isInterior || info.isBottomPlane) {
      continue;
    }
    
    // This cell is on an exposed boundary
    hasExposedCell = true;
    Array.from(info.planes).forEach(plane => {
      // Don't count bottom plane exposure (-Z) as a constraint
      if (plane !== "-Z") {
        allPlanes.add(plane);
      }
    });
  }
  
  // If no exposed cells (all interior or bottom), allow
  if (!hasExposedCell) {
    return true;
  }
  
  // If exposed, need to check if we have corner support (2+ non-parallel planes)
  // Non-parallel planes are planes with different axes
  // +X/-X are parallel, +Y/-Y are parallel, +Z/-Z are parallel
  
  const axes = new Set<string>();
  Array.from(allPlanes).forEach(plane => {
    // Extract axis from plane key (+X -> X, -Y -> Y, etc.)
    const axis = plane.slice(1); // Remove +/- prefix
    axes.add(axis);
  });
  
  // Need at least 2 different axes for corner support
  return axes.size >= 2;
}

/**
 * Filter a list of placements to only include gravity-supported ones.
 */
export function filterGravitySupportedPlacements<T extends { cells: IJK[] }>(
  placements: T[],
  boundaryInfo: Map<string, BoundaryInfo>
): T[] {
  return placements.filter(p => isGravitySupported(p.cells, boundaryInfo));
}
