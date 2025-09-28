// src/services/ViewTransforms.ts
import type { IJK, XYZ } from "../types/shape";

// ---- public types you can store in page state ----
export type ViewTransforms = {
  // Authoritative base lattice mapping
  T_ijk_to_xyz: number[][];    // 4x4
  T_xyz_to_ijk: number[][];    // 4x4 inverse

  // Pure view orientation (rigid rotation)
  R_view: number[][];          // 4x4
  R_view_inv: number[][];      // 4x4

  // Composed convenience matrices
  M_world: number[][];         // R_view * T_ijk_to_xyz
  M_world_inv: number[][];     // T_xyz_to_ijk * R_view_inv

  // View aids
  pivotXZ: XYZ;                // camera target (XZ centroid)
  bboxOriented: { min: XYZ; max: XYZ };
};

// ---- hull contracts (adapter you will wire) ----
export type HullFace = { area: number; normal: XYZ; vertices: XYZ[] };
export type Hull = { faces: HullFace[] };

export type QuickHullAdapter = (pointsRounded3: XYZ[], epsilon: number) => Hull;

// ---- main entry: compute all view transforms + bbox BEFORE first render ----
export function computeViewTransforms(
  ijkCells: IJK[],
  ijkToXyz: (ijk: IJK) => XYZ,
  T_ijk_to_xyz: number[][],        // from your TransformService (base lattice)
  quickHull: QuickHullAdapter,     // your adapter with 3-dec rounding + coplanar merge
): ViewTransforms {

  const ptsXYZ = ijkCells.map(ijkToXyz);
  if (ptsXYZ.length === 0) throw new Error("Empty cell set");

  // QuickHull on rounded coordinates (robust coplanarity)
  const rounded = ptsXYZ.map(round3);
  console.log(`🎯 ViewTransforms: Calling QuickHull with ${rounded.length} rounded points`);
  const hull = quickHull(rounded, 1e-6);
  console.log(`🎯 ViewTransforms: QuickHull returned hull with ${hull.faces.length} faces`);

  // Pick largest face (ties: first) and build rotation to align normal -> +Y
  if (!hull.faces || hull.faces.length === 0) {
    // Degenerate: identity rotation
    const R_view = I4();
    return finalize(T_ijk_to_xyz, R_view, ptsXYZ, ijkCells);
  }

  let best = hull.faces[0];
  for (const f of hull.faces) if (f.area > best.area) best = f;

  console.log(`🏆 ViewTransforms: Largest face - area: ${best.area.toFixed(3)}, normal: (${best.normal.x.toFixed(3)}, ${best.normal.y.toFixed(3)}, ${best.normal.z.toFixed(3)})`);

  const ny: XYZ = { x: 0, y: 1, z: 0 };
  const normalizedBest = norm(best.normal);
  // Invert the normal to get proper orientation
  const invertedNormal = { x: -normalizedBest.x, y: -normalizedBest.y, z: -normalizedBest.z };
  console.log(`🧭 ViewTransforms: Rotating from inverted normal (${invertedNormal.x.toFixed(3)}, ${invertedNormal.y.toFixed(3)}, ${invertedNormal.z.toFixed(3)}) to +Y (0, 1, 0)`);
  
  const R3 = rotationFromAToB(invertedNormal, ny);
  const R_view = embed4(R3);

  return finalize(T_ijk_to_xyz, R_view, ptsXYZ, ijkCells);
}

// ---- helpers ----
function finalize(T: number[][], R: number[][], ptsXYZ: XYZ[], ijkCells: IJK[]): ViewTransforms {
  const T_inv = inv4(T);
  const R_inv = transpose3in4(R);         // pure rotation → transpose is inverse
  const M_world = mul4(R, T);
  const M_world_inv = mul4(T_inv, R_inv);

  // Apply the full transform (R * T) to get final oriented positions
  const finalOriented = ijkCells.map((ijk: IJK) => {
    const ijkVec = { x: ijk.i, y: ijk.j, z: ijk.k };
    return apply4(M_world, ijkVec);
  });
  
  // Calculate sphere radius from the transform
  const p0 = apply4(M_world, { x: 0, y: 0, z: 0 });
  const p1 = apply4(M_world, { x: 1, y: 0, z: 0 });
  const sphereRadius = 0.5 * Math.sqrt(
    (p1.x - p0.x) * (p1.x - p0.x) + 
    (p1.y - p0.y) * (p1.y - p0.y) + 
    (p1.z - p0.z) * (p1.z - p0.z)
  );
  
  // Compute bounding box of the sphere centers
  const centerBbox = computeBbox(finalOriented);
  
  // Expand bounding box by sphere radius to include full sphere volumes
  const bbox = {
    min: {
      x: centerBbox.min.x - sphereRadius,
      y: centerBbox.min.y - sphereRadius,
      z: centerBbox.min.z - sphereRadius
    },
    max: {
      x: centerBbox.max.x + sphereRadius,
      y: centerBbox.max.y + sphereRadius,
      z: centerBbox.max.z + sphereRadius
    }
  };
  
  // The pivot is the center of this expanded bounding box
  const pivotXZ = {
    x: (bbox.min.x + bbox.max.x) * 0.5,
    y: (bbox.min.y + bbox.max.y) * 0.5,
    z: (bbox.min.z + bbox.max.z) * 0.5
  };
  
  console.log(`📍 ViewTransforms: Camera pivot set to oriented sphere bbox center (${pivotXZ.x.toFixed(3)}, ${pivotXZ.y.toFixed(3)}, ${pivotXZ.z.toFixed(3)})`);
  console.log(`📦 ViewTransforms: Sphere bbox (radius=${sphereRadius.toFixed(3)}) min=(${bbox.min.x.toFixed(3)}, ${bbox.min.y.toFixed(3)}, ${bbox.min.z.toFixed(3)}), max=(${bbox.max.x.toFixed(3)}, ${bbox.max.y.toFixed(3)}, ${bbox.max.z.toFixed(3)})`);

  return {
    T_ijk_to_xyz: T,
    T_xyz_to_ijk: T_inv,
    R_view: R,
    R_view_inv: R_inv,
    M_world: M_world,
    M_world_inv: M_world_inv,
    pivotXZ,
    bboxOriented: bbox,
  };
}

