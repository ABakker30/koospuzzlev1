import * as THREE from "three";
import type { IJK } from "../../types/shape";
import { buildInstancedSpheres } from "./buildInstancedSpheres";
import { buildBonds } from "./buildBonds";
import { removeAndDisposeMesh, removeAndDisposeGroup } from "./disposeThree";

export function renderOverlayLayer(opts: {
  scene: THREE.Scene;
  viewMWorld: number[][]; // view.M_world
  cells: IJK[];
  showBonds: boolean;

  material: THREE.Material;
  radius: number;

  meshRef: React.MutableRefObject<THREE.InstancedMesh | undefined>;
  bondsRef: React.MutableRefObject<THREE.Group | undefined>;

  segments?: { w: number; h: number };
  scale?: number;

  bondRadiusFactor?: number;
  thresholdFactor?: number;
  radialSegments?: number;

  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const {
    scene,
    viewMWorld,
    cells,
    showBonds,
    material,
    radius,
    meshRef,
    bondsRef,
    segments = { w: 32, h: 32 },
    scale = 1,
    bondRadiusFactor = 0.35,
    thresholdFactor = 1.1,
    radialSegments = 48,
    castShadow = true,
    receiveShadow = true,
  } = opts;

  // Cleanup previous
  removeAndDisposeMesh(scene, meshRef.current);
  meshRef.current = undefined;

  removeAndDisposeGroup(scene, bondsRef.current);
  bondsRef.current = undefined;

  if (!cells || cells.length === 0) return;

  // Build spheres
  const M = new THREE.Matrix4().set(
    viewMWorld[0][0], viewMWorld[0][1], viewMWorld[0][2], viewMWorld[0][3],
    viewMWorld[1][0], viewMWorld[1][1], viewMWorld[1][2], viewMWorld[1][3],
    viewMWorld[2][0], viewMWorld[2][1], viewMWorld[2][2], viewMWorld[2][3],
    viewMWorld[3][0], viewMWorld[3][1], viewMWorld[3][2], viewMWorld[3][3]
  );

  const { mesh, spherePositions } = buildInstancedSpheres({
    cells,
    M,
    radius,
    material,
    segments,
    scale,
  });

  (mesh as any).castShadow = castShadow;
  (mesh as any).receiveShadow = receiveShadow;

  scene.add(mesh);
  meshRef.current = mesh;

  // Bonds
  if (showBonds) {
    const { bondGroup } = buildBonds({
      spherePositions,
      radius,
      material,
      bondRadiusFactor,
      thresholdFactor,
      radialSegments,
    });

    bondGroup.children.forEach(mesh => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    scene.add(bondGroup);
    bondsRef.current = bondGroup;
  }
}
