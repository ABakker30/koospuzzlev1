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
  containerId?: string;
  clear?: boolean;            // true = clear & rebuild scene, false = status tick only
  restartCount?: number;      // Task 6: Number of restarts (for stats logging)
  tailTriggered?: boolean;    // Task 6: Whether tail solver was triggered (for stats logging)
}

export type Oriented = { id: number; cells: IJK[] };
export type PieceDef = { id: string; orientations: Oriented[] };
