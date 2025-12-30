import * as THREE from 'three';
import type { ViewTransforms } from '../../../services/ViewTransforms';
import type { PlacematData } from './placematLoader';
import type { IJK } from '../../../types/shape';

/**
 * Computes an aligned view transform by baking the puzzle-to-placemat alignment
 * into the M_world matrix. This allows SceneCanvas to render pieces already aligned.
 */
export function computeAlignedView(
  originalView: ViewTransforms,
  placematData: PlacematData,
  placedPieceCells: { cells: IJK[] }[]
): ViewTransforms {
  const gridCenters = placematData.gridCenters;
  
  // Convert M_world to THREE.Matrix4
  const M = new THREE.Matrix4();
  M.set(
    originalView.M_world[0][0], originalView.M_world[0][1], originalView.M_world[0][2], originalView.M_world[0][3],
    originalView.M_world[1][0], originalView.M_world[1][1], originalView.M_world[1][2], originalView.M_world[1][3],
    originalView.M_world[2][0], originalView.M_world[2][1], originalView.M_world[2][2], originalView.M_world[2][3],
    originalView.M_world[3][0], originalView.M_world[3][1], originalView.M_world[3][2], originalView.M_world[3][3]
  );

  // Get all sphere world positions from placed pieces
  const allPositions: THREE.Vector3[] = [];
  for (const piece of placedPieceCells) {
    for (const cell of piece.cells) {
      // IJK is an object with i, j, k properties
      const ijkVec = new THREE.Vector4(cell.i, cell.j, cell.k, 1);
      const worldVec = ijkVec.applyMatrix4(M);
      allPositions.push(new THREE.Vector3(worldVec.x, worldVec.y, worldVec.z));
    }
  }

  if (allPositions.length === 0 || gridCenters.length === 0) {
    console.warn('⚠️ [ALIGN] No positions or grid centers, returning original view');
    return originalView;
  }

  // Find minimum Y to identify bottom layer
  const minY = Math.min(...allPositions.map(p => p.y));
  const tolerance = 0.1;
  const bottomLayerPositions = allPositions.filter(p => p.y <= minY + tolerance);

  console.log(`🔧 [ALIGN] Found ${bottomLayerPositions.length} bottom layer spheres at Y=${minY.toFixed(3)}`);

  if (bottomLayerPositions.length === 0) {
    console.warn('⚠️ [ALIGN] No bottom layer found, returning original view');
    return originalView;
  }

  // Compute centroids (XZ only)
  const puzzleCentroid = computeCentroidXZ(bottomLayerPositions);
  const gridCentroid = computeCentroidXZ(gridCenters);

  console.log(`🎯 [ALIGN] Puzzle centroid: (${puzzleCentroid.x.toFixed(3)}, ${puzzleCentroid.z.toFixed(3)})`);
  console.log(`🎯 [ALIGN] Grid centroid: (${gridCentroid.x.toFixed(3)}, ${gridCentroid.z.toFixed(3)})`);
  console.log(`🎯 [ALIGN] Grid centers count: ${gridCenters.length}, first: (${gridCenters[0]?.x.toFixed(3)}, ${gridCenters[0]?.z.toFixed(3)})`);

  // Step 1: Translation to center puzzle on grid
  const centerDelta = new THREE.Vector3(
    gridCentroid.x - puzzleCentroid.x,
    0,
    gridCentroid.z - puzzleCentroid.z
  );
  
  console.log(`🎯 [ALIGN] Center delta: (${centerDelta.x.toFixed(3)}, ${centerDelta.z.toFixed(3)})`);
  console.log(`🎯 [ALIGN] Snap delta: will compute next...`);

  // Apply translation to get updated positions
  const translatedPositions = bottomLayerPositions.map(p => 
    new THREE.Vector3(p.x + centerDelta.x, p.y, p.z + centerDelta.z)
  );
  const translatedCentroid = computeCentroidXZ(translatedPositions);

  // Step 2: Find snap points (closest to centroids)
  const puzzleSnapIdx = findNearestPointXZ(translatedCentroid, translatedPositions);
  const gridSnapIdx = findNearestPointXZ(gridCentroid, gridCenters);
  
  const puzzleSnapPoint = translatedPositions[puzzleSnapIdx];
  const gridSnapPoint = gridCenters[gridSnapIdx];

  // Step 3: Snap translation
  const snapDelta = new THREE.Vector3(
    gridSnapPoint.x - puzzleSnapPoint.x,
    0,
    gridSnapPoint.z - puzzleSnapPoint.z
  );
  
  console.log(`🎯 [ALIGN] Puzzle snap point: (${puzzleSnapPoint.x.toFixed(3)}, ${puzzleSnapPoint.z.toFixed(3)})`);
  console.log(`🎯 [ALIGN] Grid snap point: (${gridSnapPoint.x.toFixed(3)}, ${gridSnapPoint.z.toFixed(3)})`);
  console.log(`🎯 [ALIGN] Snap delta: (${snapDelta.x.toFixed(3)}, ${snapDelta.z.toFixed(3)})`);

  // Update positions after snap
  const snappedPositions = translatedPositions.map(p =>
    new THREE.Vector3(p.x + snapDelta.x, p.y, p.z + snapDelta.z)
  );
  const snappedPuzzleSnapPoint = snappedPositions[puzzleSnapIdx];

  // Step 4: Compute rotation angle
  // Find second reference points (nearest neighbors excluding snap point)
  const puzzleP2Idx = findNearestPointXZ(snappedPuzzleSnapPoint, snappedPositions, [puzzleSnapIdx]);
  const gridP2Idx = findNearestPointXZ(gridSnapPoint, gridCenters, [gridSnapIdx]);

  let rotationAngle = 0;
  if (puzzleP2Idx !== -1 && gridP2Idx !== -1) {
    const puzzleP2 = snappedPositions[puzzleP2Idx];
    const gridP2 = gridCenters[gridP2Idx];

    console.log(`🔄 [ALIGN] Puzzle P2: (${puzzleP2.x.toFixed(3)}, ${puzzleP2.z.toFixed(3)})`);
    console.log(`🔄 [ALIGN] Grid P2: (${gridP2.x.toFixed(3)}, ${gridP2.z.toFixed(3)})`);

    // Build direction vectors in XZ plane
    const vPuzzle = new THREE.Vector2(
      puzzleP2.x - snappedPuzzleSnapPoint.x,
      puzzleP2.z - snappedPuzzleSnapPoint.z
    ).normalize();

    const vGrid = new THREE.Vector2(
      gridP2.x - gridSnapPoint.x,
      gridP2.z - gridSnapPoint.z
    ).normalize();

    console.log(`🔄 [ALIGN] vPuzzle: (${vPuzzle.x.toFixed(3)}, ${vPuzzle.y.toFixed(3)})`);
    console.log(`🔄 [ALIGN] vGrid: (${vGrid.x.toFixed(3)}, ${vGrid.y.toFixed(3)})`);

    // Compute signed angle (puzzle → grid)
    const cross = vPuzzle.x * vGrid.y - vPuzzle.y * vGrid.x;
    const dot = vPuzzle.dot(vGrid);
    rotationAngle = Math.atan2(cross, dot);

    console.log(`🔄 [ALIGN] Rotation angle: ${(rotationAngle * 180 / Math.PI).toFixed(2)}°`);
  } else {
    console.log(`⚠️ [ALIGN] Could not find P2 points: puzzleP2Idx=${puzzleP2Idx}, gridP2Idx=${gridP2Idx}`);
  }

  // Step 5: Build alignment matrix
  // The alignment is: rotate around snap point, then translate
  const totalTranslation = new THREE.Vector3(
    centerDelta.x + snapDelta.x,
    0,
    centerDelta.z + snapDelta.z
  );

  // Pivot point for rotation (in world space after translation)
  const pivot = new THREE.Vector3(
    gridSnapPoint.x,
    0,
    gridSnapPoint.z
  );

  // Build alignment matrix: T(pivot) * R(angle) * T(-pivot) * T(totalTranslation)
  const alignMatrix = new THREE.Matrix4();
  
  // Start with translation
  const T1 = new THREE.Matrix4().makeTranslation(totalTranslation.x, totalTranslation.y, totalTranslation.z);
  
  // Rotation around pivot
  const T_toPivot = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z);
  const R = new THREE.Matrix4().makeRotationY(rotationAngle);
  const T_fromPivot = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z);

  // Combined: T_fromPivot * R * T_toPivot * T1
  alignMatrix.copy(T_fromPivot).multiply(R).multiply(T_toPivot).multiply(T1);

  // Step 6: Multiply alignment into M_world
  // New M_world = alignMatrix * originalM
  const alignedM = new THREE.Matrix4();
  alignedM.copy(alignMatrix).multiply(M);

  // Convert back to number[][] format
  const elements = alignedM.elements;
  const newM_world: number[][] = [
    [elements[0], elements[4], elements[8], elements[12]],
    [elements[1], elements[5], elements[9], elements[13]],
    [elements[2], elements[6], elements[10], elements[14]],
    [elements[3], elements[7], elements[11], elements[15]]
  ];

  console.log(`✅ [ALIGN] Alignment baked into view: translation=(${totalTranslation.x.toFixed(3)}, ${totalTranslation.z.toFixed(3)}), rotation=${(rotationAngle * 180 / Math.PI).toFixed(2)}°`);

  // Return new view with aligned M_world
  return {
    ...originalView,
    M_world: newM_world
  };
}

function computeCentroidXZ(points: THREE.Vector3[]): THREE.Vector3 {
  if (points.length === 0) return new THREE.Vector3(0, 0, 0);
  
  let sumX = 0, sumZ = 0;
  for (const p of points) {
    sumX += p.x;
    sumZ += p.z;
  }
  
  return new THREE.Vector3(sumX / points.length, 0, sumZ / points.length);
}

function findNearestPointXZ(
  target: THREE.Vector3,
  points: THREE.Vector3[],
  excludeIndices: number[] = []
): number {
  let minDist = Infinity;
  let minIdx = -1;
  
  for (let i = 0; i < points.length; i++) {
    if (excludeIndices.includes(i)) continue;
    
    const dx = points[i].x - target.x;
    const dz = points[i].z - target.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    if (dist < minDist) {
      minDist = dist;
      minIdx = i;
    }
  }
  
  return minIdx;
}
