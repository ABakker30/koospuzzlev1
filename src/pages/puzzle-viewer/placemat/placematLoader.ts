import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { GridType } from './gridDetection';

const PLACEMAT_PATHS = {
  square: '/data/Box_lids/Bottom.obj',
  triangular: '/data/Box_lids/Top.obj'
};

export interface PlacematData {
  mesh: THREE.Group;
  gridCenters: THREE.Vector3[];
  gridCenter: THREE.Vector3;
  gridType: GridType;
}

const PRIMARY_BLUE = 0x3B82F6;

// OBJ files are in millimeters and contain both mesh and sphere centers
// Puzzle uses unit scale where sphere diameter ≈ 0.708 units
// Real-world spheres: 25mm diameter
// Conversion: 1mm = 0.708/25 ≈ 0.02832 units
const MM_TO_UNITS = 0.708 / 25;

export async function loadPlacemat(gridType: GridType): Promise<PlacematData> {
  const objLoader = new OBJLoader();
  const path = PLACEMAT_PATHS[gridType];
  
  return new Promise((resolve, reject) => {
    objLoader.load(
      path,
      (group) => {
        console.log(`🔍 [OBJ] Loaded group for ${gridType}`);
        console.log(`    Group type: ${group.type}, Children: ${group.children.length}`);
        
        // Find mesh
        let placematMesh: THREE.Mesh | null = null;
        let meshCount = 0;
        
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            meshCount++;
            placematMesh = child;
            child.material = new THREE.MeshStandardMaterial({
              color: PRIMARY_BLUE,
              roughness: 0.6,
              metalness: 0.1
            });
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        console.log(`📊 [OBJ] Found ${meshCount} meshes`);
        
        if (!placematMesh) {
          console.error(`❌ [OBJ] No mesh found`);
          reject(new Error('Could not find placemat mesh in OBJ file'));
          return;
        }
        
        // ============================================================
        // GENERATE SPHERE CENTERS PROGRAMMATICALLY
        // Bottom.obj: 12×12 square grid, 25mm spacing
        // Top.obj: 13×14 triangular grid, 25mm spacing
        // Origin = bottom-left sphere center in OBJ file coordinates (mm)
        // ============================================================
        
        const SPHERE_SPACING_MM = 25;
        const gridCentersLocal: THREE.Vector3[] = [];
        
        if (gridType === 'square') {
          // 12×12 square lattice
          for (let row = 0; row < 12; row++) {
            for (let col = 0; col < 12; col++) {
              gridCentersLocal.push(new THREE.Vector3(
                col * SPHERE_SPACING_MM,
                0,
                row * SPHERE_SPACING_MM
              ));
            }
          }
        } else if (gridType === 'triangular') {
          // 13×14 triangular lattice
          for (let row = 0; row < 14; row++) {
            const cols = row % 2 === 0 ? 13 : 12;
            const offsetX = row % 2 === 0 ? 0 : SPHERE_SPACING_MM / 2;
            for (let col = 0; col < cols; col++) {
              gridCentersLocal.push(new THREE.Vector3(
                offsetX + col * SPHERE_SPACING_MM,
                0,
                row * SPHERE_SPACING_MM * Math.sqrt(3) / 2
              ));
            }
          }
        }
        
        console.log(`📐 [GRID] Generated ${gridCentersLocal.length} sphere centers for ${gridType} grid`);
        
        // ============================================================
        // APPLY TRANSFORMATIONS TO ENTIRE GROUP
        // Files are already properly oriented (Y = vertical, origin = bottom-left sphere)
        // Only need scale conversion from mm to puzzle units
        // ============================================================
        
        // Scale entire group from millimeters to puzzle units
        group.scale.setScalar(MM_TO_UNITS);
        
        // Update world matrices
        group.updateMatrixWorld(true);
        
        // ============================================================
        // TRANSFORM GRID CENTERS TO WORLD SPACE
        // ============================================================
        
        const gridCenters: THREE.Vector3[] = gridCentersLocal.map(localPos => {
          const worldPos = localPos.clone();
          // Apply scale only (no rotation needed - files already oriented)
          worldPos.multiplyScalar(MM_TO_UNITS);
          return worldPos;
        });
        
        const gridCenter = computeGridCenter(gridCenters);
        
        console.log(`✅ [PLACEMAT] Loaded ${gridType} OBJ (${gridCenters.length} sphere centers)`);
        
        resolve({
          mesh: group,
          gridCenters,
          gridCenter,
          gridType
        });
      },
      undefined,
      (error) => {
        console.error(`❌ Failed to load ${gridType} OBJ:`, error);
        reject(error);
      }
    );
  });
}

