import * as THREE from 'three';
import { OrientedSolution, PieceOrderEntry } from '../types';

// Quality constants
const SPHERE_SEGMENTS = 64;
const CYL_RADIAL_SEGMENTS = 48;
// const CYL_HEIGHT_SEGMENTS = 1; // Not used in current implementation
const BOND_RADIUS_FACTOR = 0.28;
const BOND_INSET = 0.0; // No inset by default

type PieceMeta = { 
  id: string; 
  group: THREE.Group; 
  centers: THREE.Vector3[];
  minY: number; 
  centroidY: number; 
};

export function buildSolutionGroup(oriented: OrientedSolution): { root: THREE.Group; pieceMeta: PieceMeta[] } {
  console.log(`🔨 Build: Building solution group for ${oriented.pieces.length} pieces`);
  
  const root = new THREE.Group();
  root.name = 'SolutionRoot';

  // Compute global sphere radius
  const R = computeGlobalSphereRadius(oriented);
  const sphereDiameter = 2 * R;
  const bondThreshold = 1.1 * sphereDiameter; // Bond when distance < 1.1 × diameter
  
  console.log(`🔨 Build: Global sphere radius: ${R.toFixed(4)}, bond threshold: ${bondThreshold.toFixed(4)} (1.1 × diameter)`);

  // Create shared geometries for performance
  const sphereGeo = new THREE.SphereGeometry(R, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
  const cylinderGeo = new THREE.CylinderGeometry(BOND_RADIUS_FACTOR * R, BOND_RADIUS_FACTOR * R, 1, CYL_RADIAL_SEGMENTS);
  
  console.log(`🔨 Build: Processing ${oriented.pieces.length} pieces with ${SPHERE_SEGMENTS} segment spheres`);
  
  if (!oriented.pieces || oriented.pieces.length === 0) {
    console.error(`❌ Build: No pieces found in oriented solution!`);
    return { root, pieceMeta: [] };
  }

  const metas: PieceMeta[] = [];

  for (let i = 0; i < oriented.pieces.length; i++) {
    const piece = oriented.pieces[i];
    console.log(`🔨 Build: Processing piece ${i + 1}/${oriented.pieces.length}: ${piece.id}`);
    
    const group = new THREE.Group();
    group.name = `PieceGroup_${piece.id}`;

    // Create unique material per piece with stable color
    const color = hashColorHSL(piece.id);
    console.log(`🎨 Build: Piece ${piece.id} color: #${color.toString(16).padStart(6, '0')}`);
    const material = new THREE.MeshStandardMaterial({ 
      color,
      metalness: 0.1,   // Slight metalness for glossy effect
      roughness: 0.05,  // Very low roughness for high gloss/shine
      transparent: false,
      opacity: 1.0,
      envMapIntensity: 1.5  // Enhanced environment reflections
    });
    
    // Force material to be very visible for debugging
    material.needsUpdate = true;
    console.log(`🎨 Build: Material created for piece ${piece.id}:`, material.color.getHex());

    // Create 4 sphere meshes using shared geometry
    for (let j = 0; j < piece.centers.length; j++) {
      const center = piece.centers[j];
      const sphereMesh = new THREE.Mesh(sphereGeo, material);
      sphereMesh.position.copy(center);
      sphereMesh.castShadow = true;
      sphereMesh.receiveShadow = true;
      sphereMesh.visible = true;
      group.add(sphereMesh);
    }

    // Create bonds between spheres where distance < 1.1 × diameter
    let bondCount = 0;
    
    // Check all possible pairs of spheres in this piece
    for (let a = 0; a < piece.centers.length; a++) {
      for (let b = a + 1; b < piece.centers.length; b++) {
        const pa = piece.centers[a];
        const pb = piece.centers[b];
        const distance = pa.distanceTo(pb);
        
        if (distance < bondThreshold) {
          // Create bond cylinder
          const bondMesh = new THREE.Mesh(cylinderGeo, material);
          
          // Position at midpoint
          const midpoint = new THREE.Vector3().addVectors(pa, pb).multiplyScalar(0.5);
          bondMesh.position.copy(midpoint);
          
          // Orient cylinder from +Y direction to bond direction
          const direction = new THREE.Vector3().subVectors(pb, pa).normalize();
          const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
          bondMesh.setRotationFromQuaternion(quaternion);
          
          // Scale cylinder to match distance
          bondMesh.scale.y = distance;
          bondMesh.castShadow = true;
          bondMesh.receiveShadow = true;
          
          group.add(bondMesh);
          bondCount++;
        }
      }
    }
    
    console.log(`🔗 Build: Piece ${piece.id} - ${piece.centers.length} spheres, ${bondCount} bonds`);
    
    if (bondCount === 0) {
      console.warn(`⚠️ Build: No bonds created for piece ${piece.id}! Check sphere positions and bond threshold.`);
    }

    // Add group to root
    root.add(group);
    console.log(`✅ Build: Added piece group ${piece.id} to root (${group.children.length} children)`);
    console.log(`✅ Build: Group visible: ${group.visible}, position: (${group.position.x}, ${group.position.y}, ${group.position.z})`);

    // Store metadata for reveal ordering
    const minY = Math.min(...piece.centers.map(v => v.y));
    const centroidY = piece.centroid.y;
    metas.push({ 
      id: piece.id, 
      group, 
      centers: piece.centers, 
      minY, 
      centroidY 
    });
  }

  console.log(`✅ Build: Solution group created with ${oriented.pieces.length} pieces`);
  console.log(`✅ Build: Root has ${root.children.length} child groups`);
  console.log(`✅ Build: Root visible: ${root.visible}, position: (${root.position.x}, ${root.position.y}, ${root.position.z})`);
  return { root, pieceMeta: metas };
}

export function computeRevealOrder(metas: PieceMeta[]): PieceOrderEntry[] {
  console.log(`📊 Reveal: Computing reveal order for ${metas.length} pieces`);
  
  const ordered = metas
    .slice()
    .sort((a, b) => {
      // Primary: lowest Y first
      if (Math.abs(a.minY - b.minY) > 1e-6) {
        return a.minY - b.minY;
      }
      // Secondary: centroid Y
      if (Math.abs(a.centroidY - b.centroidY) > 1e-6) {
        return a.centroidY - b.centroidY;
      }
      // Tertiary: lexicographic by ID
      return a.id.localeCompare(b.id);
    })
    .map(m => ({ 
      id: m.id, 
      group: m.group, 
      minY: m.minY, 
      centroidY: m.centroidY 
    }));

  console.log(`📊 Reveal: Order determined - first 5: ${ordered.slice(0, 5).map(p => `${p.id}(Y:${p.minY.toFixed(2)})`).join(', ')}`);
  return ordered;
}

export function applyRevealK(_root: THREE.Group, order: PieceOrderEntry[], k: number): void {
  const clampK = Math.max(1, Math.min(order.length, Math.floor(k)));
  
  for (let i = 0; i < order.length; i++) {
    const shouldBeVisible = i < clampK;
    if (order[i].group.visible !== shouldBeVisible) {
      order[i].group.visible = shouldBeVisible;
    }
  }
  console.log(`👁️ Reveal: Showing ${clampK}/${order.length} pieces`);
}

/** Compute global sphere radius as 0.5 * minimum distance between sphere centers in world space */
export function computeGlobalSphereRadius(oriented: OrientedSolution): number {
  console.log(`🔨 Build: *** COMPUTING RADIUS FUNCTION CALLED ***`);
  console.log(`🔨 Build: Computing global sphere radius from ${oriented.pieces.length} pieces`);
  console.log(`🔨 Build: First piece for radius calc:`, oriented.pieces[0]);
  
  let globalMinDistance = Infinity;
  const allCenters: THREE.Vector3[] = [];
  for (const piece of oriented.pieces) {
    allCenters.push(...piece.centers);
  }
  
  // Check all pairwise distances between all sphere centers across all pieces
  for (let i = 0; i < allCenters.length; i++) {
    for (let j = i + 1; j < allCenters.length; j++) {
      const distance = allCenters[i].distanceTo(allCenters[j]);
      if (distance > 1e-6) { // Avoid zero distances from identical points
        globalMinDistance = Math.min(globalMinDistance, distance);
      }
    }
  }
  
  if (!isFinite(globalMinDistance) || globalMinDistance <= 0) {
    console.warn('⚠️ Build: Failed to compute valid sphere radius, using fallback');
    return 0.5; // Fallback
  }
  
  // Sphere radius = 0.5 * shortest distance so spheres just touch
  const radius = globalMinDistance * 0.5;
  console.log(`🔨 Build: Computed sphere radius: ${radius.toFixed(4)} (from min distance: ${globalMinDistance.toFixed(4)})`);
  
  return radius;
}

/** Generate highly distinct colors for up to 25+ pieces using optimized HSL distribution */
function hashColorHSL(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  
  // Vibrant color palette inspired by the reference image
  const vibrantColors = [
    0xff0000, // Bright Red
    0x00ff00, // Bright Green  
    0x0080ff, // Bright Blue
    0xffff00, // Bright Yellow
    0xff8000, // Orange
    0x8000ff, // Purple
    0xff0080, // Hot Pink
    0x00ffff, // Cyan
    0x80ff00, // Lime Green
    0xff4080, // Rose
    0x4080ff, // Sky Blue
    0xffc000, // Gold
    0xc000ff, // Violet
    0x00ff80, // Spring Green
    0xff8040, // Coral
    0x8040ff, // Blue Violet
    0x40ff80, // Sea Green
    0xff4000, // Red Orange
    0x0040ff, // Royal Blue
    0x80ff40, // Yellow Green
    0xff0040, // Crimson
    0x4000ff, // Indigo
    0x00c0ff, // Deep Sky Blue
    0xc0ff00, // Chartreuse
    0xff00c0  // Magenta
  ];
  
  // Select color based on hash
  const colorIndex = hash % vibrantColors.length;
  const selectedColor = vibrantColors[colorIndex];
  
  console.log(`🎨 Color for piece ${key}: vibrant color #${selectedColor.toString(16).padStart(6, '0')}`);
  return selectedColor;
}
