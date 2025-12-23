import * as THREE from 'three';
import type { IJK, XYZ } from '../../../types/shape';
import { quickHullWithCoplanarMerge } from '../../../lib/quickhull-adapter';

export interface AutoOrientResult {
  rootQuaternion: [number, number, number, number];
  rootPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
}

type HullFace = { area: number; normal: XYZ; vertices: XYZ[] };
type Hull = { faces: HullFace[] };

/**
 * Auto-orients a solution by finding the largest convex hull face and rotating it to point up (+Y).
 * This is the SINGLE SOURCE OF TRUTH for puzzle orientation used in both viewer and assembly pages.
 * 
 * @param input.ijkCells - Array of IJK cell positions
 * @param input.ijkToXyz - Function to convert IJK to XYZ world coordinates
 * @returns Orientation result with root quaternion for the puzzle
 */
export function autoOrientSolution(input: {
  ijkCells: IJK[];
  ijkToXyz: (ijk: IJK) => XYZ;
}): AutoOrientResult {
  const { ijkCells, ijkToXyz } = input;
  
  console.log(`🧭 AutoOrient: Processing ${ijkCells.length} cells`);
  
  if (ijkCells.length === 0) {
    console.warn('⚠️ AutoOrient: Empty cell set, returning identity');
    return {
      rootQuaternion: [0, 0, 0, 1], // Identity quaternion
      rootPosition: [0, 0, 0],
      cameraTarget: [0, 0, 0],
    };
  }
  
  // Step 1: Convert IJK to XYZ
  const ptsXYZ = ijkCells.map(ijkToXyz);
  
  // Step 2: Find largest face for orientation using convex hull
  const rounded = ptsXYZ.map(round3);
  let hull: Hull;
  try {
    hull = quickHullWithCoplanarMerge(rounded, 1e-6);
  } catch (err) {
    console.warn('⚠️ AutoOrient: Hull computation failed, returning identity', err);
    return {
      rootQuaternion: [0, 0, 0, 1],
      rootPosition: [0, 0, 0],
      cameraTarget: [0, 0, 0],
    };
  }
  
  // Default: no rotation
  let rotationMatrix = new THREE.Matrix4();
  
  if (hull.faces && hull.faces.length > 0) {
    // Find largest face
    let best = hull.faces[0];
    for (const f of hull.faces) {
      if (f.area > best.area) best = f;
    }
    
    console.log(`🏆 AutoOrient: Largest face normal: (${best.normal.x.toFixed(3)}, ${best.normal.y.toFixed(3)}, ${best.normal.z.toFixed(3)})`);
    
    // Orient so largest face points down (-Y), which means we rotate its normal to point up (+Y)
    const normalizedBest = norm(best.normal);
    const invertedNormal = new THREE.Vector3(-normalizedBest.x, -normalizedBest.y, -normalizedBest.z);
    const targetUp = new THREE.Vector3(0, 1, 0);
    
    // Compute rotation from inverted normal to +Y
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(invertedNormal.normalize(), targetUp);
    
    rotationMatrix.makeRotationFromQuaternion(quaternion);
  }
  
  // Extract quaternion from rotation matrix
  const finalQuaternion = new THREE.Quaternion();
  finalQuaternion.setFromRotationMatrix(rotationMatrix);
  
  console.log(`🧭 AutoOrient: Root quaternion: [${finalQuaternion.x.toFixed(3)}, ${finalQuaternion.y.toFixed(3)}, ${finalQuaternion.z.toFixed(3)}, ${finalQuaternion.w.toFixed(3)}]`);
  
  return {
    rootQuaternion: [finalQuaternion.x, finalQuaternion.y, finalQuaternion.z, finalQuaternion.w],
    rootPosition: [0, 0, 0], // Centering handled separately in viewer/assembly
    cameraTarget: [0, 0, 0],
  };
}

// Helper functions
function round3(p: XYZ): XYZ {
  return { 
    x: Math.round(p.x * 1000) / 1000, 
    y: Math.round(p.y * 1000) / 1000, 
    z: Math.round(p.z * 1000) / 1000 
  };
}

function norm(v: XYZ): XYZ {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 1e-9) return { x: 1, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