function computeGridCenter(centers: THREE.Vector3[]): THREE.Vector3 {
  if (centers.length === 0) {
    return new THREE.Vector3(0, 0, 0);
  }
  
  const sum = centers.reduce((acc, c) => acc.add(c.clone()), new THREE.Vector3(0, 0, 0));
  return sum.divideScalar(centers.length);
}

export function computeSphereScaleFactor(
  bottomLayerCenters: { x: number; y: number; z: number }[],
  placematGridCenters: THREE.Vector3[]
): number {
  if (bottomLayerCenters.length < 2) {
    console.warn('⚠️ Not enough puzzle spheres to compute scale factor, using 1.0');
    return 1.0;
  }
  
  if (placematGridCenters.length < 2) {
    console.warn('⚠️ Not enough placemat grid centers to compute scale factor, using 1.0');
    return 1.0;
  }
  
  // Find minimum distance between puzzle sphere centers
  let puzzleMinDist = Infinity;
  for (let i = 0; i < bottomLayerCenters.length; i++) {
    for (let j = i + 1; j < bottomLayerCenters.length; j++) {
      const dx = bottomLayerCenters[i].x - bottomLayerCenters[j].x;
      const dz = bottomLayerCenters[i].z - bottomLayerCenters[j].z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.001 && dist < puzzleMinDist) {
        puzzleMinDist = dist;
      }
    }
  }
  
  // Find minimum distance between placemat grid centers
  let placematMinDist = Infinity;
  for (let i = 0; i < placematGridCenters.length; i++) {
    for (let j = i + 1; j < placematGridCenters.length; j++) {
      const dx = placematGridCenters[i].x - placematGridCenters[j].x;
      const dz = placematGridCenters[i].z - placematGridCenters[j].z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.001 && dist < placematMinDist) {
        placematMinDist = dist;
      }
    }
  }
  
  if (!isFinite(puzzleMinDist) || puzzleMinDist === 0) {
    console.warn('⚠️ Could not determine puzzle sphere spacing, using 1.0');
    return 1.0;
  }
  
  if (!isFinite(placematMinDist) || placematMinDist === 0) {
    console.warn('⚠️ Could not determine placemat grid spacing, using 1.0');
    return 1.0;
  }
  
  // Scale puzzle to match placemat grid spacing
  const scaleFactor = placematMinDist / puzzleMinDist;
  
  console.log(`📏 Sphere scaling: puzzle spacing=${puzzleMinDist.toFixed(3)}, placemat spacing=${placematMinDist.toFixed(3)}, scale=${scaleFactor.toFixed(3)}`);
  
  return scaleFactor;
}

export function computePlacementOffset(
  solutionCenters: { x: number; y: number; z: number }[],
  placematGridCenter: THREE.Vector3
): THREE.Vector3 {
  if (solutionCenters.length === 0) {
    return new THREE.Vector3(0, 0, 0);
  }
  
  // Compute solution center (XZ only)
  let sumX = 0, sumZ = 0;
  for (const c of solutionCenters) {
    sumX += c.x;
    sumZ += c.z;
  }
  const solutionCenter = new THREE.Vector3(
    sumX / solutionCenters.length,
    0, // Ignore Y
    sumZ / solutionCenters.length
  );
  
  // Offset to align solution center with placemat grid center
  const offset = new THREE.Vector3(
    placematGridCenter.x - solutionCenter.x,
    0, // Don't offset Y here, handled separately by ground alignment
    placematGridCenter.z - solutionCenter.z
  );
  
  console.log(`📍 Placement offset: (${offset.x.toFixed(2)}, ${offset.z.toFixed(2)})`);
  
  return offset;
}
