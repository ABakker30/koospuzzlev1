import * as THREE from "three";
import type { IJK } from "../../types/shape";
import type { ViewTransforms } from "../../services/ViewTransforms";
import { mat4ToThree, estimateSphereRadiusFromView, getPieceColor } from "./sceneMath";
import { buildBonds } from "./buildBonds";

export function renderPlacedPieces(opts: {
  scene: THREE.Scene;

  // refs
  placedMeshesRef: React.MutableRefObject<Map<string, THREE.InstancedMesh>>;
  placedBondsRef: React.MutableRefObject<Map<string, THREE.Group>>;
  placedPiecesGroupRef: React.MutableRefObject<THREE.Group | null>;

  // inputs
  view: ViewTransforms;
  placedPieces: Array<{
    uid: string;
    pieceId: string;
    orientationId: string;
    anchorSphereIndex: 0 | 1 | 2 | 3;
    cells: IJK[];
    placedAt: number;
  }>;

  // selection / visibility
  selectedPieceUid: string | null;
  hidePlacedPieces: boolean;
  temporarilyVisiblePieces: Set<string>;

  // rendering knobs
  puzzleMode: 'oneOfEach' | 'unlimited' | 'single';
  showBonds: boolean;

  // material settings
  piecesMetalness: number;
  piecesRoughness: number;
  piecesOpacity: number;
  sphereColorTheme?: 'default' | 'whiteMarbleCluster';
}) {
  const {
    scene,
    placedMeshesRef,
    placedBondsRef,
    placedPiecesGroupRef,
    view,
    placedPieces,
    selectedPieceUid,
    hidePlacedPieces,
    temporarilyVisiblePieces,
    puzzleMode,
    showBonds,
    piecesMetalness,
    piecesRoughness,
    piecesOpacity,
    sphereColorTheme,
  } = opts;

  const placedGroup = placedPiecesGroupRef.current;

  // Toggle visibility first (keep in memory)
  for (const [uid, mesh] of placedMeshesRef.current.entries()) {
    mesh.visible = !hidePlacedPieces || temporarilyVisiblePieces.has(uid);
  }
  for (const [uid, bondGroup] of placedBondsRef.current.entries()) {
    bondGroup.visible = !hidePlacedPieces || temporarilyVisiblePieces.has(uid);
  }

  if (hidePlacedPieces && temporarilyVisiblePieces.size === 0) {
    return;
  }

  const M = mat4ToThree(view.M_world);
  const radius = estimateSphereRadiusFromView(view);

  // Clean up removed pieces
  const currentUids = new Set(placedPieces.map((p) => p.uid));

  for (const [uid, mesh] of placedMeshesRef.current.entries()) {
    if (!currentUids.has(uid)) {
      if (placedGroup) placedGroup.remove(mesh);
      else scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      placedMeshesRef.current.delete(uid);
    }
  }

  for (const [uid, bondGroup] of placedBondsRef.current.entries()) {
    if (!currentUids.has(uid)) {
      if (placedGroup) placedGroup.remove(bondGroup);
      else scene.remove(bondGroup);
      bondGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
      placedBondsRef.current.delete(uid);
    }
  }

  const BOND_RADIUS_FACTOR = 0.35;

  for (const piece of placedPieces) {
    const isSelected = piece.uid === selectedPieceUid;

    // If already exists, check if we must recreate (selection change or puzzleMode change)
    if (placedMeshesRef.current.has(piece.uid)) {
      const existingMesh = placedMeshesRef.current.get(piece.uid)!;
      const currentEmissive = (existingMesh.material as THREE.MeshStandardMaterial).emissive.getHex();
      const shouldBeEmissive = isSelected ? 0xffffff : 0x000000;

      const needsRecreate =
        currentEmissive !== shouldBeEmissive ||
        existingMesh.userData.puzzleMode !== puzzleMode;

      if (!needsRecreate) continue;

      // remove old mesh
      if (placedGroup) placedGroup.remove(existingMesh);
      else scene.remove(existingMesh);
      existingMesh.geometry.dispose();
      (existingMesh.material as THREE.Material).dispose();
      placedMeshesRef.current.delete(piece.uid);

      // remove old bonds
      const existingBonds = placedBondsRef.current.get(piece.uid);
      if (existingBonds) {
        if (placedGroup) placedGroup.remove(existingBonds);
        else scene.remove(existingBonds);
        existingBonds.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            (obj.material as THREE.Material).dispose();
          }
        });
        placedBondsRef.current.delete(piece.uid);
      }
    }

    // Create new instanced mesh
    const geom = new THREE.SphereGeometry(radius, 64, 64);

    const colorKey = puzzleMode === 'oneOfEach' ? piece.pieceId : piece.uid;
    const color = getPieceColor(colorKey, sphereColorTheme);

    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: piecesMetalness,
      roughness: piecesRoughness,
      transparent: piecesOpacity < 1.0,
      opacity: piecesOpacity,
      envMapIntensity: 1.5,
      emissive: isSelected ? 0xffffff : 0x000000,
      emissiveIntensity: isSelected ? 0.3 : 0,
    });

    const mesh = new THREE.InstancedMesh(geom, mat, piece.cells.length);

    const spherePositions: THREE.Vector3[] = [];
    for (let i = 0; i < piece.cells.length; i++) {
      const cell = piece.cells[i];
      const p = new THREE.Vector3(cell.i, cell.j, cell.k).applyMatrix4(M);
      spherePositions.push(p);

      const m = new THREE.Matrix4();
      m.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.puzzleMode = puzzleMode;

    if (placedGroup) placedGroup.add(mesh);
    else scene.add(mesh);

    placedMeshesRef.current.set(piece.uid, mesh);

    if (showBonds) {
      const { bondGroup } = buildBonds({
        spherePositions,
        radius,
        material: mat,
        bondRadiusFactor: BOND_RADIUS_FACTOR,
        thresholdFactor: 1.1,
        radialSegments: 48,
      });

      bondGroup.children.forEach((m) => {
        (m as any).castShadow = true;
        (m as any).receiveShadow = true;
      });

      if (placedGroup) placedGroup.add(bondGroup);
      else scene.add(bondGroup);

      placedBondsRef.current.set(piece.uid, bondGroup);
    }
  }
}
