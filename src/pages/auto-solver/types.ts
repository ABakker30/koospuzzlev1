// src/pages/auto-solver/types.ts
import * as THREE from 'three';

export interface OrientationRecord {
  shapeId: string;
  M_worldFromIJK: THREE.Matrix4;
  M_IJKFromWorld: THREE.Matrix4; // inverse
  centroidWorld: THREE.Vector3;
}

export type IJK = [number, number, number];

export interface ContainerJSON {
  cells_ijk: IJK[];
  name?: string;
}
