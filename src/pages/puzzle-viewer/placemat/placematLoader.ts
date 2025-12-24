import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { GridType } from './gridDetection';

const PLACEMAT_PATHS = {
  square: '/data/Placemats/Square.obj',
  hex: '/data/Placemats/hex.obj'
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
        // ============================================================
        // CRITICAL: OBJ contains both placemat mesh and sphere centers
        // ALL transformations applied to entire GROUP as single unit
        // This GUARANTEES placemat and sphere centers stay synchronized
        // ============================================================
        
        console.log(`🔍 [OBJ] Loaded group for ${gridType}`);
        console.log(`    Group type: ${group.type}, Children: ${group.children.length}`);
        
        // Identify child objects
        let placematMesh: THREE.Mesh | null = null;
        const sphereCenterPoints: THREE.Points[] = [];
        let meshCount = 0;
        let pointsCount = 0;
        
        group.traverse((child) => {
          if (child instanceof THREE.Points) {
            pointsCount++;
            sphereCenterPoints.push(child);
          }
          if (child instanceof THREE.Mesh) {
            meshCount++;
            placematMesh = child;
            // Apply material
            child.material = new THREE.MeshStandardMaterial({
              color: PRIMARY_BLUE,
              roughness: 0.6,
              metalness: 0.1
            });
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        console.log(`📊 [OBJ] Found ${meshCount} meshes, ${pointsCount} Points objects`);
        
        if (!placematMesh || sphereCenterPoints.length === 0) {
          console.error(`❌ [OBJ] Missing components`);
          reject(new Error('Could not find placemat mesh or sphere centers in OBJ file'));
          return;
        }
        
        // ============================================================
        // APPLY ALL TRANSFORMATIONS TO ENTIRE GROUP
        // NO individual geometry transformations - keeps everything in sync
        // ============================================================
        
        // Scale entire group from millimeters to puzzle units
        group.scale.setScalar(MM_TO_UNITS);
        
        // Rotate entire group -90° around X axis to match puzzle plane
        // This rotates BOTH placemat and sphere centers together - they stay synchronized
        group.rotation.x = -Math.PI / 2;
        
        // Update world matrices
        group.updateMatrixWorld(true);
        
        // ============================================================
        // EXTRACT SPHERE CENTERS IN WORLD SPACE AFTER TRANSFORMATION
        // Sphere positions automatically include all group transformations
        // ============================================================
        
        const gridCenters: THREE.Vector3[] = [];
        sphereCenterPoints.forEach(pointsObj => {
          const positions = pointsObj.geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            const localPos = new THREE.Vector3(
              positions.getX(i),
              positions.getY(i),
              positions.getZ(i)
            );
            // Convert to world space (includes all group transformations)
            const worldPos = localPos.clone();
            pointsObj.localToWorld(worldPos);
            gridCenters.push(worldPos);
          }
        });
        
        // Compute grid center
        const gridCenter = computeGridCenter(gridCenters);
        
        console.log(`✅ [PLACEMAT] Loaded ${gridType} OBJ (${gridCenters.length} sphere centers)`);
        console.log(`    ⚠️ All transformations applied to unified group - CANNOT desync`);
        
        resolve({
          mesh: group,  // Return entire group, not submesh
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
