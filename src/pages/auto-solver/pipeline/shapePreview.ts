// src/pages/auto-solver/pipeline/shapePreview.ts
import * as THREE from 'three';
import { ContainerJSON, OrientationRecord, IJK } from '../types';

// High-quality geometry constants (same as Solution Viewer)
const SPHERE_SEGMENTS = 64;

/**
 * Build blue shape preview with HQ spheres
 * Follows Solution Viewer quality and material settings
 */
export function buildShapePreviewGroup(
  json: ContainerJSON,
  orient: OrientationRecord
): { group: THREE.Group; R: number } {
  console.log(`🎨 AutoSolver: Building blue shape preview for ${json.cells_ijk.length} cells`);
  
  // 1) Transform IJK cells to world coordinates using orientation matrix
  const worldCenters: THREE.Vector3[] = json.cells_ijk.map(ijk => {
    const [i, j, k] = ijk;
    const ijkVec = new THREE.Vector3(i, j, k);
    ijkVec.applyMatrix4(orient.M_worldFromIJK);
    return ijkVec;
  });
  
  // 2) Compute global sphere radius R from minimum pairwise distance
  let minDist = Infinity;
  for (let i = 0; i < worldCenters.length; i++) {
    for (let j = i + 1; j < worldCenters.length; j++) {
      const dist = worldCenters[i].distanceTo(worldCenters[j]);
      if (dist > 1e-6 && dist < minDist) {
        minDist = dist;
      }
    }
  }
  
  const R = minDist * 0.5; // Spheres just touch at closest points
  console.log(`📏 AutoSolver: Computed sphere radius R=${R.toFixed(4)} from ${worldCenters.length} centers`);
  
  // 3) Create shared high-quality sphere geometry
  const sphereGeo = new THREE.SphereGeometry(R, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
  
  // 4) Create blue material (Solution Viewer style with optimized settings)
  // Using same material properties as Solution Viewer but with blue color
  const blueMat = new THREE.MeshStandardMaterial({
    color: 0x4A90E2, // Professional blue
    metalness: 0.40,  // Same as Solution Viewer
    roughness: 0.10,  // reflectiveness = 1 - roughness = 0.90
    envMapIntensity: 2.50, // brightness setting
    side: THREE.FrontSide
  });
  
  // 5) Create group and add sphere meshes
  const group = new THREE.Group();
  group.name = 'ShapePreviewGroup';
  
  worldCenters.forEach((center, index) => {
    const mesh = new THREE.Mesh(sphereGeo, blueMat);
    mesh.position.copy(center);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `ShapeCell_${index}`;
    group.add(mesh);
  });
  
  console.log(`✅ AutoSolver: Created blue shape preview with ${group.children.length} HQ spheres (R=${R.toFixed(4)})`);
  
  return { group, R };
}
