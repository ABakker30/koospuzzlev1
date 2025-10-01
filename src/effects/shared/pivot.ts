// Pivot and transform utilities for Turn Table effect
import * as THREE from 'three';

export function createPivotAtCentroid(centroidWorld: THREE.Vector3) {
  const pivot = new THREE.Object3D();
  pivot.position.copy(centroidWorld);
  return pivot;
}

// Object mode: rotate sculpture group
export function applyObjectRotation(pivot: THREE.Object3D, sculptureGroup: THREE.Object3D, angleRad: number) {
  // pivot is parent of sculptureGroup
  pivot.rotation.set(0, angleRad, 0);
}

// Camera mode: compute camera orbit
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
  camera.lookAt(target);
}