export function round3(p: XYZ): XYZ {
  return { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000, z: Math.round(p.z * 1000) / 1000 };
}

function centroid(pts: XYZ[]): XYZ {
  let sx=0, sy=0, sz=0; const n=pts.length||1;
  for (const p of pts) { sx+=p.x; sy+=p.y; sz+=p.z; }
  return { x:sx/n, y:sy/n, z:sz/n };
}

function computeBbox(pts: XYZ[]) {
  const min = { x: +Infinity, y: +Infinity, z: +Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of pts) {
    if (p.x < min.x) min.x = p.x; if (p.y < min.y) min.y = p.y; if (p.z < min.z) min.z = p.z;
    if (p.x > max.x) max.x = p.x; if (p.y > max.y) max.y = p.y; if (p.z > max.z) max.z = p.z;
  }
  return { min, max };
}

// ---- linear algebra (minimal) ----
function I4(): number[][] { return [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]; }
function embed4(R3: number[][]): number[][] { return [[R3[0][0],R3[0][1],R3[0][2],0],[R3[1][0],R3[1][1],R3[1][2],0],[R3[2][0],R3[2][1],R3[2][2],0],[0,0,0,1]]; }
function apply4(M: number[][], p: XYZ): XYZ {
  return { x: M[0][0]*p.x + M[0][1]*p.y + M[0][2]*p.z + M[0][3],
           y: M[1][0]*p.x + M[1][1]*p.y + M[1][2]*p.z + M[1][3],
           z: M[2][0]*p.x + M[2][1]*p.y + M[2][2]*p.z + M[2][3] };
}
function mul4(A:number[][],B:number[][]){ const R=I4().map(r=>r.map(()=>0)); for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)R[i][j]+=A[i][k]*B[k][j]; return R; }
function norm(v: XYZ){ const L=Math.hypot(v.x,v.y,v.z)||1; return {x:v.x/L,y:v.y/L,z:v.z/L}; }
function dot(a:XYZ,b:XYZ){return a.x*b.x+a.y*b.y+a.z*b.z}
function cross(a:XYZ,b:XYZ):XYZ{ return {x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x} }
function rotationFromAToB(a:XYZ,b:XYZ): number[][] {
  const v = cross(a,b), c = dot(a,b) + 1e-12, k = 1/(1+c);
  const vx=[[0,-v.z,v.y],[v.z,0,-v.x],[-v.y,v.x,0]];
  const vx2=mul3(vx,vx); const I=[[1,0,0],[0,1,0],[0,0,1]];
  return add3(add3(I,vx), scale3(vx2,k));
}
function add3(A:number[][],B:number[][]){return A.map((r,i)=>r.map((v,j)=>v+B[i][j]))}
function scale3(A:number[][],s:number){return A.map(r=>r.map(v=>v*s))}
function mul3(A:number[][],B:number[][]){ const R=[[0,0,0],[0,0,0],[0,0,0]]; for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)R[i][j]+=A[i][k]*B[k][j]; return R; }
function transpose3in4(R4:number[][]){ return [[R4[0][0],R4[1][0],R4[2][0],0],[R4[0][1],R4[1][1],R4[2][1],0],[R4[0][2],R4[1][2],R4[2][2],0],[0,0,0,1]]; }

// 4x4 inverse (affine) for linear T: since T_ijk_to_xyz is linear, this is fine
function inv4(M:number[][]): number[][] {
  // keep a small, generic 4x4 inverter or swap in a known-good util if you have one
  // For brevity: assume M[3] = [0,0,0,1] and use a 3x3 inverse with translation
  const a = [[M[0][0],M[0][1],M[0][2]],[M[1][0],M[1][1],M[1][2]],[M[2][0],M[2][1],M[2][2]]];
  const t = [M[0][3],M[1][3],M[2][3]];
  const aInv = inv3(a);
  const tInv = [- (aInv[0][0]*t[0]+aInv[0][1]*t[1]+aInv[0][2]*t[2]),
                - (aInv[1][0]*t[0]+aInv[1][1]*t[1]+aInv[1][2]*t[2]),
                - (aInv[2][0]*t[0]+aInv[2][1]*t[1]+aInv[2][2]*t[2])];
  return [[aInv[0][0],aInv[0][1],aInv[0][2],tInv[0]],
          [aInv[1][0],aInv[1][1],aInv[1][2],tInv[1]],
          [aInv[2][0],aInv[2][1],aInv[2][2],tInv[2]],
          [0,0,0,1]];
}
function inv3(m:number[][]){ // small 3x3 inverse
  const [a,b,c]=m[0], [d,e,f]=m[1], [g,h,i]=m[2];
  const A=e*i-f*h, B=-(d*i-f*g), C=d*h-e*g;
  const D=-(b*i-c*h), E=a*i-c*g, F=-(a*h-b*g);
  const G=b*f-c*e, H=-(a*f-c*d), I=a*e-b*d;
  const det = a*A + b*B + c*C || 1e-12;
  return [[A/det,D/det,G/det],[B/det,E/det,H/det],[C/det,F/det,I/det]];
}
