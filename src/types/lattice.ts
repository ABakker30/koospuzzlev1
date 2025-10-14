// Lattice types for Manual Puzzle page

export type IJK = [number, number, number];

export interface ContainerV3 {
  id: string;             // slug or filename
  name: string;           // display name
  cells: IJK[];           // lattice cells in FCC coordinates
  worldFromEngine?: number[][]; // 4x4; optional for MVP; if present, apply to world
  meta?: {
    sphereRadiusWorld?: number; // optional; fallback to theme default
  };
}

export interface Orientation {
  orientationId: string;      // stable ID for gold-standard list
  matrix: number[][];         // 3x3 or 4x4; use 4x4 for simplicity
  label?: string;             // optional display name
}

export interface VisibilitySettings {
  xray: boolean;
  emptyOnly: boolean;
  sliceY: { center: number; thickness: number };
}

export interface ManualPuzzleState {
  container?: ContainerV3;
  anchor?: IJK;              // currently selected empty cell
  visibility: VisibilitySettings;
  orientation: {
    pieceId?: string;        // future: selected/active piece
    index: number;           // current orientation index
  };
}
