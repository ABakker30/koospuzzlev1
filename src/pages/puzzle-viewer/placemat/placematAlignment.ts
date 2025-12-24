import * as THREE from 'three';

interface AlignmentResult {
  translation: THREE.Vector3;
  rotation: number;
  snapPoint: THREE.Vector3;
  centroid: THREE.Vector3;
  debugInfo: {
    placematCentroid: THREE.Vector3;
    solutionCentroid: THREE.Vector3;
    placematSnapPoint: THREE.Vector3;
    solutionSnapPoint: THREE.Vector3;
    rotationAngle: number;
  };
}

export function alignSolutionToPlacemat(
  solutionBottomLayerCenters: { x: number; y: number; z: number }[],
  placematGridCenters: THREE.Vector3[],
  solutionGroup: THREE.Group
): AlignmentResult {
  // Step 1: Compute centroids
  const placematCentroid = computeCentroidXZ(placematGridCenters);
  
  // Convert solution local centers to world space
  solutionGroup.updateMatrixWorld(true);
  const solutionWorldCenters = solutionBottomLayerCenters.map(c => {
    const localVec = new THREE.Vector3(c.x, c.y, c.z);
    return solutionGroup.localToWorld(localVec.clone());
  });
  
  const solutionCentroid = computeCentroidXZ(solutionWorldCenters);
  
  // Step 2: Initial centering translation (XZ only)
  const centerDelta = new THREE.Vector3(
    placematCentroid.x - solutionCentroid.x,
    0,
    placematCentroid.z - solutionCentroid.z
  );
  
  solutionGroup.position.add(centerDelta);
  solutionGroup.updateMatrixWorld(true);
  
  // Update solution world centers after translation
  const solutionWorldCentersAfterCenter = solutionBottomLayerCenters.map(c => {
    const localVec = new THREE.Vector3(c.x, c.y, c.z);
    return solutionGroup.localToWorld(localVec.clone());
  });
  
  const solutionCentroidAfterCenter = computeCentroidXZ(solutionWorldCentersAfterCenter);
  
  // Step 3: Snap closest sphere to closest grid point
  // Find puzzle snap sphere (closest to puzzle centroid)
  const solutionSnapIdx = findNearestPointXZ(
    solutionCentroidAfterCenter,
    solutionWorldCentersAfterCenter
  );
  const solutionSnapPoint = solutionWorldCentersAfterCenter[solutionSnapIdx];
  
  // Find placemat snap point (closest to placemat centroid)
  const placematSnapIdx = findNearestPointXZ(
    placematCentroid,
    placematGridCenters
  );
  const placematSnapPoint = placematGridCenters[placematSnapIdx];
  
  // Step 4: Snap translation
  const snapDelta = new THREE.Vector3(
    placematSnapPoint.x - solutionSnapPoint.x,
    0,
    placematSnapPoint.z - solutionSnapPoint.z
  );
  
  solutionGroup.position.add(snapDelta);
  solutionGroup.updateMatrixWorld(true);
  
  // Update solution world centers after snap
  const solutionWorldCentersAfterSnap = solutionBottomLayerCenters.map(c => {
    const localVec = new THREE.Vector3(c.x, c.y, c.z);
    return solutionGroup.localToWorld(localVec.clone());
  });
  
  const solutionSnapPointAfterSnap = solutionWorldCentersAfterSnap[solutionSnapIdx];
  
  // Step 5: Rotation alignment
  // Find second reference points (nearest neighbors excluding the snap point)
  const solutionP2Idx = findNearestPointXZ(
    solutionSnapPointAfterSnap,
    solutionWorldCentersAfterSnap,
    [solutionSnapIdx]
  );
  
  const placematP2Idx = findNearestPointXZ(
    placematSnapPoint,
    placematGridCenters,
    [placematSnapIdx]
  );
  
  if (solutionP2Idx !== -1 && placematP2Idx !== -1) {
    const solutionP2 = solutionWorldCentersAfterSnap[solutionP2Idx];
    const placematP2 = placematGridCenters[placematP2Idx];
    
    // Build direction vectors in XZ plane
    const vSolution = new THREE.Vector2(
      solutionP2.x - solutionSnapPointAfterSnap.x,
      solutionP2.z - solutionSnapPointAfterSnap.z
    ).normalize();
    
    const vPlacemat = new THREE.Vector2(
      placematP2.x - placematSnapPoint.x,
      placematP2.z - placematSnapPoint.z
    ).normalize();
    
    // Compute signed angle
    const cross = vSolution.x * vPlacemat.y - vSolution.y * vPlacemat.x;
    const dot = vSolution.dot(vPlacemat);
    const angle = Math.atan2(cross, dot);
    
    // Apply rotation around snap point (pivot)
    const pivot = solutionSnapPointAfterSnap.clone();
    solutionGroup.position.sub(pivot);
    solutionGroup.rotateY(angle);
    solutionGroup.position.add(pivot);
    solutionGroup.updateMatrixWorld(true);
    
    // Step 6: Optional final snap cleanup
    const solutionWorldCentersAfterRotation = solutionBottomLayerCenters.map(c => {
      const localVec = new THREE.Vector3(c.x, c.y, c.z);
      return solutionGroup.localToWorld(localVec.clone());
    });
    
    // Recompute closest sphere to snap grid point
    const finalSnapIdx = findNearestPointXZ(placematSnapPoint, solutionWorldCentersAfterRotation);
    const finalSnapPoint = solutionWorldCentersAfterRotation[finalSnapIdx];
    const finalCleanupDelta = new THREE.Vector3(
      placematSnapPoint.x - finalSnapPoint.x,
      0,
      placematSnapPoint.z - finalSnapPoint.z
    );
    
    if (finalCleanupDelta.length() > 0.001) {
      solutionGroup.position.add(finalCleanupDelta);
      solutionGroup.updateMatrixWorld(true);
    }
    
    return {
      translation: solutionGroup.position.clone(),
      rotation: angle,
      snapPoint: pivot,
      centroid: placematCentroid,
      debugInfo: {
        placematCentroid,
        solutionCentroid,
        placematSnapPoint,
        solutionSnapPoint: solutionSnapPointAfterSnap,
        rotationAngle: angle
      }
    };
  }
  
  // No rotation needed (only one sphere or alignment points coincide)
  return {
    translation: solutionGroup.position.clone(),
    rotation: 0,
    snapPoint: solutionSnapPointAfterSnap,
    centroid: placematCentroid,
    debugInfo: {
      placematCentroid,
      solutionCentroid,
      placematSnapPoint,
      solutionSnapPoint: solutionSnapPointAfterSnap,
      rotationAngle: 0
    }
  };
}

function computeCentroidXZ(points: THREE.Vector3[]): THREE.Vector3 {
  if (points.length === 0) {
    return new THREE.Vector3(0, 0, 0);
  }
  
  let sumX = 0, sumZ = 0;
  for (const p of points) {
    sumX += p.x;
    sumZ += p.z;
  }
  
  return new THREE.Vector3(
    sumX / points.length,
    0,
    sumZ / points.length
  );
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

