import * as THREE from "three";
import type { IJK } from "../../types/shape";
import type { ViewTransforms } from "../../services/ViewTransforms";
import { mat4ToThree, estimateSphereRadiusFromView } from "./sceneMath";

type RenderNeighborsParams = {
  scene: THREE.Scene;
  view: ViewTransforms;
  cells: IJK[];
  editMode: boolean;
  mode: "add" | "remove";
  containerRoughness: number;
  neighborMeshRef: React.MutableRefObject<THREE.InstancedMesh | undefined>;
  neighborIJKsRef: React.MutableRefObject<IJK[]>;
};

export function renderNeighbors({
  scene,
  view,
  cells,
  editMode,
  mode,
  containerRoughness,
  neighborMeshRef,
  neighborIJKsRef,
}: RenderNeighborsParams) {
  // Clean up previous neighbor spheres
  if (neighborMeshRef.current) {
    const neighborSpheres = neighborMeshRef.current as any as THREE.Mesh[];
    if (Array.isArray(neighborSpheres)) {
      neighborSpheres.forEach(sphere => {
        scene.remove(sphere);
        sphere.geometry.dispose();
        (sphere.material as THREE.Material).dispose();
      });
    } else {
      // Handle old instanced mesh format
      scene.remove(neighborMeshRef.current);
      neighborMeshRef.current.geometry.dispose();
      (neighborMeshRef.current.material as THREE.Material).dispose();
    }
    neighborMeshRef.current = undefined;
  }

  // Only create neighbors in add mode
  if (!editMode || mode !== "add" || !cells.length) {
    return;
  }

  const M = mat4ToThree(view.M_world);
  const radius = estimateSphereRadiusFromView(view);
  
  // Generate all 18 FCC neighbors
  const existingCells = new Set(cells.map(cell => `${cell.i},${cell.j},${cell.k}`));
  const potentialNeighbors = new Set<string>();
  
  for (const cell of cells) {
    const neighbors = [
      // 6 Face-adjacent neighbors
      { i: cell.i + 1, j: cell.j, k: cell.k },
      { i: cell.i - 1, j: cell.j, k: cell.k },
      { i: cell.i, j: cell.j + 1, k: cell.k },
      { i: cell.i, j: cell.j - 1, k: cell.k },
      { i: cell.i, j: cell.j, k: cell.k + 1 },
      { i: cell.i, j: cell.j, k: cell.k - 1 },
      // 12 Face-diagonal neighbors (FCC)
      { i: cell.i + 1, j: cell.j + 1, k: cell.k },
      { i: cell.i + 1, j: cell.j - 1, k: cell.k },
      { i: cell.i - 1, j: cell.j + 1, k: cell.k },
      { i: cell.i - 1, j: cell.j - 1, k: cell.k },
      { i: cell.i + 1, j: cell.j, k: cell.k + 1 },
      { i: cell.i + 1, j: cell.j, k: cell.k - 1 },
      { i: cell.i - 1, j: cell.j, k: cell.k + 1 },
      { i: cell.i - 1, j: cell.j, k: cell.k - 1 },
      { i: cell.i, j: cell.j + 1, k: cell.k + 1 },
      { i: cell.i, j: cell.j + 1, k: cell.k - 1 },
      { i: cell.i, j: cell.j - 1, k: cell.k + 1 },
      { i: cell.i, j: cell.j - 1, k: cell.k - 1 }
    ];
    
    for (const neighbor of neighbors) {
      const key = `${neighbor.i},${neighbor.j},${neighbor.k}`;
      if (!existingCells.has(key)) {
        potentialNeighbors.add(key);
      }
    }
  }
  
  // Convert to oriented positions and apply distance culling
  const neighborPositions: THREE.Vector3[] = [];
  const neighborIJKs: IJK[] = [];
  const actualCellPositions: THREE.Vector3[] = [];
  
  // Get actual cell positions in world coordinates
  for (const cell of cells) {
    const p_ijk = new THREE.Vector3(cell.i, cell.j, cell.k);
    const p = p_ijk.applyMatrix4(M);
    actualCellPositions.push(p);
  }
  
  // Distance culling: only keep neighbors within one diameter + margin
  const sphereDiameter = radius * 2;
  const maxDistance = sphereDiameter * 1.1; // 10% margin for edge cases
  
  for (const neighborKey of potentialNeighbors) {
    const [i, j, k] = neighborKey.split(',').map(Number);
    const p_ijk = new THREE.Vector3(i, j, k);
    const neighborPos = p_ijk.applyMatrix4(M);
    
    // Check if this neighbor is within range of any actual cell
    let isWithinRange = false;
    for (const cellPos of actualCellPositions) {
      const distance = neighborPos.distanceTo(cellPos);
      if (distance <= maxDistance) {
        isWithinRange = true;
        break;
      }
    }
    
    if (isWithinRange) {
      neighborPositions.push(neighborPos);
      neighborIJKs.push({ i, j, k });
    }
  }
  
  // Store IJK data for click handling
  neighborIJKsRef.current = neighborIJKs;
  
  // Create individual neighbor spheres with separate materials
  if (neighborPositions.length > 0) {
    const neighborGeom = new THREE.SphereGeometry(radius, 32, 24);
    const neighborSpheres: THREE.Mesh[] = [];
    
    for (let i = 0; i < neighborPositions.length; i++) {
      // Create individual material for each neighbor (fully transparent)
      const neighborMat = new THREE.MeshStandardMaterial({ 
        color: 0x00ff00,
        metalness: 0,  // Neighbors are not metallic
        roughness: containerRoughness,
        transparent: true,
        opacity: 0 // Completely invisible
      });
      
      // Create individual mesh for each neighbor
      const neighborSphere = new THREE.Mesh(neighborGeom, neighborMat);
      neighborSphere.position.copy(neighborPositions[i]);
      
      scene.add(neighborSphere);
      neighborSpheres.push(neighborSphere);
    }
    
    // Store neighbor spheres for hover detection
    neighborMeshRef.current = neighborSpheres as any;
  }
}
