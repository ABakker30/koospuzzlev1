// src/pages/auto-solver/pipeline/renderStatus.ts
import * as THREE from 'three';
import { OrientationRecord } from '../types';
import { EngineEvent, EnginePlacement } from '../engine/engineTypes';

// Solution Viewer quality constants
const SPHERE_SEGMENTS = 64;
const CYL_RADIAL_SEGMENTS = 48;
const CYL_HEIGHT_SEGMENTS = 1;
const BOND_RADIUS_FACTOR = 0.28;
const EPS = 1e-5;

// Distinct colors for pieces (same as Solution Viewer)
const PIECE_COLORS = [
  0xFF6B6B, 0x4ECDC4, 0x45B7D1, 0xFFA07A, 0x98D8C8,
  0xF7DC6F, 0xBB8FCE, 0x85C1E2, 0xF8B88B, 0xAED6F1,
  0xF5B7B1, 0xD7BDE2, 0xA9CCE3, 0xA3E4D7, 0xF9E79F,
  0xFAD7A0, 0xE8DAEF, 0xD6EAF8, 0xD5F4E6, 0xFEF5E7,
  0xFF8A80, 0x82B1FF, 0xB9F6CA, 0xFFD180, 0xCFD8DC
];

export interface EngineRenderContext {
  root: THREE.Group;                 // EnginePlacementGroup
  orient: OrientationRecord;
  R: number | null;                  // set from first placement; keep constant
  sphereGeo?: THREE.SphereGeometry;  // shared HQ geometry
  cylGeo?: THREE.CylinderGeometry;   // shared HQ geometry
  mats: Map<string, THREE.MeshStandardMaterial>; // pieceId -> material
}

export function createEngineRenderContext(orient: OrientationRecord): EngineRenderContext {
  const root = new THREE.Group();
  root.name = 'EnginePlacementGroup';
  return { root, orient, R: null, mats: new Map() };
}

export function applyEngineEvent(ctx: EngineRenderContext, e: EngineEvent): void {
  switch (e.type) {
    case 'placement_add':
      addPlacement(ctx, e.placement);
      break;
    case 'placement_remove':
      removePlacement(ctx, e.pieceId);
      break;
    case 'partial_solution':
      syncPlacements(ctx, e.placements);
      break;
    case 'solved':
      syncPlacements(ctx, e.placements);
      console.log('🎉 AutoSolver: Solution found!');
      break;
    default:
      // progress/started/error: handled by HUD elsewhere
      break;
  }
}

