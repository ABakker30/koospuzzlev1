// src/pages/auto-solver/engine/engineTypes.ts
import { IJK } from '../types';

export type EngineState = 'idle' | 'running' | 'paused' | 'solved' | 'error';

export interface EnginePlacement {
  pieceId: string;
  cells_ijk: IJK[]; // exactly 4
}

export interface EngineProgress {
  nodes: number;
  depth: number;
  placed: number;
  elapsedMs: number;
}

export type EngineEvent =
  | { type: 'started'; engine: string; config: Record<string, any> }
  | { type: 'progress'; progress: EngineProgress }
  | { type: 'placement_add'; placement: EnginePlacement }
  | { type: 'placement_remove'; pieceId: string }
  | { type: 'partial_solution'; placements: EnginePlacement[] }
  | { type: 'solved'; placements: EnginePlacement[] }
  | { type: 'error'; message: string };
