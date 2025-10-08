// Auto-Solve engine types for legacy JSON format

export type IJK = readonly [number, number, number];

export interface LegacyContainer {
  id?: string;
  lattice?: string;           // "fcc" if present
  cells?: IJK[];              // legacy
  cells_ijk?: IJK[];          // sometimes present
}

export type Placement = { pieceId: string; ori: number; t: IJK };

export interface StatusV2 {
  engine: string;             // "dfs"
  phase: "search" | "done";
  nodes?: number;
  depth?: number;
  elapsedMs?: number;
  pruned?: number;
  placed?: number;
  open_cells?: number;
  stack?: Placement[];
  empties_idx?: number[];
}

export type Oriented = { id: number; cells: IJK[] };
export type PieceDef = { id: string; orientations: Oriented[] };
