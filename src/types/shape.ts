// Shape-related types and interfaces for the Koos Puzzle application

// IJK coordinate system (integer grid coordinates)
export interface IJK {
  i: number;
  j: number;
  k: number;
}

// XYZ coordinate system (3D world coordinates)
export interface XYZ {
  x: number;
  y: number;
  z: number;
}

// Scene rendering and display settings
export interface SceneSettings {
  backgroundColor: string;
  gridVisible: boolean;
  axesVisible: boolean;
  lighting: {
    ambient: number;
    directional: number;
  };
  camera: {
    position: XYZ;
    target: XYZ;
    fov: number;
  };
}

// Edit modes for shape manipulation
export enum EditMode {
  SELECT = 'select',
  ADD = 'add',
  REMOVE = 'remove',
  PAINT = 'paint',
  ROTATE = 'rotate',
  SCALE = 'scale'
}

// Individual cell/voxel record in the shape
export interface CellRecord {
  ijk: IJK;
  xyz: XYZ;
  color: string;
  material: string;
  visible: boolean;
  selected: boolean;
}

// Complete shape model containing all shape data
export interface ShapeModel {
  id: string;
  name: string;
  description: string;
  cells: CellRecord[];
  bounds: {
    min: IJK;
    max: IJK;
  };
  metadata: {
    created: Date;
    modified: Date;
    version: string;
    author: string;
  };
  settings: SceneSettings;
}

// File format for saving/loading shapes
export interface ShapeFile {
  version: string;
  format: 'koos-shape-v1';
  shape: ShapeModel;
  checksum: string;
}
