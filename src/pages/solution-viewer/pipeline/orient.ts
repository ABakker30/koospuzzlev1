import * as THREE from 'three';
import { SolutionJSON, OrientedSolution, OrientedPiece, IJK } from '../types';
import { ijkToXyz } from '../../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../../lib/quickhull-adapter';
import type { XYZ } from '../../../types/shape';

// FCC lattice transformation matrix (same as Studio) - for future use
// const T_ijk_to_xyz = [
//   [0.5, 0.5, 0.0, 0],
//   [0.5, 0.0, 0.5, 0], 
//   [0.0, 0.5, 0.5, 0],
//   [0.0, 0.0, 0.0, 1]
// ];

export function orientSolutionWorld(solution: SolutionJSON): OrientedSolution {
  // console.log(`🧭 Orient: Starting orientation for solution with ${solution.placements.length} placements`);
  
  if (!solution.placements || solution.placements.length === 0) {
    console.error(`❌ Orient: No placements found in solution!`);
    return { pieces: [], centroid: new THREE.Vector3() };
  }
  
  // console.log(`🧭 Orient: First placement:`, solution.placements[0]);
  
  // 1) Convert IJK to world coordinates
  const rawPieces = solution.placements.map(placement => {
    // Defensive check for cells_ijk
    if (!placement.cells_ijk || !Array.isArray(placement.cells_ijk)) {
      console.warn(`⚠️ Placement missing cells_ijk:`, placement);
      return {
        id: placement.piece,
        centers: []
      };
    }
    
    return {
      id: placement.piece,
      centers: placement.cells_ijk.map((ijk: IJK) => {
        const xyz = ijkToXyz({ i: ijk[0], j: ijk[1], k: ijk[2] });
        return new THREE.Vector3(xyz.x, xyz.y, xyz.z);
      })
    };
  });

  // console.log(`🧭 Orient: Converted ${rawPieces.length} pieces from IJK to world coordinates`);

  // 2) Collect all centers for convex hull computation
  const allCenters = rawPieces.flatMap(piece => 
    piece.centers.map(v => ({ x: v.x, y: v.y, z: v.z }))
  );

  // console.log(`🔍 Orient: Computing convex hull for ${allCenters.length} sphere centers`);

  // 3) Compute convex hull to find largest face
  const hull = quickHullWithCoplanarMerge(allCenters, 1e-6);
  
  let rotationMatrix = new THREE.Matrix4(); // Identity by default
  
  if (hull.faces && hull.faces.length > 0) {
    // Find largest face
    let bestFace = hull.faces[0];
    for (const face of hull.faces) {
      if (face.area > bestFace.area) {
        bestFace = face;
      }
    }
    
    // console.log(`🏆 Orient: Largest face area: ${bestFace.area.toFixed(3)}, normal: (${bestFace.normal.x.toFixed(3)}, ${bestFace.normal.y.toFixed(3)}, ${bestFace.normal.z.toFixed(3)})`);
    
    // Create rotation to align largest face normal with -Y (down) so the face becomes the base
    const targetNormal = new THREE.Vector3(0, -1, 0); // Point downward to make this face the base
    const currentNormal = new THREE.Vector3(bestFace.normal.x, bestFace.normal.y, bestFace.normal.z);
    
    const quaternion = new THREE.Quaternion().setFromUnitVectors(currentNormal, targetNormal);
    rotationMatrix.makeRotationFromQuaternion(quaternion);
    
    // console.log(`🔄 Orient: Rotating largest face normal to point downward (-Y) to become base`);
  }

  // 4) Apply rotation to all piece centers
  const rotatedPieces: OrientedPiece[] = rawPieces.map(piece => {
    const rotatedCenters = piece.centers.map(center => center.clone().applyMatrix4(rotationMatrix));
    
    // Calculate piece centroid
    const centroid = new THREE.Vector3();
    rotatedCenters.forEach(center => centroid.add(center));
    centroid.multiplyScalar(1 / rotatedCenters.length);
    
    return {
      id: piece.id,
      centers: rotatedCenters,
      centroid
    };
  });

  // 5) Calculate overall centroid and bounds for centering
  const overallCentroid = new THREE.Vector3();
  let minY = Infinity;
  
  rotatedPieces.forEach(piece => {
    overallCentroid.add(piece.centroid);
    piece.centers.forEach(center => {
      if (center.y < minY) minY = center.y;
    });
  });
  overallCentroid.multiplyScalar(1 / rotatedPieces.length);

  // Calculate sphere radius for proper ground placement
  // Use the same method as Studio: distance between adjacent FCC lattice points
  const p0 = new THREE.Vector3().applyMatrix4(rotationMatrix);
  const p1 = new THREE.Vector3(0.5, 0.5, 0).applyMatrix4(rotationMatrix);
  const sphereRadius = p0.distanceTo(p1);
  
  // console.log(`🎯 Orient: Sphere radius: ${sphereRadius.toFixed(3)}`);
  // console.log(`🎯 Orient: Centering solution and placing on ground plane`);

  // 6) Center at origin and place on ground (Y=0 at bottom of lowest sphere)
  const offsetY = -(minY - sphereRadius); // Lift so lowest sphere bottom touches Y=0
  const finalPieces: OrientedPiece[] = rotatedPieces.map(piece => ({
    id: piece.id,
    centers: piece.centers.map(center => new THREE.Vector3(
      center.x - overallCentroid.x,
      center.y + offsetY,
      center.z - overallCentroid.z
    )),
    centroid: new THREE.Vector3(
      piece.centroid.x - overallCentroid.x,
      piece.centroid.y + offsetY,
      piece.centroid.z - overallCentroid.z
    )
  }));

  // 7) Recalculate final overall centroid
  const finalCentroid = new THREE.Vector3();
  finalPieces.forEach(piece => finalCentroid.add(piece.centroid));
  finalCentroid.multiplyScalar(1 / finalPieces.length);

  // 6) Place on ground plane (Y=0) - account for sphere radius
  const lowestY = Math.min(...finalPieces.flatMap(piece => piece.centers.map(c => c.y)));
  const estimatedSphereRadius = 0.35; // Approximate sphere radius for ground placement
  const groundOffset = -lowestY + estimatedSphereRadius; // Offset so sphere bottoms touch Y=0
  
  finalPieces.forEach(piece => {
    piece.centers.forEach(center => {
      center.y += groundOffset;
    });
    piece.centroid.y += groundOffset;
  });
  
  finalCentroid.y += groundOffset;
  
  // console.log(`🏠 Orient: Placed on ground. Ground offset: ${groundOffset.toFixed(3)}`);
  // console.log(`✅ Orient: Solution oriented and centered. Final centroid: (${finalCentroid.x.toFixed(3)}, ${finalCentroid.y.toFixed(3)}, ${finalCentroid.z.toFixed(3)})`);
  // console.log(`✅ Orient: Lowest Y after ground placement: ${Math.min(...finalPieces.flatMap(piece => piece.centers.map(c => c.y))).toFixed(3)}`);

  return {
    pieces: finalPieces,
    centroid: finalCentroid
  };
}
