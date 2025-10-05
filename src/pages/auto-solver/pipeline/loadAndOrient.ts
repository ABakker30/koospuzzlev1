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
  
  // 4) Compute rotation matrix to align largest face normal to +Y
  const targetUp = new THREE.Vector3(0, 1, 0);
  const currentNormal = new THREE.Vector3(
    largestFace.normal.x,
    largestFace.normal.y,
    largestFace.normal.z
  );
  
  const rotationMatrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(currentNormal, targetUp);
  rotationMatrix.makeRotationFromQuaternion(quaternion);
  
  // 5) Apply rotation to all points
  const rotatedPoints = rawWorldPoints.map(p => {
    const vec = new THREE.Vector3(p.x, p.y, p.z);
    vec.applyMatrix4(rotationMatrix);
    return { x: vec.x, y: vec.y, z: vec.z };
  });
  
  // 6) Compute centroid after rotation
  const centroid = new THREE.Vector3();
  rotatedPoints.forEach(p => {
    centroid.x += p.x;
    centroid.y += p.y;
    centroid.z += p.z;
  });
  centroid.divideScalar(rotatedPoints.length);
  
  // 7) Create translation to center at origin
  const translationMatrix = new THREE.Matrix4();
  translationMatrix.makeTranslation(-centroid.x, -centroid.y, -centroid.z);
  
  // 8) Compose full transform: T * R (translation after rotation)
  const M_worldFromIJK = new THREE.Matrix4();
  M_worldFromIJK.multiply(translationMatrix);
  M_worldFromIJK.multiply(rotationMatrix);
  
  // 9) Apply to IJK unit vectors to get final transform
  // Start with FCC basis transform
  const fccBasis = new THREE.Matrix4();
  fccBasis.set(
    0.5, 0.5, 0,   0,
    0.5, 0,   0.5, 0,
    0,   0.5, 0.5, 0,
    0,   0,   0,   1
  );
  
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
