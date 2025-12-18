import * as THREE from "three";
import type { IJK } from "../../types/shape";

export function buildInstancedSpheres(opts: {
  cells: IJK[];
  M: THREE.Matrix4;
  radius: number;
  material: THREE.Material;
  segments?: { w: number; h: number };
  scale?: number;
}) {
  const { cells, M, radius, material, scale = 1 } = opts;
  const segW = opts.segments?.w ?? 32;
  const segH = opts.segments?.h ?? 32;

  const geom = new THREE.SphereGeometry(radius * scale, segW, segH);
  const mesh = new THREE.InstancedMesh(geom, material, cells.length);

  const spherePositions: THREE.Vector3[] = [];
  const dummy = new THREE.Object3D();

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const pos = new THREE.Vector3(c.i, c.j, c.k).applyMatrix4(M);
    spherePositions.push(pos);
    dummy.position.copy(pos);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, geom, spherePositions };
}
