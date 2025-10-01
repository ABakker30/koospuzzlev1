import * as THREE from 'three';

/**
 * Preferred: compute bbox center from known sphere centers (cells) + radius.
 * centers: Float32Array | ArrayLike<number> of length 3N [x0,y0,z0, x1,y1,z1, ...]
 * All spheres share the same radius R (optional).
 */
export function bboxCentroidFromCenters(centers: ArrayLike<number>, sphereRadius = 0): THREE.Vector3 {
  const min = new THREE.Vector3( Infinity,  Infinity,  Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < centers.length; i += 3) {
    const x = centers[i], y = centers[i+1], z = centers[i+2];
    if (x - sphereRadius < min.x) min.x = x - sphereRadius;
    if (y - sphereRadius < min.y) min.y = y - sphereRadius;
    if (z - sphereRadius < min.z) min.z = z - sphereRadius;
    if (x + sphereRadius > max.x) max.x = x + sphereRadius;
    if (y + sphereRadius > max.y) max.y = y + sphereRadius;
    if (z + sphereRadius > max.z) max.z = z + sphereRadius;
  }
  return new THREE.Vector3(
    0.5 * (min.x + max.x),
    0.5 * (min.y + max.y),
    0.5 * (min.z + max.z)
  );
}

/**
 * Fallback: traverse scene and include InstancedMesh properly.
 * This builds a bbox by transforming the geometry's boundingBox by each instance matrix.
 */
export function bboxCentroidFromScene(scene: THREE.Scene): THREE.Vector3 {
  const min = new THREE.Vector3( Infinity,  Infinity,  Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const tmpBox = new THREE.Box3();
  const worldBox = new THREE.Box3();
  const tmpMat = new THREE.Matrix4();

  scene.traverse((obj) => {
    const anyObj = obj as any;
    if (!obj.visible) return;

    // InstancedMesh
    if (anyObj.isInstancedMesh) {
      const inst: THREE.InstancedMesh = anyObj;
      const geo = inst.geometry as THREE.BufferGeometry;
      if (!geo) return;
      if (!geo.boundingBox) { geo.computeBoundingBox(); }
      tmpBox.copy(geo.boundingBox!);
      const count = inst.count ?? inst.instanceMatrix.count ?? 0;
      for (let i = 0; i < count; i++) {
        inst.getMatrixAt(i, tmpMat);
        // include world transform of the instanced parent
        const worldMat = new THREE.Matrix4().multiplyMatrices(inst.matrixWorld, tmpMat);
        worldBox.copy(tmpBox).applyMatrix4(worldMat);
        min.min(worldBox.min);
        max.max(worldBox.max);
      }
      return;
    }

    // Regular Mesh
    const mesh = obj as THREE.Mesh;
    if ((mesh as any).isMesh && mesh.geometry) {
      const geo = mesh.geometry as THREE.BufferGeometry;
      if (!geo.boundingBox) { geo.computeBoundingBox(); }
      worldBox.copy(geo.boundingBox!).applyMatrix4(mesh.matrixWorld);
      min.min(worldBox.min);
      max.max(worldBox.max);
    }
  });

  return new THREE.Vector3(
    0.5 * (min.x + max.x),
    0.5 * (min.y + max.y),
    0.5 * (min.z + max.z)
  );
}
