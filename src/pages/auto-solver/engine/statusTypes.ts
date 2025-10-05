// src/pages/auto-solver/engine/statusTypes.ts

export interface StatusCell {
  i: number;
  j: number;
  k: number;
}

export interface StackEntry {
  instance_id: number;
  piece_type: number;
  piece_label: string;
  cells: StatusCell[];
}

export interface StatusMetrics {
  nodes: number;
  pruned: number;
  depth: number;
  solutions: number;
  elapsed_ms: number;
  best_depth: number;
}

export interface StatusContainer {
  cid: string;
  cells: number;
}

export interface EngineStatus {
  version: number;
  ts_ms: number;
  engine: string;
  phase: string;
  run_id: string;
  container: StatusContainer;
  metrics: StatusMetrics;
  stack_truncated: boolean;
  stack: StackEntry[];
}
