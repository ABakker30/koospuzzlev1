// FitFinder - Computes valid placements for Manual Puzzle
// Given a piece, anchor, and orientations, finds all valid fits (no collision, in-bounds)

export type IJK = { i: number; j: number; k: number };
export type IJKKey = string; // `${i},${j},${k}`

export type OrientationSpec = {
  orientationId: string;
  ijkOffsets: IJK[];
};

export type FitPlacement = {
  pieceId: string;
  orientationId: string;
  anchorSphereIndex: 0 | 1 | 2 | 3; // which sphere is pinned to the clicked anchor
  cells: IJK[]; // 4 absolute IJK cells after translation
};

// Helper: Convert IJK to key string
export function ijkToKey(ijk: IJK): IJKKey {
  return `${ijk.i},${ijk.j},${ijk.k}`;
}

// Helper: Add two IJK coordinates
function addIJK(a: IJK, b: IJK): IJK {
  return { i: a.i + b.i, j: a.j + b.j, k: a.k + b.k };
}

// Helper: Subtract two IJK coordinates
function subtractIJK(a: IJK, b: IJK): IJK {
  return { i: a.i - b.i, j: a.j - b.j, k: a.k - b.k };
}

/**
 * Compute all valid fits for a piece at a given anchor.
 * 
 * For each orientation and each of the 4 spheres as potential anchor point:
 * - Translate the piece so the chosen sphere sits at the anchor
 * - Check if all 4 cells are in the container and not occupied
 * - Return only valid placements
 * 
 * @param params.containerCells - Set of IJKKey strings for valid container positions
 * @param params.occupiedCells - Set of IJKKey strings for already-placed pieces
 * @param params.anchor - The clicked cell where user wants to place
 * @param params.pieceId - ID of the piece to place (e.g., "K", "A")
 * @param params.orientations - All gold-standard orientations for this piece
 * @returns Sorted array of valid FitPlacement objects
 */
export function computeFits(params: {
  containerCells: Set<IJKKey>;
  occupiedCells: Set<IJKKey>;
  anchor: IJK;
  pieceId: string;
  orientations: OrientationSpec[];
}): FitPlacement[] {
  const { containerCells, occupiedCells, anchor, pieceId, orientations } = params;
  const fits: FitPlacement[] = [];

  console.log(`🔍 FitFinder: Computing fits for ${pieceId} at anchor (${anchor.i}, ${anchor.j}, ${anchor.k})`);
  console.log(`   Orientations: ${orientations.length}, Container size: ${containerCells.size}, Occupied: ${occupiedCells.size}`);

  let totalAttempts = 0;
  let validCount = 0;

  // Try each orientation
  for (let orientationIndex = 0; orientationIndex < orientations.length; orientationIndex++) {
    const orientation = orientations[orientationIndex];
    const { orientationId, ijkOffsets } = orientation;

    // Ensure we have exactly 4 cells (piece definition)
    if (ijkOffsets.length !== 4) {
      console.warn(`⚠️ FitFinder: Orientation ${orientationId} has ${ijkOffsets.length} cells, expected 4`);
      continue;
    }

    // Try each of the 4 spheres as the anchor point
    for (let anchorSphereIndex = 0; anchorSphereIndex < 4; anchorSphereIndex++) {
      totalAttempts++;
      const anchorOffset = ijkOffsets[anchorSphereIndex];

      // Compute translation vector: anchor - anchorOffset
      // This makes anchorOffset land on the clicked anchor
      const translation = subtractIJK(anchor, anchorOffset);

      // Translate all 4 cells
      const translatedCells = ijkOffsets.map(offset => addIJK(offset, translation));

      // Check validity:
      // 1. All cells must be in the container
      // 2. All cells must not be occupied
      const invalidCells: string[] = [];
      const allValid = translatedCells.every(cell => {
        const key = ijkToKey(cell);
        const inContainer = containerCells.has(key);
        const notOccupied = !occupiedCells.has(key);
        if (!inContainer) {
          invalidCells.push(`${key} (out-of-bounds)`);
        } else if (!notOccupied) {
          invalidCells.push(`${key} (occupied)`);
        }
        return inContainer && notOccupied;
      });

      if (allValid) {
        validCount++;
        fits.push({
          pieceId,
          orientationId,
          anchorSphereIndex: anchorSphereIndex as 0 | 1 | 2 | 3,
          cells: translatedCells,
        });
      }
    }
  }

  console.log(`   ✅ Found ${validCount} valid fits out of ${totalAttempts} attempts (${orientations.length} orientations × 4 anchor spheres)`);
  
  if (validCount === 0 && orientations.length > 0) {
    console.log(`   ℹ️ Try clicking a different cell - this anchor position has no valid placements`);
  }

  // Sort fits (simple deterministic order for MVP):
  // 1. By orientation index (ascending)
  // 2. By anchor sphere index (ascending)
  fits.sort((a, b) => {
    const aOrientationIndex = orientations.findIndex(o => o.orientationId === a.orientationId);
    const bOrientationIndex = orientations.findIndex(o => o.orientationId === b.orientationId);
    if (aOrientationIndex !== bOrientationIndex) {
      return aOrientationIndex - bOrientationIndex;
    }
    return a.anchorSphereIndex - b.anchorSphereIndex;
  });

  return fits;
}
