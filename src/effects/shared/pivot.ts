// Pivot and transform utilities for Turn Table effect
import * as THREE from 'three';

export function createPivotAtCentroid(centroidWorld: THREE.Vector3, keepOnXZPlane: boolean = false) {
  const pivot = new THREE.Object3D();
  if (keepOnXZPlane) {
    // For object mode: pivot on XZ plane to prevent Y-axis jump
    pivot.position.set(centroidWorld.x, 0, centroidWorld.z);
  } else {
    // For camera mode: use full centroid position
    pivot.position.copy(centroidWorld);
  }
  return pivot;
}

// Object mode: rotate sculpture group
export function applyObjectRotation(pivot: THREE.Object3D, sculptureGroup: THREE.Object3D, angleRad: number) {
  // pivot is parent of sculptureGroup
  pivot.rotation.set(0, angleRad, 0);
}

// Camera mode: compute camera orbit position (preserves camera orientation)
export function setCameraOnOrbit(
  camera: THREE.PerspectiveCamera, 
  target: THREE.Vector3, 
  radius: number, 
  angleRad: number, 
  elevationRad: number
) {
  const x = target.x + radius * Math.cos(elevationRad) * Math.cos(angleRad);
  const y = target.y + radius * Math.sin(elevationRad);
  const z = target.z + radius * Math.cos(elevationRad) * Math.sin(angleRad);
  camera.position.set(x, y, z);
  // Don't call camera.lookAt() - preserve user's camera orientation
}
