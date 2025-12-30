// Simple ViewTransforms - Load -> Orient -> Place at Origin
import type { IJK, XYZ } from "../types/shape";

export type ViewTransforms = {
  M_world: number[][];         // Final transform matrix (4x4)
};

export type HullFace = { area: number; normal: XYZ; vertices: XYZ[] };
export type Hull = { faces: HullFace[] };
export type QuickHullAdapter = (pointsRounded3: XYZ[], epsilon: number) => Hull;

export type ComputeViewTransformsOptions = {
  groundMode?: 'restOnXZ' | 'none'; // default = 'restOnXZ'
  skipOrientation?: boolean; // default = false - if true, skip convex hull orientation
};

// Simple transform: Load -> Orient -> Place at Origin
export function computeViewTransforms(
  ijkCells: IJK[],
  ijkToXyz: (ijk: IJK) => XYZ,
  T_ijk_to_xyz: number[][],
  quickHull: QuickHullAdapter,
  opts?: ComputeViewTransformsOptions,
): ViewTransforms {
  console.log(`🎯 ViewTransforms: Processing ${ijkCells.length} cells`);

  // Step 1: Convert IJK to XYZ using FCC lattice
  const ptsXYZ = ijkCells.map(ijkToXyz);
  if (ptsXYZ.length === 0) throw new Error("Empty cell set");

  // Step 2: Find largest face for orientation (unless skipOrientation is true)
  let rotationMatrix = I4(); // Default: no rotation
  
  if (!opts?.skipOrientation) {
    const rounded = ptsXYZ.map(round3);
    const hull = quickHull(rounded, 1e-6);
    
    if (hull.faces && hull.faces.length > 0) {
      // Find largest face
      let best = hull.faces[0];
      for (const f of hull.faces) if (f.area > best.area) best = f;
      
      console.log(`🏆 ViewTransforms: Largest face normal: (${best.normal.x.toFixed(3)}, ${best.normal.y.toFixed(3)}, ${best.normal.z.toFixed(3)})`);
      
      // Orient so largest face points down (-Y)
      const normalizedBest = norm(best.normal);
      const invertedNormal = { x: -normalizedBest.x, y: -normalizedBest.y, z: -normalizedBest.z };
      const targetUp = { x: 0, y: 1, z: 0 };
      
      const R3 = rotationFromAToB(invertedNormal, targetUp);
      rotationMatrix = embed4(R3);
    }
  } else {
    console.log(`🎯 ViewTransforms: Skipping orientation (raw FCC transform)`);
  }

  // Step 3: Apply rotation and FCC transform
  const M_oriented = mul4(rotationMatrix, T_ijk_to_xyz);
  
  // Step 4: Calculate sphere radius for proper ground placement
  const p0 = apply4(M_oriented, { x: 0, y: 0, z: 0 });
  const p1 = apply4(M_oriented, { x: 1, y: 0, z: 0 });
  const sphereRadius = 0.5 * Math.sqrt(
    (p1.x - p0.x) * (p1.x - p0.x) + 
    (p1.y - p0.y) * (p1.y - p0.y) + 
    (p1.z - p0.z) * (p1.z - p0.z)
  );
  
  // Step 5: Calculate oriented points and bounds
  const orientedPoints = ijkCells.map(ijk => {
    const ijkVec = { x: ijk.i, y: ijk.j, z: ijk.k };
    return apply4(M_oriented, ijkVec);
  });
  
  // Calculate bounding box
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (const p of orientedPoints) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  
  // Calculate centroid for X,Z centering and lowest point for Y placement
  const centroidX = (minX + maxX) * 0.5;
  const centroidZ = (minZ + maxZ) * 0.5;
  
  // Ground mode: control Y offset behavior
  const groundMode = opts?.groundMode ?? 'restOnXZ';
  let groundYOffset = (groundMode === 'restOnXZ') ? (minY - sphereRadius) : minY;
  
  console.log(`🎯 ViewTransforms: Sphere radius: ${sphereRadius.toFixed(3)}`);
  console.log(`🎯 ViewTransforms: Bounds - X: [${minX.toFixed(3)}, ${maxX.toFixed(3)}], Y: [${minY.toFixed(3)}, ${maxY.toFixed(3)}], Z: [${minZ.toFixed(3)}, ${maxZ.toFixed(3)}]`);
  console.log(`🎯 ViewTransforms: Centering at X: ${centroidX.toFixed(3)}, Z: ${centroidZ.toFixed(3)}, placing on XZ plane (Y offset: ${(-groundYOffset).toFixed(3)})`);
  
  // Step 6: Create final matrix that centers X,Z at origin and places shape on XZ plane
  const M_world = [
    [M_oriented[0][0], M_oriented[0][1], M_oriented[0][2], M_oriented[0][3] - centroidX],
    [M_oriented[1][0], M_oriented[1][1], M_oriented[1][2], M_oriented[1][3] - groundYOffset],
    [M_oriented[2][0], M_oriented[2][1], M_oriented[2][2], M_oriented[2][3] - centroidZ],
    [M_oriented[3][0], M_oriented[3][1], M_oriented[3][2], M_oriented[3][3]]
  ];
  
  console.log(`🎯 ViewTransforms: Shape centered at origin and resting on XZ plane`);
  
  return { M_world };
}

// Helper functions
function calculateCentroid(points: XYZ[]): XYZ {
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  
  let sumX = 0, sumY = 0, sumZ = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumZ += p.z;
  }
  
  return {
    x: sumX / points.length,
    y: sumY / points.length,
    z: sumZ / points.length
  };
}

export function round3(p: XYZ): XYZ {
  return { 
    x: Math.round(p.x * 1000) / 1000, 
    y: Math.round(p.y * 1000) / 1000, 
    z: Math.round(p.z * 1000) / 1000 
  };
}

function norm(v: XYZ): XYZ {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 1e-9) return { x: 1, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function cross(a: XYZ, b: XYZ): XYZ {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function dot(a: XYZ, b: XYZ): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function rotationFromAToB(a: XYZ, b: XYZ): number[][] {
  const v = cross(a, b);
  const s = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  const c = dot(a, b);

  if (s < 1e-9) {
    return c > 0 ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : [[-1, 0, 0], [0, -1, 0], [0, 0, 1]];
  }

  const vx = [[0, -v.z, v.y], [v.z, 0, -v.x], [-v.y, v.x, 0]];
  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const k = (1 - c) / (s * s);
  
  // R = I + [v]× + [v]²× * k
  const result = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      result[i][j] = I[i][j] + vx[i][j];
      for (let l = 0; l < 3; l++) {
        result[i][j] += k * vx[i][l] * vx[l][j];
      }
    }
  }
  
  return result;
}

function embed4(R3: number[][]): number[][] {
  return [
    [R3[0][0], R3[0][1], R3[0][2], 0],
    [R3[1][0], R3[1][1], R3[1][2], 0],
    [R3[2][0], R3[2][1], R3[2][2], 0],
    [0, 0, 0, 1]
  ];
}

function I4(): number[][] {
  return [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
}

function mul4(A: number[][], B: number[][]): number[][] {
  const result = Array(4).fill(0).map(() => Array(4).fill(0));
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return result;
}

function apply4(M: number[][], v: XYZ): XYZ {
  return {
    x: M[0][0] * v.x + M[0][1] * v.y + M[0][2] * v.z + M[0][3],
    y: M[1][0] * v.x + M[1][1] * v.y + M[1][2] * v.z + M[1][3],
    z: M[2][0] * v.x + M[2][1] * v.y + M[2][2] * v.z + M[2][3]
  };
}
