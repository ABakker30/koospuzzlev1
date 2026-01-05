import * as THREE from "three";
import type { IJK } from "../../types/shape";
import type { ViewTransforms } from "../../services/ViewTransforms";
import { mat4ToThree, estimateSphereRadiusFromView } from "./sceneMath";

export function renderContainerMesh(opts: {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: any;

  // refs (same ones SceneCanvas uses today)
  meshRef: React.MutableRefObject<THREE.InstancedMesh | undefined>;
  visibleCellsRef: React.MutableRefObject<IJK[]>;
  hasInitializedCameraRef: React.MutableRefObject<boolean>;
  isEditingRef: React.MutableRefObject<boolean>;
  // For per-frame transparent sorting (stores both position AND cell for synchronized updates)
  sphereDataRef?: React.MutableRefObject<Array<{ pos: THREE.Vector3; cell: IJK }>>;

  // inputs
  cells: IJK[];
  view: ViewTransforms;
  placedPieces: Array<{ cells: IJK[] }>;
  drawingCells: IJK[];
  computerDrawingCells?: IJK[];
  rejectedPieceCells?: IJK[] | null;
  previewOffsets?: IJK[] | null;
  alwaysShowContainer: boolean;

  // material settings
  containerColor: string;
  containerOpacity: number;
  containerRoughness: number;
  containerMetalness: number;

  explosionFactor: number;
}) {
  const {
    scene,
    camera,
    controls,
    meshRef,
    visibleCellsRef,
    hasInitializedCameraRef,
    isEditingRef,
    sphereDataRef,
    cells,
    view,
    placedPieces,
    drawingCells,
    computerDrawingCells = [],
    rejectedPieceCells = null,
    previewOffsets,
    alwaysShowContainer,
    containerColor,
    containerOpacity,
    containerRoughness,
    containerMetalness,
    explosionFactor,
  } = opts;

  // Cleanup previous mesh (do this even if cells is empty)
  if (meshRef.current) {
    scene.remove(meshRef.current);
    meshRef.current.geometry.dispose();
    (meshRef.current.material as THREE.Material).dispose();
    meshRef.current = undefined;
  }

  if (!cells.length) {
    visibleCellsRef.current = [];
    return;
  }

  // Build occupied set from placed pieces + drawing + computer drawing + preview
  const occupiedSet = new Set<string>();
  for (const piece of placedPieces) {
    for (const cell of piece.cells) occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
  }
  for (const cell of drawingCells) occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
  for (const cell of computerDrawingCells) occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
  if (rejectedPieceCells) {
    for (const cell of rejectedPieceCells) occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
  }
  if (previewOffsets) {
    for (const cell of previewOffsets) occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
  }

  // Filter visible cells
  const visibleCells = alwaysShowContainer
    ? cells
    : cells.filter((cell) => !occupiedSet.has(`${cell.i},${cell.j},${cell.k}`));

  const M = mat4ToThree(view.M_world);
  const radius = estimateSphereRadiusFromView(view);

  // Compute bounds for camera fit + instance positions
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  const sphereData: Array<{ pos: THREE.Vector3; cell: IJK; dist: number }> = [];
  for (let i = 0; i < visibleCells.length; i++) {
    const c = visibleCells[i];
    const p = new THREE.Vector3(c.i, c.j, c.k).applyMatrix4(M);
    
    // Calculate distance from camera for sorting (will be updated below)
    const dist = p.distanceToSquared(camera.position);
    sphereData.push({ pos: p, cell: c, dist });

    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  
  // Sort by distance from camera: farthest first (back-to-front) for proper transparency
  sphereData.sort((a, b) => b.dist - a.dist);
  
  // Store positions AND cells for per-frame re-sorting (if ref provided and transparent)
  if (sphereDataRef && containerOpacity < 1.0) {
    sphereDataRef.current = sphereData.map(d => ({ pos: d.pos, cell: d.cell }));
  } else if (sphereDataRef) {
    sphereDataRef.current = []; // Clear if not transparent
  }

  const center = new THREE.Vector3(
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2
  );
  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

  // One-time camera initialization (unchanged behavior)
  if (!hasInitializedCameraRef.current && !isEditingRef.current) {
    const fov = camera.fov * (Math.PI / 180);
    const distance = (size / 2) / Math.tan(fov / 2) * 1.0;

    camera.position.set(
      center.x + distance * 0.7,
      center.y + distance * 0.8,
      center.z + distance * 0.7
    );
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    controls?.target?.copy?.(center);
    controls?.update?.();

    hasInitializedCameraRef.current = true;
  } else if (isEditingRef.current) {
    isEditingRef.current = false;
  }

  // Create mesh
  const geom = new THREE.SphereGeometry(radius, 32, 24);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: containerMetalness,
    roughness: containerRoughness,
    transparent: containerOpacity < 1.0,
    opacity: containerOpacity,
    depthWrite: true, // Write to depth buffer - gives crisp near spheres (trade-off: less see-through)
  });

  const mesh = new THREE.InstancedMesh(geom, mat, sphereData.length);
  mesh.renderOrder = 2; // Container renders AFTER pieces (renderOrder 1) for proper transparency
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // Instance colors
  const colors = new Float32Array(sphereData.length * 3);
  const base = new THREE.Color(containerColor);
  for (let i = 0; i < sphereData.length; i++) {
    colors[i * 3] = base.r;
    colors[i * 3 + 1] = base.g;
    colors[i * 3 + 2] = base.b;
  }
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

  // Matrices (using sorted order: farthest first for proper transparency)
  for (let i = 0; i < sphereData.length; i++) {
    const p = sphereData[i].pos;
    const m = new THREE.Matrix4();
    m.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;

  // Build sorted visible cells array (matching instance order)
  const sortedVisibleCells = sphereData.map(d => d.cell);

  // Add/remove based on explosionFactor (unchanged)
  if (explosionFactor === 0) {
    scene.add(mesh);
    meshRef.current = mesh;
    visibleCellsRef.current = sortedVisibleCells;
  } else {
    // Container hidden during explosion
    meshRef.current = undefined;
  }
}
