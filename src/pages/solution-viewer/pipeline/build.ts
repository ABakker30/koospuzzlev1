import * as THREE from 'three';
import { OrientedSolution, PieceOrderEntry } from '../types';

// Quality constants
const SPHERE_SEGMENTS = 64;
const CYL_RADIAL_SEGMENTS = 48;
// const CYL_HEIGHT_SEGMENTS = 1; // Not used in current implementation
const BOND_RADIUS_FACTOR = 0.35; // Optimized bond radius
const BOND_INSET = 0.0; // No inset by default

type PieceMeta = { 
  id: string; 
  group: THREE.Group; 
  centers: THREE.Vector3[];
  minY: number; 
  centroidY: number; 
};

export function buildSolutionGroup(oriented: OrientedSolution): { root: THREE.Group; pieceMeta: PieceMeta[] } {
  // console.log(`🔨 Build: Building solution group for ${oriented.pieces.length} pieces`);
  
  const root = new THREE.Group();
  root.name = 'SolutionRoot';

  // Compute global sphere radius
  const R = computeGlobalSphereRadius(oriented);
  const sphereDiameter = 2 * R;
  const bondThreshold = 1.1 * sphereDiameter; // Bond when distance < 1.1 × diameter
  
  // console.log(`🔨 Build: Global sphere radius: ${R.toFixed(4)}, bond threshold: ${bondThreshold.toFixed(4)} (1.1 × diameter)`);

  // Create shared geometries for performance
  const sphereGeo = new THREE.SphereGeometry(R, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
  const cylinderGeo = new THREE.CylinderGeometry(BOND_RADIUS_FACTOR * R, BOND_RADIUS_FACTOR * R, 1, CYL_RADIAL_SEGMENTS);
  
  // console.log(`🔨 Build: Processing ${oriented.pieces.length} pieces with ${SPHERE_SEGMENTS} segment spheres`);
  
  if (!oriented.pieces || oriented.pieces.length === 0) {
    console.error(`❌ Build: No pieces found in oriented solution!`);
    return { root, pieceMeta: [] };
  }

  // Build neighbor graph and assign colors to maximize visual distinction
  const pieceColors = assignNeighborAwareColors(oriented, sphereDiameter);

  const metas: PieceMeta[] = [];

  for (let i = 0; i < oriented.pieces.length; i++) {
    const piece = oriented.pieces[i];
    // console.log(`🔨 Build: Processing piece ${i + 1}/${oriented.pieces.length}: ${piece.id}`);
    
    const group = new THREE.Group();
    group.name = `PieceGroup_${piece.id}_${i}`;

    // Use neighbor-aware color assignment
    const color = pieceColors.get(i) || 0xff0000; // Fallback to red if not assigned
    // console.log(`🎨 Build: Piece ${piece.id} instance ${i} color: #${color.toString(16).padStart(6, '0')}`);
    const material = new THREE.MeshStandardMaterial({ 
      color,
      metalness: 0.40,  // Optimized metalness
      roughness: 0.10,  // Optimized roughness (1 - 0.90 reflectiveness)
      transparent: false,
      opacity: 1.0,
      envMapIntensity: 1.5  // Enhanced environment reflections
    });
    
    // Force material to be very visible for debugging
    material.needsUpdate = true;
    // console.log(`🎨 Build: Material created for piece ${piece.id}:`, material.color.getHex());

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
          
          // Store original radius for slider adjustment
          bondMesh.userData.originalRadius = BOND_RADIUS_FACTOR;
          
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
    
    // console.log(`🔗 Build: Piece ${piece.id} - ${piece.centers.length} spheres, ${bondCount} bonds`);
    
    if (bondCount === 0) {
      console.warn(`⚠️ Build: No bonds created for piece ${piece.id}! Check sphere positions and bond threshold.`);
    }

    // Add group to root
    root.add(group);
    // console.log(`✅ Build: Added piece group ${piece.id} to root (${group.children.length} children)`);
    // console.log(`✅ Build: Group visible: ${group.visible}, position: (${group.position.x}, ${group.position.y}, ${group.position.z})`);

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

  // console.log(`✅ Build: Solution group created with ${oriented.pieces.length} pieces`);
  // console.log(`✅ Build: Root has ${root.children.length} child groups`);
  // console.log(`✅ Build: Root visible: ${root.visible}, position: (${root.position.x}, ${root.position.y}, ${root.position.z})`);
  return { root, pieceMeta: metas };
}

export function computeRevealOrder(metas: PieceMeta[]): PieceOrderEntry[] {
  // console.log(`📊 Reveal: Computing reveal order for ${metas.length} pieces`);
  
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

  // console.log(`📊 Reveal: Order determined - first 5: ${ordered.slice(0, 5).map(p => `${p.id}(Y:${p.minY.toFixed(2)})`).join(', ')}`);
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
  // console.log(`👁️ Reveal: Showing ${clampK}/${order.length} pieces`);
}

/**
 * Apply explosion effect to solution pieces
 * @param root Solution root group
 * @param order Piece order (same as reveal)
 * @param explosionFactor 0 = assembled, 1 = 1.5x exploded
 */
export function applyExplosion(root: THREE.Group, order: PieceOrderEntry[], explosionFactor: number): void {
  const clampedFactor = Math.max(0, Math.min(1, explosionFactor));
  
  if (order.length === 0) return;
  
  // Compute solution bounding box to get solution center
  const bbox = new THREE.Box3();
  for (const entry of order) {
    const group = entry.group;
    // Update world matrices to ensure accurate bounds
    group.updateMatrixWorld(true);
    bbox.expandByObject(group);
  }
  
  const solutionCenter = new THREE.Vector3();
  bbox.getCenter(solutionCenter);
  
  // Apply explosion to each piece
  for (const entry of order) {
    const group = entry.group;
    
    // Compute piece bounding box centroid
    const pieceBBox = new THREE.Box3().setFromObject(group);
    const pieceCentroid = new THREE.Vector3();
    pieceBBox.getCenter(pieceCentroid);
    
    // Compute explosion vector: from solution center to piece centroid
    const explosionVector = new THREE.Vector3().subVectors(pieceCentroid, solutionCenter);
    
    // Store original position if not already stored
    if (group.userData.originalPosition === undefined) {
      group.userData.originalPosition = group.position.clone();
    }
    
    // Apply explosion: originalPosition + explosionFactor * 1.5 * explosionVector
    const originalPos = group.userData.originalPosition;
    const offset = explosionVector.multiplyScalar(clampedFactor * 1.5);
    group.position.copy(originalPos).add(offset);
  }
  
  // console.log(`💥 Explosion: Applied factor ${clampedFactor.toFixed(2)} to ${order.length} pieces`);
}

/** Compute global sphere radius as 0.5 * minimum distance between sphere centers in world space */
export function computeGlobalSphereRadius(oriented: OrientedSolution): number {
  // console.log(`🔨 Build: *** COMPUTING RADIUS FUNCTION CALLED ***`);
  // console.log(`🔨 Build: Computing global sphere radius from ${oriented.pieces.length} pieces`);
  // console.log(`🔨 Build: First piece for radius calc:`, oriented.pieces[0]);
  
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
  // console.log(`🔨 Build: Computed sphere radius: ${radius.toFixed(4)} (from min distance: ${globalMinDistance.toFixed(4)})`);
  
  return radius;
}

/**
 * Assign colors to pieces ensuring neighbors have maximally different colors
 * Uses neighbor detection and greedy graph coloring with color distance optimization
 */
function assignNeighborAwareColors(oriented: OrientedSolution, sphereDiameter: number): Map<number, number> {
  const neighborThreshold = sphereDiameter * 1.5; // Pieces are neighbors if any spheres are within 1.5 × diameter
  const numPieces = oriented.pieces.length;
  
  // Build adjacency list: which pieces are neighbors
  const neighbors = new Map<number, Set<number>>();
  for (let i = 0; i < numPieces; i++) {
    neighbors.set(i, new Set());
  }
  
  // Check all pairs of pieces
  for (let i = 0; i < numPieces; i++) {
    for (let j = i + 1; j < numPieces; j++) {
      const piece1 = oriented.pieces[i];
      const piece2 = oriented.pieces[j];
      
      // Check if any spheres from piece1 are close to any spheres from piece2
      let areNeighbors = false;
      for (const center1 of piece1.centers) {
        for (const center2 of piece2.centers) {
          const distance = center1.distanceTo(center2);
          if (distance < neighborThreshold) {
            areNeighbors = true;
            break;
          }
        }
        if (areNeighbors) break;
      }
      
      if (areNeighbors) {
        neighbors.get(i)!.add(j);
        neighbors.get(j)!.add(i);
      }
    }
  }
  
  // Color palette (reuse the vibrant colors)
  const palette = [
    0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff,
    0xff8800, 0x8800ff, 0x00ff88, 0xff0088, 0x88ff00, 0x0088ff,
    0xff5500, 0x5500ff, 0x00ff55, 0xff0055, 0x55ff00, 0x0055ff,
    0xffaa00, 0xaa00ff, 0x00ffaa, 0xff00aa, 0xaaff00, 0x00aaff,
    0xff3300, 0x3300ff, 0x00ff33, 0xff0033, 0x33ff00, 0x0033ff,
    0xffcc00, 0xcc00ff, 0x00ffcc, 0xff00cc, 0xccff00, 0x00ccff,
    0xff6600, 0x6600ff, 0x00ff66, 0xff0066
  ];
  
  // Greedy color assignment: for each piece, pick the color most different from neighbors
  const pieceColors = new Map<number, number>();
  
  for (let i = 0; i < numPieces; i++) {
    const neighborColors: number[] = [];
    
    // Get colors of already-colored neighbors
    for (const neighborIdx of neighbors.get(i)!) {
      if (pieceColors.has(neighborIdx)) {
        neighborColors.push(pieceColors.get(neighborIdx)!);
      }
    }
    
    // If no neighbors are colored yet, use first color
    if (neighborColors.length === 0) {
      pieceColors.set(i, palette[i % palette.length]);
      continue;
    }
    
    // Find the color from palette that maximizes minimum distance to neighbor colors
    let bestColor = palette[0];
    let bestScore = -Infinity;
    
    for (const candidateColor of palette) {
      // Calculate minimum color distance to all neighbor colors
      let minDistance = Infinity;
      for (const neighborColor of neighborColors) {
        const distance = colorDistance(candidateColor, neighborColor);
        minDistance = Math.min(minDistance, distance);
      }
      
      // Pick color with maximum minimum distance (most different from closest neighbor)
      if (minDistance > bestScore) {
        bestScore = minDistance;
        bestColor = candidateColor;
      }
    }
    
    pieceColors.set(i, bestColor);
  }
  
  return pieceColors;
}

/**
 * Calculate perceptual distance between two RGB colors
 * Uses weighted Euclidean distance in RGB space
 */
function colorDistance(color1: number, color2: number): number {
  const r1 = (color1 >> 16) & 0xff;
  const g1 = (color1 >> 8) & 0xff;
  const b1 = color1 & 0xff;
  
  const r2 = (color2 >> 16) & 0xff;
  const g2 = (color2 >> 8) & 0xff;
  const b2 = color2 & 0xff;
  
  // Weighted Euclidean distance (weights account for human perception)
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

/** Generate highly distinct colors for up to 25+ pieces using optimized HSL distribution */
function hashColorHSL(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  
  // Highly distinct color palette with maximum contrast (expanded to 40 colors)
  const vibrantColors = [
    0xff0000, // Pure Red
    0x00ff00, // Pure Green
    0x0000ff, // Pure Blue
    0xffff00, // Pure Yellow
    0xff00ff, // Pure Magenta
    0x00ffff, // Pure Cyan
    0xff8800, // Deep Orange
    0x8800ff, // Deep Purple
    0x00ff88, // Turquoise
    0xff0088, // Deep Pink
    0x88ff00, // Chartreuse
    0x0088ff, // Sky Blue
    0xff5500, // Burnt Orange
    0x5500ff, // Violet
    0x00ff55, // Spring Green
    0xff0055, // Rose Red
    0x55ff00, // Lime
    0x0055ff, // Royal Blue
    0xffaa00, // Gold
    0xaa00ff, // Purple
    0x00ffaa, // Aqua
    0xff00aa, // Hot Pink
    0xaaff00, // Yellow Green
    0x00aaff, // Light Blue
    0xff3300, // Red Orange
    0x3300ff, // Indigo
    0x00ff33, // Mint Green
    0xff0033, // Crimson
    0x33ff00, // Bright Lime
    0x0033ff, // Deep Blue
    0xffcc00, // Bright Gold
    0xcc00ff, // Bright Purple
    0x00ffcc, // Cyan Green
    0xff00cc, // Magenta Pink
    0xccff00, // Lime Yellow
    0x00ccff, // Aqua Blue
    0xff6600, // Tangerine
    0x6600ff, // Blue Violet
    0x00ff66, // Sea Foam
    0xff0066  // Raspberry
  ];
  
  // Select color based on hash
  const colorIndex = hash % vibrantColors.length;
  const selectedColor = vibrantColors[colorIndex];
  
  // console.log(`🎨 Color for piece ${key}: vibrant color #${selectedColor.toString(16).padStart(6, '0')}`);
  return selectedColor;
}
