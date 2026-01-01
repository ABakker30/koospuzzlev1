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
    weightedAvgNeighborCount: number;
    anglePeaks: { deg: number; score: number }[];
    ijkDetection?: string;
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


// Angle-based grid detection using bottom layer geometry
// Square grid: neighbors at 90° angles
// Triangular grid: neighbors at 60°/120° angles
export function detectGridType(puzzleCells: IJK[], transforms: ViewTransforms): GridDetectionResult {
  const pts = puzzleCells.map((c) => ijkToWorld(c, transforms.M_world));

  if (pts.length < 4) {
    return { type: "square", confidence: 0.0, debug: { bottomCount: pts.length, minY: 0, nnDist: 0, avgNeighborCount: 0, weightedAvgNeighborCount: 0, anglePeaks: [] } };
  }

  // --- 1) Extract bottom layer (lowest Y) ---
  let minY = Infinity;
  for (const p of pts) minY = Math.min(minY, p.y);

  const bbox = new THREE.Box3().setFromPoints(pts);
  const diag = bbox.getSize(new THREE.Vector3()).length();
  const yEps = Math.max(1e-4, diag * 0.02); // 2% of diagonal for layer thickness

  let bottomPts = pts.filter((p) => Math.abs(p.y - minY) <= yEps);
  
  // If bottom layer too small, widen epsilon
  if (bottomPts.length < 4) {
    const yEps2 = diag * 0.05;
    bottomPts = pts.filter((p) => Math.abs(p.y - minY) <= yEps2);
  }
  
  // Still too small? Use all points
  if (bottomPts.length < 4) {
    bottomPts = pts;
  }

  console.log(`🧭 [GRID] Bottom layer: ${bottomPts.length} points (minY=${minY.toFixed(3)}, eps=${yEps.toFixed(4)})`);

  // --- 2) Find nearest-neighbor distance in XZ plane ---
  const nn = nearestNeighborDistanceXZ(bottomPts);
  if (nn <= 0) {
    return {
      type: "square",
      confidence: 0.0,
      debug: { bottomCount: bottomPts.length, minY, nnDist: nn, avgNeighborCount: 0, weightedAvgNeighborCount: 0, anglePeaks: [] },
    };
  }

  const neighborTol = nn * 0.15; // 15% tolerance for neighbor distance

  // --- 3) For each point, find neighbors and measure angles BETWEEN neighbor vectors ---
  const allAngles: number[] = [];
  
  for (const center of bottomPts) {
    // Find all neighbors at nn distance
    const neighbors: THREE.Vector3[] = [];
    for (const other of bottomPts) {
      if (other === center) continue;
      const dx = other.x - center.x;
      const dz = other.z - center.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (Math.abs(d - nn) <= neighborTol) {
        neighbors.push(new THREE.Vector3(dx, 0, dz).normalize());
      }
    }
    
    // Measure angles between pairs of neighbor vectors
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        const dot = neighbors[i].dot(neighbors[j]);
        const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
        const angleDeg = angleRad * (180 / Math.PI);
        allAngles.push(angleDeg);
      }
    }
  }

  console.log(`🧭 [GRID] Collected ${allAngles.length} inter-neighbor angles`);

  if (allAngles.length === 0) {
    return {
      type: "square",
      confidence: 0.0,
      debug: { bottomCount: bottomPts.length, minY, nnDist: nn, avgNeighborCount: 0, weightedAvgNeighborCount: 0, anglePeaks: [] },
    };
  }

  // --- 4) Count angles near key values ---
  const angleTol = 12; // degrees tolerance
  
  let count60 = 0;   // Triangular signature
  let count90 = 0;   // Square signature
  let count120 = 0;  // Triangular signature
  let count180 = 0;  // Opposite neighbors (both grids have this)
  
  for (const ang of allAngles) {
    if (Math.abs(ang - 60) <= angleTol) count60++;
    else if (Math.abs(ang - 90) <= angleTol) count90++;
    else if (Math.abs(ang - 120) <= angleTol) count120++;
    else if (Math.abs(ang - 180) <= angleTol) count180++;
  }

  console.log(`🧭 [GRID] Angle counts: 60°=${count60}, 90°=${count90}, 120°=${count120}, 180°=${count180}`);

  // --- 5) Decision based on angle pattern ---
  // Square grid: dominated by 90° and 180° angles
  // Triangular grid: dominated by 60° and 120° angles
  
  const squareScore = count90;
  const triangularScore = count60 + count120;
  const total = squareScore + triangularScore + 1;
  
  const squareFrac = squareScore / total;
  const triangularFrac = triangularScore / total;

  console.log(`🧭 [GRID] Scores: square=${squareScore} (${(squareFrac*100).toFixed(1)}%), triangular=${triangularScore} (${(triangularFrac*100).toFixed(1)}%)`);

  let type: GridType;
  let confidence: number;
  
  if (triangularScore > squareScore) {
    type = "triangular";
    confidence = clamp01((triangularFrac - squareFrac) * 2);
  } else {
    type = "square";
    confidence = clamp01((squareFrac - triangularFrac) * 2);
  }
  
  // Boost confidence if one pattern is clearly dominant
  if (triangularFrac > 0.7) confidence = Math.max(confidence, 0.85);
  if (squareFrac > 0.7) confidence = Math.max(confidence, 0.85);

  console.log(`🧭 [GRID] Result: ${type} (confidence=${confidence.toFixed(2)})`);

  const debug = {
    bottomCount: bottomPts.length,
    minY,
    nnDist: nn,
    avgNeighborCount: allAngles.length / Math.max(1, bottomPts.length),
    weightedAvgNeighborCount: 0,
    anglePeaks: [
      { deg: 60, score: count60 },
      { deg: 90, score: count90 },
      { deg: 120, score: count120 },
      { deg: 180, score: count180 },
    ],
  };

  return { type, confidence, debug };
}

