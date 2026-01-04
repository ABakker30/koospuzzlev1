import * as THREE from "three";

export function buildBonds(opts: {
  spherePositions: THREE.Vector3[];
  radius: number;
  material: THREE.Material;
  bondRadiusFactor?: number;
  thresholdFactor?: number;
  radialSegments?: number;
}) {
  const {
    spherePositions,
    radius,
    material,
    bondRadiusFactor = 0.35,
    thresholdFactor = 1.1,
    radialSegments = 48,
  } = opts;

  const bondGroup = new THREE.Group();
  const bondThreshold = radius * 2 * thresholdFactor;
  const cylinderGeo = new THREE.CylinderGeometry(
    bondRadiusFactor * radius,
    bondRadiusFactor * radius,
    1,
    radialSegments
  );

  // Calculate cylinder radius for length calculation
  const cylinderRadius = bondRadiusFactor * radius;
  
  for (let a = 0; a < spherePositions.length; a++) {
    for (let b = a + 1; b < spherePositions.length; b++) {
      const pa = spherePositions[a];
      const pb = spherePositions[b];
      const distance = pa.distanceTo(pb);
      if (distance >= bondThreshold) continue;

      const bondMesh = new THREE.Mesh(cylinderGeo, material);
      const midpoint = new THREE.Vector3().addVectors(pa, pb).multiplyScalar(0.5);
      bondMesh.position.copy(midpoint);

      const direction = new THREE.Vector3().subVectors(pb, pa).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      bondMesh.setRotationFromQuaternion(q);

      // Cylinder length: L = 0.3 * (R - cylinderRadius)
      // This makes the cylinder surface just touch the sphere surface at each end
      const cylinderLength = 0.3 * (radius - cylinderRadius);
      bondMesh.scale.y = cylinderLength;
      bondGroup.add(bondMesh);
    }
  }

  return { bondGroup, cylinderGeo };
}
