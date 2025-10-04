import * as THREE from 'three';

export type IJK = [number, number, number];

export interface SolutionPieceJSON {
  piece: string; // piece ID
  ori: number;
  t: IJK;
  cells_ijk: IJK[]; // exactly 4
}

export interface SolutionJSON {
  version: number;
  containerCidSha256: string;
  lattice: string;
  piecesUsed: Record<string, number>;
  placements: SolutionPieceJSON[];
  sid_state_sha256: string;
  sid_route_sha256: string;
  sid_state_canon_sha256: string;
  mode: string;
  solver: {
    engine: string;
    seed: number;
    flags: Record<string, boolean>;
  };
}

export interface OrientedPiece {
  id: string;
  centers: THREE.Vector3[]; // 4 world-space centers (oriented & centered)
  centroid: THREE.Vector3;
}

export interface OrientedSolution {
  pieces: OrientedPiece[];
  centroid: THREE.Vector3;
}

export interface LoadedSolution {
  path: string;
  oriented: OrientedSolution;
  root: THREE.Group;
  pieceMeta: PieceOrderEntry[]; // one per piece, stores minY, centroidY, id, group
}

export interface PieceOrderEntry {
  id: string;
  group: THREE.Group;
  minY: number;
  centroidY: number;
}
