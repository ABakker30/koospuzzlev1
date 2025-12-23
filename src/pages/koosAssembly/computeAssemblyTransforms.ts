import * as THREE from 'three';
import { AssemblyPiece, PieceId } from './loadSolutionForAssembly';
import { WORLD_SPHERE_RADIUS, MAT_TOP_Y } from './constants';

export interface PieceTransform {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export interface ThreeTransforms {
  final: Record<PieceId, PieceTransform>;
  exploded: Record<PieceId, PieceTransform>;
  table: Record<PieceId, PieceTransform>;
}

const EXPLODE_DIST = 2.5 * WORLD_SPHERE_RADIUS;
const MAT_HALF = 7; // Half of mat size (14/2)
const TABLE_RING_RADIUS = MAT_HALF + 6;
const TABLE_HEIGHT = MAT_TOP_Y + WORLD_SPHERE_RADIUS + 0.5; // Mat surface + radius + clearance

export function computeAssemblyTransforms(
  pieces: AssemblyPiece[],
  puzzleCentroid: THREE.Vector3,
  rootQuat?: THREE.Quaternion
): ThreeTransforms {
  // Inverse root quaternion for localizing world-space poses
  const invRoot = rootQuat ? rootQuat.clone().invert() : new THREE.Quaternion();
  const final: Record<PieceId, PieceTransform> = {};
  const exploded: Record<PieceId, PieceTransform> = {};
  const table: Record<PieceId, PieceTransform> = {};

  pieces.forEach((piece, index) => {
    // FINAL transforms - use piece.finalTransform directly
    const finalPos = new THREE.Vector3(...piece.finalTransform.position);
    const finalQuat = new THREE.Quaternion(...piece.finalTransform.quaternion);

    final[piece.pieceId] = {
      position: finalPos.clone(),
      quaternion: finalQuat.clone(),
    };

    // Compute piece centroid in world space for explode calculation
    const pieceCentroid = new THREE.Vector3();
    piece.spheres.forEach((sphere) => {
      const localSphere = new THREE.Vector3(sphere.x, sphere.y, sphere.z);
      // Transform sphere by final transform
      localSphere.applyQuaternion(finalQuat);
      localSphere.add(finalPos);
      pieceCentroid.add(localSphere);
    });
    pieceCentroid.divideScalar(piece.spheres.length);

    // EXPLODED transforms - offset outward from puzzle centroid
    const direction = pieceCentroid.clone().sub(puzzleCentroid).normalize();
    const explodedPos = finalPos.clone().add(direction.multiplyScalar(EXPLODE_DIST));

    // Localize exploded pose to puzzleRoot space
    const explodedPosLocal = explodedPos.clone().applyQuaternion(invRoot);
    const explodedQuatLocal = invRoot.clone().multiply(finalQuat);

    exploded[piece.pieceId] = {
      position: explodedPosLocal,
      quaternion: explodedQuatLocal,
    };

    // TABLE transforms - scattered around mat, lying flat
    // Distribute in a ring around the mat
    const angle = (index / pieces.length) * Math.PI * 2 + Math.random() * 0.3;
    const tableX = TABLE_RING_RADIUS * Math.cos(angle);
    const tableZ = TABLE_RING_RADIUS * Math.sin(angle);
    const tableY = TABLE_HEIGHT;

    const tablePos = new THREE.Vector3(tableX, tableY, tableZ);

    // Compute "flat" orientation
    // Simple approach: align piece's local up with world up, then add random yaw
    const randomYaw = Math.random() * Math.PI * 2;
    
    // Try to orient piece to lie flat
    // Find the smallest extent axis of the piece (thickness)
    const bounds = { min: new THREE.Vector3(), max: new THREE.Vector3() };
    piece.spheres.forEach((sphere) => {
      const s = new THREE.Vector3(sphere.x, sphere.y, sphere.z);
      bounds.min.min(s);
      bounds.max.max(s);
    });
    
    const extents = bounds.max.clone().sub(bounds.min);
    
    // Find smallest extent axis (0=x, 1=y, 2=z)
    let minAxis = 0;
    let minExtent = extents.x;
    if (extents.y < minExtent) {
      minAxis = 1;
      minExtent = extents.y;
    }
    if (extents.z < minExtent) {
      minAxis = 2;
    }

    // Create rotation to align smallest axis with world Y
    let tableQuat = new THREE.Quaternion();
    
    if (minAxis === 0) {
      // Rotate X to Y (90 deg around Z)
      tableQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    } else if (minAxis === 2) {
      // Rotate Z to Y (90 deg around X)
      tableQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    }
    // If minAxis === 1, no rotation needed (already aligned)

    // Add random yaw around Y axis
    const yawQuat = new THREE.Quaternion();
    yawQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), randomYaw);
    tableQuat.premultiply(yawQuat);

    // Localize table pose to puzzleRoot space (keeps table flat in world)
    const tablePosLocal = tablePos.clone().applyQuaternion(invRoot);
    const tableQuatLocal = invRoot.clone().multiply(tableQuat);

    table[piece.pieceId] = {
      position: tablePosLocal,
      quaternion: tableQuatLocal,
    };
  });

  return { final, exploded, table };
}
