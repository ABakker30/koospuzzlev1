// Orientation & transforms (legacy, computed at load time)

import QuickHull from "quickhull3d";
import * as THREE from "three";
import { IJK } from "../../engines/types";
import { fccPoint } from "../../engines/adapters";

// Quantize to 3 decimals and dedup
function q3(x: number) {
  return Math.round(x * 1e3) / 1e3;
}

function quantizePts(pts: number[][]) {
  const out: number[][] = [];
  const seen = new Set<string>();
  for (const p of pts) {
    const q = [q3(p[0]), q3(p[1]), q3(p[2])];
    const k = `${q[0]},${q[1]},${q[2]}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(q);
    }
  }
  return out;
}

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: number[], b: number[]) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
const triArea = (A: number[], B: number[], C: number[]) =>
  0.5 * len(cross(sub(B, A), sub(C, A)));

function mergeCoplanar(
  faces: number[][],
  pts: number[][],
  angleTol = 1e-3,
  offsetTol = 1e-3
) {
  type G = { n: number[]; d: number; tris: number[][]; idx: Set<number> };
  const norm = (v: number[]) => {
    const L = len(v) || 1;
    return [v[0] / L, v[1] / L, v[2] / L];
  };
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  const groups: G[] = [];
  for (const f of faces) {
    const [ia, ib, ic] = f;
    const A = pts[ia],
      B = pts[ib],
      C = pts[ic];
    let n = norm(cross(sub(B, A), sub(C, A)));
    let d = dot(n, A);
    if (n[1] < 0) {
      n = [-n[0], -n[1], -n[2]];
      d = -d;
    }
    let g: G | undefined;
    for (const gg of groups) {
      const dn = len([n[0] - gg.n[0], n[1] - gg.n[1], n[2] - gg.n[2]]);
      if (dn <= angleTol && Math.abs(d - gg.d) <= offsetTol) {
        g = gg;
        break;
      }
    }
    if (!g) {
      g = { n, d, tris: [], idx: new Set() };
      groups.push(g);
    }
    g.tris.push(f);
    f.forEach(i => g!.idx.add(i));
  }
  return groups.map(g => {
    let area = 0;
    for (const t of g.tris) {
      const [a, b, c] = t;
      area += triArea(pts[a], pts[b], pts[c]);
    }
    return { n: g.n, area, any: g.tris[0] };
  });
}

// Compute legacy world transform: M = T * R * FCC
export function computeLegacyWorldMatrix(cells: IJK[]): THREE.Matrix4 {
  // 1) FCC positions (scale-free)
  const ptsRaw = cells.map(fccPoint);
  const pts = quantizePts(ptsRaw);

  // 2) Convex hull and largest face
  const faces: number[][] = QuickHull(pts);
  if (!faces.length) return new THREE.Matrix4().identity();

  const merged = mergeCoplanar(faces, pts);
  let best = merged[0];
  for (const m of merged) if (m.area > best.area) best = m;

  // 3) Face normal → +Y
  const up = new THREE.Vector3(0, 1, 0);
  let n = new THREE.Vector3(best.n[0], best.n[1], best.n[2]);
  if (n.y < 0) n.negate();
  const q = new THREE.Quaternion().setFromUnitVectors(n, up);
  const R = new THREE.Matrix4().makeRotationFromQuaternion(q);

  // 4) Rotate points, get centroid
  const rotated = pts.map(p => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(R));
  const centroid = rotated
    .reduce((acc, v) => acc.add(v), new THREE.Vector3())
    .divideScalar(rotated.length);

  // 5) T to center at origin in XYZ (legacy rule)
  const T = new THREE.Matrix4().makeTranslation(-centroid.x, -centroid.y, -centroid.z);

  // 6) FCC basis (scale-free). If you have a specific scale, multiply later.
  const FCC = new THREE.Matrix4().set(
    0, 1, 1, 0,
    1, 0, 1, 0,
    1, 1, 0, 0,
    0, 0, 0, 1
  );

  // 7) Compose: M_worldFromIJK = T * R * FCC
  const M = new THREE.Matrix4();
  M.multiplyMatrices(T, R);
  M.multiply(FCC);
  return M;
}
