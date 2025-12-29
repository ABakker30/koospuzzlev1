import * as THREE from "three";
import type { IJK } from '../../../types/shape';
import type { ViewTransforms } from '../../../services/ViewTransforms';

export type GridType = "square" | "triangular";

export type GridDetectionResult = {
  type: GridType;
  confidence: number; // 0..1
  debug?: {
    bottomCount: number;
    minY: number;
    nnDist: number;
    avgNeighborCount: number;
    anglePeaks: { deg: number; score: number }[];
  };
};

function ijkToWorld(ijk: IJK, M_world: number[][]): THREE.Vector3 {
  const x = ijk.i;
  const y = ijk.j;
  const z = ijk.k;
  return new THREE.Vector3(
    M_world[0][0] * x + M_world[0][1] * y + M_world[0][2] * z + M_world[0][3],
    M_world[1][0] * x + M_world[1][1] * y + M_world[1][2] * z + M_world[1][3],
    M_world[2][0] * x + M_world[2][1] * y + M_world[2][2] * z + M_world[2][3]
  );
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function nearestNeighborDistanceXZ(points: THREE.Vector3[]): number {
  // Find the smallest non-zero distance in XZ plane.
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    for (let j = i + 1; j < points.length; j++) {
      const b = points[j];
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 1e-9 && d < best) best = d;
    }
  }
  return best === Infinity ? 0 : best;
}

function angleDegXZ(v: THREE.Vector3): number {
  // angle in [0,180) using absolute direction (v and -v equivalent)
  const ang = Math.atan2(v.z, v.x) * (180 / Math.PI); // -180..180
  let a = ang;
  // fold to [0,180)
  if (a < 0) a += 180;
  if (a >= 180) a -= 180;
  return a;
}

function scoreAnglePeak(hist: number[], targetDeg: number, binSizeDeg: number): number {
  const idx = Math.round(targetDeg / binSizeDeg);
  let s = 0;
  // small window around peak
  for (let k = -1; k <= 1; k++) {
    const ii = idx + k;
    if (ii >= 0 && ii < hist.length) s += hist[ii];
  }
  return s;
}

export function detectGridType(puzzleCells: IJK[], transforms: ViewTransforms): GridDetectionResult {
  const pts = puzzleCells.map((c) => ijkToWorld(c, transforms.M_world));

  if (pts.length < 4) {
    return { type: "square", confidence: 0.0, debug: { bottomCount: pts.length, minY: 0, nnDist: 0, avgNeighborCount: 0, anglePeaks: [] } };
  }

  // --- 1) bottom layer selection ---
  let minY = Infinity;
  for (const p of pts) minY = Math.min(minY, p.y);

  // epsilon: scale by model size (robust across different units)
  const bbox = new THREE.Box3().setFromPoints(pts);
  const diag = bbox.getSize(new THREE.Vector3()).length();
  const yEps = Math.max(1e-4, diag * 1e-4); // tweakable

  const bottom = pts.filter((p) => Math.abs(p.y - minY) <= yEps);

  // If bottom layer is too small, widen epsilon slightly (some hull orientations put 2 layers very close)
  let bottomPts = bottom;
  if (bottomPts.length < 6) {
    const yEps2 = Math.max(yEps * 3, diag * 3e-4);
    bottomPts = pts.filter((p) => Math.abs(p.y - minY) <= yEps2);
  }

  // Still too small? fall back to all points (better than always-square)
  if (bottomPts.length < 6) {
    bottomPts = pts;
  }

  // --- 2) nearest-neighbor distance in XZ ---
  const nn = nearestNeighborDistanceXZ(bottomPts);
  if (nn <= 0) {
    return {
      type: "square",
      confidence: 0.0,
      debug: { bottomCount: bottomPts.length, minY, nnDist: nn, avgNeighborCount: 0, anglePeaks: [] },
    };
  }

  const tol = nn * 0.12; // neighbor distance tolerance (12%)

  // --- 3) neighbor counts at nn ---
  const neighborCounts: number[] = [];
  const angleHistBin = 5; // degrees per bin
  const bins = Math.ceil(180 / angleHistBin);
  const angleHist = new Array(bins).fill(0);

  for (let i = 0; i < bottomPts.length; i++) {
    const a = bottomPts[i];
    let nCount = 0;
    for (let j = 0; j < bottomPts.length; j++) {
      if (i === j) continue;
      const b = bottomPts[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (Math.abs(d - nn) <= tol) {
        nCount++;
        const ang = angleDegXZ(new THREE.Vector3(dx, 0, dz));
        const bi = Math.max(0, Math.min(bins - 1, Math.round(ang / angleHistBin)));
        angleHist[bi] += 1;
      }
    }
    neighborCounts.push(nCount);
  }

  const avgNeighbors = neighborCounts.reduce((s, v) => s + v, 0) / neighborCounts.length;

  // --- 4) angle peak scores ---
  const peak0 = scoreAnglePeak(angleHist, 0, angleHistBin);
  const peak60 = scoreAnglePeak(angleHist, 60, angleHistBin);
  const peak90 = scoreAnglePeak(angleHist, 90, angleHistBin);
  const peak120 = scoreAnglePeak(angleHist, 120, angleHistBin);

  // square likes 0 + 90
  const squareAngleScore = peak0 + peak90;
  // triangular likes 0 + 60 + 120
  const triAngleScore = peak0 + peak60 + peak120;

  // --- 5) decide ---
  // Neighbor-count score: map (avg 4 => square, avg 6 => triangular)
  const triNeighborScore = clamp01((avgNeighbors - 4.2) / 1.3); // 4.2->0, 5.5->1-ish
  const squareNeighborScore = clamp01((5.0 - avgNeighbors) / 1.0); // 5->0, 4->1

  // Angle score: compare relative dominance
  const angleSum = squareAngleScore + triAngleScore + 1e-9;
  const triAngleFrac = triAngleScore / angleSum;
  const squareAngleFrac = squareAngleScore / angleSum;

  const triScore = 0.55 * triNeighborScore + 0.45 * triAngleFrac;
  const squareScore = 0.55 * squareNeighborScore + 0.45 * squareAngleFrac;

  const type: GridType = triScore > squareScore ? "triangular" : "square";
  const confidence = clamp01(Math.abs(triScore - squareScore) * 1.8); // amplify separation

  const debug = {
    bottomCount: bottomPts.length,
    minY,
    nnDist: nn,
    avgNeighborCount: avgNeighbors,
    anglePeaks: [
      { deg: 0, score: peak0 },
      { deg: 60, score: peak60 },
      { deg: 90, score: peak90 },
      { deg: 120, score: peak120 },
    ],
  };

  console.log("🧭 [GRID] bottomCount=", debug.bottomCount, "avgNeighbors=", avgNeighbors.toFixed(2), "nn=", nn.toFixed(3));
  console.log("🧭 [GRID] angle peaks:", debug.anglePeaks.map(p => `${p.deg}:${p.score}`).join(" | "));
  console.log(`🧭 [GRID] scores → tri=${triScore.toFixed(3)} square=${squareScore.toFixed(3)} => ${type} (conf=${confidence.toFixed(2)})`);

  return { type, confidence, debug };
}

