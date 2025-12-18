import * as THREE from "three";

/** Remove from scene/group and dispose mesh geometry + material */
export function removeAndDisposeMesh(scene: THREE.Scene, mesh?: THREE.Object3D) {
  if (!mesh) return;

  scene.remove(mesh);

  // InstancedMesh or Mesh
  if ((mesh as any).geometry) {
    (mesh as any).geometry.dispose?.();
  }

  const mat = (mesh as any).material;
  if (Array.isArray(mat)) {
    mat.forEach((m) => m?.dispose?.());
  } else {
    mat?.dispose?.();
  }
}

/** Remove a group and dispose ALL mesh children (geometry + material) */
export function removeAndDisposeGroup(scene: THREE.Scene, group?: THREE.Group) {
  if (!group) return;
  scene.remove(group);

  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const mat = child.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
}
