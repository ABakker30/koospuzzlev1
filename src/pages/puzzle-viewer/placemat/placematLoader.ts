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
        
        let placematMesh: THREE.Mesh | null = null;
        const allPointObjects: THREE.Points[] = [];
        let meshCount = 0;
        
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            meshCount++;
            if (!placematMesh) {
              placematMesh = child;
            }
          } else if (child instanceof THREE.Points) {
            allPointObjects.push(child);
          }
        });
        
        console.log(`📊 [OBJ] Found ${meshCount} meshes, ${allPointObjects.length} Points objects`);
        
        if (!placematMesh) {
          console.error(`❌ [OBJ] No mesh found`);
          reject(new Error('Could not find placemat mesh in OBJ file'));
          return;
        }
        
        if (allPointObjects.length === 0) {
          console.error(`❌ [OBJ] No sphere center points found`);
          reject(new Error('Could not find sphere centers (Points objects) in OBJ file'));
          return;
        }
        
        // ============================================================
        // EXTRACT SPHERE CENTERS FROM ALL POINTS OBJECTS
        // Each point object contains one vertex (one sphere center)
        // ============================================================
        
        const gridCentersLocal: THREE.Vector3[] = [];
        
        for (const pointObj of allPointObjects) {
          const positions = pointObj.geometry.attributes.position;
          
          if (!positions) {
            console.warn(`⚠️ [OBJ] Points object missing position attribute, skipping`);
            continue;
          }
          
          // Extract all vertices from this Points object (usually just 1)
          for (let i = 0; i < positions.count; i++) {
            gridCentersLocal.push(new THREE.Vector3(
              positions.getX(i),
              positions.getY(i),
              positions.getZ(i)
            ));
          }
        }
        
        console.log(`📐 [GRID] Extracted ${gridCentersLocal.length} sphere centers from OBJ Points object`);
        
        // Debug: show first few sphere centers (raw from OBJ)
        const sampleSize = Math.min(5, gridCentersLocal.length);
        console.log(`   Sample centers (raw, first ${sampleSize}):`);
        for (let i = 0; i < sampleSize; i++) {
          const c = gridCentersLocal[i];
          console.log(`   [${i}]: (${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)})`);
        }
        
        // ============================================================
        // APPLY TRANSFORMATIONS TO ENTIRE GROUP
        // Rotate lid 90° counter-clockwise around Y-axis, then scale
        // ============================================================
        
        // Rotate lid mesh 90° counter-clockwise around Y-axis
        group.rotation.y = Math.PI / 2; // +90 degrees (counter-clockwise)
        
        // Scale entire group from millimeters to puzzle units
        group.scale.setScalar(MM_TO_UNITS);
        
        // Update world matrices to apply transformations
        group.updateMatrixWorld(true);
        
        // ============================================================
        // TRANSFORM GRID CENTERS TO WORLD SPACE
        // Use group's transformation matrix to get world positions
        // ============================================================
        
        const gridCenters: THREE.Vector3[] = gridCentersLocal.map(localPos => {
          // Apply group's world transformation (rotation + scale)
          const worldPos = localPos.clone();
          worldPos.applyMatrix4(group.matrixWorld);
          return worldPos;
        });
        
        // Debug: show transformed centers
        console.log(`   Sample centers (transformed, first ${sampleSize}):`);
        for (let i = 0; i < sampleSize; i++) {
          const c = gridCenters[i];
          console.log(`   [${i}]: (${c.x.toFixed(3)}, ${c.y.toFixed(3)}, ${c.z.toFixed(3)})`);
        }
        
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
