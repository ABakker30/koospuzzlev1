import type { IJK } from '../../../types/shape';
import { ijkToXyz } from '../../../lib/ijk';

export type GridType = 'square' | 'hex';

interface GridDetectionResult {
  type: GridType;
  confidence: number;
}

export function detectGridType(ijkCells: IJK[]): GridDetectionResult {
  if (ijkCells.length < 2) {
    return { type: 'square', confidence: 0 };
  }

  const xyzCells = ijkCells.map(ijk => ijkToXyz(ijk));
  
  const bottomLayer = findBottomLayer(xyzCells);
  if (bottomLayer.length < 2) {
    return { type: 'square', confidence: 0 };
  }

  const neighborDistances = computeNeighborDistances(bottomLayer);
  
  if (neighborDistances.length === 0) {
    return { type: 'square', confidence: 0 };
  }

  const avgDistance = neighborDistances.reduce((a, b) => a + b, 0) / neighborDistances.length;
  
  const squareScore = computeSquareScore(neighborDistances, avgDistance);
  const hexScore = computeHexScore(neighborDistances, avgDistance);

  if (hexScore > squareScore) {
    return { type: 'hex', confidence: hexScore };
  } else {
    return { type: 'square', confidence: squareScore };
  }
}

function findBottomLayer(xyzCells: { x: number; y: number; z: number }[]): { x: number; y: number; z: number }[] {
  if (xyzCells.length === 0) return [];
  
  const minY = Math.min(...xyzCells.map(c => c.y));
  const tolerance = 0.1;
  
  return xyzCells.filter(c => Math.abs(c.y - minY) < tolerance);
}

function computeNeighborDistances(cells: { x: number; y: number; z: number }[]): number[] {
  const distances: number[] = [];
  
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const dx = cells[i].x - cells[j].x;
      const dz = cells[i].z - cells[j].z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist > 0.1) {
        distances.push(dist);
      }
    }
  }
  
  return distances;
}

function computeSquareScore(distances: number[], avgDistance: number): number {
  let orthogonalCount = 0;
  
  for (const d of distances) {
    const ratio = d / avgDistance;
    
    if (Math.abs(ratio - 1.0) < 0.15) {
      orthogonalCount++;
    } else if (Math.abs(ratio - Math.sqrt(2)) < 0.15) {
      orthogonalCount++;
    }
  }
  
  return orthogonalCount / distances.length;
}

function computeHexScore(distances: number[], avgDistance: number): number {
  let hexCount = 0;
  
  for (const d of distances) {
    const ratio = d / avgDistance;
    
    if (Math.abs(ratio - 1.0) < 0.15) {
      hexCount++;
    } else if (Math.abs(ratio - Math.sqrt(3)) < 0.15) {
      hexCount++;
    }
  }
  
  return hexCount / distances.length;
}

export function getBottomLayerCenters(ijkCells: IJK[]): { x: number; y: number; z: number }[] {
  const xyzCells = ijkCells.map(ijk => ijkToXyz(ijk));
  console.log(`🔍 [GRID] Total cells: ${ijkCells.length}, converted to XYZ: ${xyzCells.length}`);
  
  const bottomLayer = findBottomLayer(xyzCells);
  console.log(`🔍 [GRID] Bottom layer has ${bottomLayer.length} spheres`);
  
  if (bottomLayer.length > 0) {
    const minY = Math.min(...xyzCells.map(c => c.y));
    console.log(`🔍 [GRID] Min Y: ${minY.toFixed(3)}, first few Y values: ${xyzCells.slice(0, 5).map(c => c.y.toFixed(3)).join(', ')}`);
  }
  
  return bottomLayer;
}
