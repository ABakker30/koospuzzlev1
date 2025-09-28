import type { XYZ } from "../types/shape";

export type HullFace = { area: number; normal: XYZ; vertices: XYZ[] };
export type Hull = { faces: HullFace[] };

export type OrientationResult = {
  R_view: number[][]; // 4x4
  pivotXZ: XYZ;
  bboxOriented: { min: XYZ; max: XYZ };
};

export function round3(p: XYZ): XYZ {
  return { x: Math.round(p.x*1000)/1000, y: Math.round(p.y*1000)/1000, z: Math.round(p.z*1000)/1000 };
}

export function orientWithHull(pointsXYZ: XYZ[], hull: Hull): OrientationResult {
  // choose largest face (ties: first)
  let best = hull.faces[0];
  for (const f of hull.faces) if (f.area > best.area) best = f;

  const ny: XYZ = { x: 0, y: 1, z: 0 };
  const R = rotationFromAToB(normalize(best.normal), ny);

  // pivot = centroid projected to XZ
  const c = centroid(pointsXYZ);
  const pivotXZ = { x: c.x, y: 0, z: c.z };

  // bbox after R
  const oriented = pointsXYZ.map(p => applyR(R, p));
  const min = { x: +Infinity, y: +Infinity, z: +Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of oriented) {
    if (p.x < min.x) min.x = p.x; if (p.y < min.y) min.y = p.y; if (p.z < min.z) min.z = p.z;
    if (p.x > max.x) max.x = p.x; if (p.y > max.y) max.y = p.y; if (p.z > max.z) max.z = p.z;
  }

  return { R_view: embed4(R), pivotXZ, bboxOriented: { min, max } };
}

// — helpers —
function centroid(pts: XYZ[]): XYZ {
  let sx=0, sy=0, sz=0; const n=pts.length||1;
  for (const p of pts) { sx+=p.x; sy+=p.y; sz+=p.z; }
  return { x:sx/n, y:sy/n, z:sz/n };
}

function normalize(v: XYZ): XYZ { 
  const L=Math.hypot(v.x,v.y,v.z)||1; 
  return {x:v.x/L,y:v.y/L,z:v.z/L}; 
}

function dot(a:XYZ,b:XYZ){return a.x*b.x+a.y*b.y+a.z*b.z}

function cross(a:XYZ,b:XYZ):XYZ{ 
  return {x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x}
}

function rotationFromAToB(a:XYZ,b:XYZ): number[][] {
  // 3x3 rotation aligning a→b (simple Rodrigues form; antiparallel edge cases can be handled later if needed)
  const v=cross(a,b); const c=dot(a,b)+1e-12; const k=1/(1+c);
  const vx=[[0,-v.z,v.y],[v.z,0,-v.x],[-v.y,v.x,0]];
  const vx2=mul3(vx,vx);
  const I=[[1,0,0],[0,1,0],[0,0,1]];
  return add3(add3(I,vx), scale3(vx2,k));
}

function add3(A:number[][],B:number[][]){return A.map((r,i)=>r.map((v,j)=>v+B[i][j]))}
function scale3(A:number[][],s:number){return A.map(r=>r.map(v=>v*s))}

function mul3(A:number[][],B:number[][]){
  const R=[[0,0,0],[0,0,0],[0,0,0]];
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)R[i][j]+=A[i][k]*B[k][j];
  return R;
}

function applyR(R:number[][],p:XYZ):XYZ{ 
  return { 
    x:R[0][0]*p.x+R[0][1]*p.y+R[0][2]*p.z,
    y:R[1][0]*p.x+R[1][1]*p.y+R[1][2]*p.z, 
    z:R[2][0]*p.x+R[2][1]*p.y+R[2][2]*p.z 
  } 
}

function embed4(R3:number[][]):number[][]{ 
  return [
    [R3[0][0],R3[0][1],R3[0][2],0],
    [R3[1][0],R3[1][1],R3[1][2],0],
    [R3[2][0],R3[2][1],R3[2][2],0],
    [0,0,0,1]
  ];
}