function addPlacement(ctx: EngineRenderContext, p: EnginePlacement): void {
  console.log(`➕ AutoSolver: Adding placement ${p.pieceId} with ${p.cells_ijk.length} cells`);
  
  // 1) Transform IJK cells to world coordinates
  const worldCenters: THREE.Vector3[] = p.cells_ijk.map(ijk => {
    const [i, j, k] = ijk;
    const ijkVec = new THREE.Vector3(i, j, k);
    ijkVec.applyMatrix4(ctx.orient.M_worldFromIJK);
    return ijkVec;
  });
  
  // 2) If R is null, compute it from this piece's min pair distance
  if (ctx.R === null) {
    let minDist = Infinity;
    for (let i = 0; i < worldCenters.length; i++) {
      for (let j = i + 1; j < worldCenters.length; j++) {
        const dist = worldCenters[i].distanceTo(worldCenters[j]);
        if (dist > 1e-6 && dist < minDist) {
          minDist = dist;
        }
      }
    }
    ctx.R = minDist * 0.5;
    
    // Create shared geometries
    ctx.sphereGeo = new THREE.SphereGeometry(ctx.R, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
    ctx.cylGeo = new THREE.CylinderGeometry(
      ctx.R * BOND_RADIUS_FACTOR,
      ctx.R * BOND_RADIUS_FACTOR,
      1, // height will be set per bond
      CYL_RADIAL_SEGMENTS,
      CYL_HEIGHT_SEGMENTS
    );
    
    console.log(`📏 AutoSolver: Set R=${ctx.R.toFixed(4)} from first placement`);
  }
  
  // 3) Get or create material for this piece
  if (!ctx.mats.has(p.pieceId)) {
    const colorIndex = ctx.mats.size % PIECE_COLORS.length;
    const mat = new THREE.MeshStandardMaterial({
      color: PIECE_COLORS[colorIndex],
      metalness: 0.40,
      roughness: 0.10,
      envMapIntensity: 2.50,
      side: THREE.FrontSide
    });
    ctx.mats.set(p.pieceId, mat);
  }
  const material = ctx.mats.get(p.pieceId)!;
  
  // 4) Build piece group with spheres and bonds
  const pieceGroup = new THREE.Group();
  pieceGroup.name = `PieceGroup_${p.pieceId}`;
  
  // Add spheres
  worldCenters.forEach((center, index) => {
    const mesh = new THREE.Mesh(ctx.sphereGeo!, material);
    mesh.position.copy(center);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `Sphere_${index}`;
    pieceGroup.add(mesh);
  });
  
  // Add bonds (same logic as Solution Viewer)
  const tolerance = Math.max(EPS, 1e-4 * ctx.R!);
  for (let i = 0; i < worldCenters.length; i++) {
    for (let j = i + 1; j < worldCenters.length; j++) {
      const c1 = worldCenters[i];
      const c2 = worldCenters[j];
      const dist = c1.distanceTo(c2);
      
      // Check if distance is approximately 2R (spheres touching)
      if (Math.abs(dist - 2 * ctx.R!) <= tolerance) {
        // Create bond cylinder
        const mid = new THREE.Vector3().addVectors(c1, c2).multiplyScalar(0.5);
        const direction = new THREE.Vector3().subVectors(c2, c1);
        const length = direction.length();
        
        const cylinder = new THREE.Mesh(ctx.cylGeo!.clone(), material);
        cylinder.scale.y = length;
        cylinder.position.copy(mid);
        
        // Orient cylinder
        const axis = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(axis, direction.normalize());
        cylinder.quaternion.copy(quaternion);
        
        cylinder.castShadow = true;
        cylinder.receiveShadow = true;
        cylinder.name = `Bond_${i}_${j}`;
        pieceGroup.add(cylinder);
      }
    }
  }
  
  ctx.root.add(pieceGroup);
  console.log(`✅ AutoSolver: Added piece ${p.pieceId} (${worldCenters.length} spheres, ${pieceGroup.children.length - worldCenters.length} bonds)`);
}

function removePlacement(ctx: EngineRenderContext, pieceId: string): void {
  const groupName = `PieceGroup_${pieceId}`;
  const group = ctx.root.children.find(child => child.name === groupName);
  if (group) {
    ctx.root.remove(group);
    console.log(`➖ AutoSolver: Removed placement ${pieceId}`);
  }
}

function syncPlacements(ctx: EngineRenderContext, placements: EnginePlacement[]): void {
  console.log(`🔄 AutoSolver: Syncing ${placements.length} placements`);
  
  // Get existing piece IDs
  const existingIds = new Set(
    ctx.root.children
      .filter(child => child.name.startsWith('PieceGroup_'))
      .map(child => child.name.replace('PieceGroup_', ''))
  );
  
  const newIds = new Set(placements.map(p => p.pieceId));
  
  // Remove pieces not in new set
  existingIds.forEach(id => {
    if (!newIds.has(id)) {
      removePlacement(ctx, id);
    }
  });
  
  // Add pieces not in existing set
  placements.forEach(p => {
    if (!existingIds.has(p.pieceId)) {
      addPlacement(ctx, p);
    }
  });
  
  console.log(`✅ AutoSolver: Sync complete (${ctx.root.children.length} pieces)`);
}
