import { getPuzzleSolution, type PuzzleSolutionRecord } from '../../api/solutions';
import { GoldOrientationService } from '../../services/GoldOrientationService';
import * as THREE from 'three';

export type PieceId = string;

export interface AssemblyPiece {
  pieceId: PieceId;
  // Sphere centers in piece-local coordinates (IJK offsets)
  spheres: { x: number; y: number; z: number }[];
  // Final placement transform from solution
  finalTransform: {
    position: [number, number, number];
    quaternion: [number, number, number, number];
  };
}

export interface AssemblySolution {
  solutionId: string;
  pieces: AssemblyPiece[];
  puzzleCentroid: THREE.Vector3;
  allCells: { i: number; j: number; k: number }[]; // All IJK cells from solution for orientation
}

// FCC lattice transformation matrix (IJK to XYZ)
const T_ijk_to_xyz = [
  [0.5, 0.5, 0, 0],
  [0.5, 0, 0.5, 0],
  [0, 0.5, 0.5, 0],
  [0, 0, 0, 1],
];

function ijkToXyz(ijk: { i: number; j: number; k: number }): THREE.Vector3 {
  const x = T_ijk_to_xyz[0][0] * ijk.i + T_ijk_to_xyz[0][1] * ijk.j + T_ijk_to_xyz[0][2] * ijk.k;
  const y = T_ijk_to_xyz[1][0] * ijk.i + T_ijk_to_xyz[1][1] * ijk.j + T_ijk_to_xyz[1][2] * ijk.k;
  const z = T_ijk_to_xyz[2][0] * ijk.i + T_ijk_to_xyz[2][1] * ijk.j + T_ijk_to_xyz[2][2] * ijk.k;
  return new THREE.Vector3(x, y, z);
}

export async function loadSolutionForAssembly(solutionId: string): Promise<AssemblySolution> {
  // Fetch solution from API
  const solution: PuzzleSolutionRecord | null = await getPuzzleSolution(solutionId);

  if (!solution) {
    throw new Error(`Solution ${solutionId} not found`);
  }

  if (!solution.placed_pieces || !Array.isArray(solution.placed_pieces)) {
    throw new Error('Solution does not contain placed_pieces data');
  }

  // Initialize orientation service
  const orientationService = new GoldOrientationService();
  await orientationService.load();

  const pieces: AssemblyPiece[] = [];
  const allCentroids: THREE.Vector3[] = [];
  const allCells: { i: number; j: number; k: number }[] = [];

  // Process each placed piece
  for (const placedPiece of solution.placed_pieces) {
    const { pieceId, orientationId, cells } = placedPiece;
    
    // Collect all cells for orientation computation
    if (cells && Array.isArray(cells)) {
      allCells.push(...cells);
    }

    if (!pieceId || !orientationId || !cells || !Array.isArray(cells)) {
      console.warn('Skipping invalid placed piece:', placedPiece);
      continue;
    }

    // Get all orientations for this piece and find the matching one
    const orientations = orientationService.getOrientations(pieceId);
    const orientation = orientations.find((o) => o.orientationId === orientationId);
    
    if (!orientation) {
      console.warn(`Orientation ${orientationId} not found for piece ${pieceId}`);
      continue;
    }

    // Convert IJK offsets to local XYZ coordinates
    const spheres = orientation.ijkOffsets.map((offset: { i: number; j: number; k: number }) => {
      const xyz = ijkToXyz(offset);
      return { x: xyz.x, y: xyz.y, z: xyz.z };
    });

    // Compute piece centroid in world space from placed cells
    const worldCenters = cells.map((cell: { i: number; j: number; k: number }) => ijkToXyz(cell));
    const centroid = new THREE.Vector3();
    worldCenters.forEach((c: THREE.Vector3) => centroid.add(c));
    centroid.divideScalar(worldCenters.length);
    allCentroids.push(centroid);

    // Compute final transform (position + rotation from orientation)
    // Position: anchor cell (first cell) in world space
    const anchorCell = cells[0];
    const anchorWorld = ijkToXyz(anchorCell);

    // Get the local offset of the first sphere in the oriented piece
    const localFirstSphere = new THREE.Vector3(spheres[0].x, spheres[0].y, spheres[0].z);
    
    // Final position: anchor world position minus local first sphere offset
    const finalPosition = anchorWorld.clone().sub(localFirstSphere);

    // Quaternion: identity for now (pieces are already oriented in IJK space)
    const finalQuaternion = new THREE.Quaternion(0, 0, 0, 1);

    pieces.push({
      pieceId: `${pieceId}_${orientationId}`,
      spheres,
      finalTransform: {
        position: [finalPosition.x, finalPosition.y, finalPosition.z],
        quaternion: [
          finalQuaternion.x,
          finalQuaternion.y,
          finalQuaternion.z,
          finalQuaternion.w,
        ],
      },
    });
  }

  // Find minimum Y coordinate across all pieces to lift puzzle to sit on XZ plane
  let minY = Infinity;
  pieces.forEach(piece => {
    const pos = new THREE.Vector3(...piece.finalTransform.position);
    const quat = new THREE.Quaternion(...piece.finalTransform.quaternion);
    piece.spheres.forEach(sphere => {
      const localSphere = new THREE.Vector3(sphere.x, sphere.y, sphere.z);
      localSphere.applyQuaternion(quat);
      localSphere.add(pos);
      minY = Math.min(minY, localSphere.y);
    });
  });

  // Lift all pieces so lowest point is at Y=0
  const liftAmount = -minY;
  pieces.forEach(piece => {
    piece.finalTransform.position[1] += liftAmount;
  });

  // Compute overall puzzle centroid (after lifting)
  const puzzleCentroid = new THREE.Vector3();
  allCentroids.forEach((c) => puzzleCentroid.add(c));
  puzzleCentroid.divideScalar(allCentroids.length);
  puzzleCentroid.y += liftAmount;

  console.log(`✅ Loaded ${pieces.length} pieces for assembly (lifted by ${liftAmount.toFixed(2)})`);

  return {
    solutionId,
    pieces,
    puzzleCentroid,
    allCells,
  };
}
