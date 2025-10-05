// src/pages/auto-solver/pipeline/loadAndOrient.ts
import * as THREE from 'three';
import { ContainerJSON, OrientationRecord, IJK } from '../types';
import { ijkToXyz } from '../../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../../lib/quickhull-adapter';
import type { XYZ } from '../../../types/shape';

/**
 * Compute orientation matrix from container JSON
 * Same pattern as Edit Shape page orientation
 */
export function computeOrientationFromContainer(json: ContainerJSON, shapeId: string): OrientationRecord {
  console.log(`🧭 AutoSolver: Computing orientation for ${json.cells_ijk.length} cells`);
  
  // 1) Convert IJK to raw world coordinates
  const rawWorldPoints: XYZ[] = json.cells_ijk.map(ijk => {
    const [i, j, k] = ijk;
    return ijkToXyz({ i, j, k });
  });
  
  // 2) Compute convex hull
  const hull = quickHullWithCoplanarMerge(rawWorldPoints);
  
  // 3) Find largest face
  const largestFace = hull.faces.reduce((max, face) => 
    face.area > max.area ? face : max
  );
  
  console.log(`🏆 AutoSolver: Largest face area=${largestFace.area.toFixed(3)}, normal=(${largestFace.normal.x.toFixed(3)}, ${largestFace.normal.y.toFixed(3)}, ${largestFace.normal.z.toFixed(3)})`);
  
  // 4) Determine correct normal direction (should point outward/upward)
  // Check if normal points generally upward or downward
  let currentNormal = new THREE.Vector3(
    largestFace.normal.x,
    largestFace.normal.y,
    largestFace.normal.z
  );
  
  // If normal points downward (negative Y component dominant), flip it
  // We want the largest face to be the bottom, so its normal should point down to align to +Y (which puts face on bottom)
  // Actually, we want to align the face TO +Y, meaning the normal should point UP
  if (currentNormal.y < 0) {
    currentNormal.negate();
    console.log(`🔄 AutoSolver: Flipped normal to point upward: (${currentNormal.x.toFixed(3)}, ${currentNormal.y.toFixed(3)}, ${currentNormal.z.toFixed(3)})`);
  }
  
  // 5) Compute rotation matrix to align normal to +Y
  const targetUp = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(currentNormal, targetUp);
  const rotationMatrix = new THREE.Matrix4();
  rotationMatrix.makeRotationFromQuaternion(quaternion);
  
  // 6) Apply rotation to all points to find centroid
  const rotatedPoints = rawWorldPoints.map(p => {
    const vec = new THREE.Vector3(p.x, p.y, p.z);
    vec.applyMatrix4(rotationMatrix);
    return { x: vec.x, y: vec.y, z: vec.z };
  });
  
  // 7) Compute centroid after rotation
  const centroid = new THREE.Vector3();
  rotatedPoints.forEach(p => {
    centroid.x += p.x;
    centroid.y += p.y;
    centroid.z += p.z;
  });
  centroid.divideScalar(rotatedPoints.length);
  
  console.log(`📍 AutoSolver: Centroid after rotation: (${centroid.x.toFixed(3)}, ${centroid.y.toFixed(3)}, ${centroid.z.toFixed(3)})`);
  
  // 8) Build complete transform matrix: Translation * Rotation * FCC
  // This transforms: IJK coords → FCC world → rotated → centered at origin
  const fccBasis = new THREE.Matrix4();
  fccBasis.set(
    0.5, 0.5, 0,   0,
    0.5, 0,   0.5, 0,
    0,   0.5, 0.5, 0,
    0,   0,   0,   1
  );
  
  const translationMatrix = new THREE.Matrix4();
  translationMatrix.makeTranslation(-centroid.x, -centroid.y, -centroid.z);
  
  // Compose: M_worldFromIJK = T * R * FCC
  const M_worldFromIJK = new THREE.Matrix4();
  M_worldFromIJK.multiplyMatrices(translationMatrix, rotationMatrix);
  M_worldFromIJK.multiply(fccBasis);
  
  // 10) Compute inverse
  const M_IJKFromWorld = new THREE.Matrix4();
  M_IJKFromWorld.copy(M_worldFromIJK).invert();
  
  // 11) Final centroid in world space (should be near origin)
  const finalCentroid = new THREE.Vector3(0, 0, 0);
  
  console.log(`✅ AutoSolver: Orientation computed for ${shapeId}`);
  
  return {
    shapeId,
    M_worldFromIJK,
    M_IJKFromWorld,
    centroidWorld: finalCentroid
  };
}
