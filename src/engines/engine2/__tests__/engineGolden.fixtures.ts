// Golden-master fixtures for the engine2 search.
//
// Purpose: pin down the EXACT search behavior of engine2Solve so behavior-
// preserving refactors (incremental MRV, Uint32 bitboards, …) can be proven
// identical. The fingerprint captures ordered solution signatures plus node
// count / best depth / restart count — node count is the razor: any change
// to move ordering or bit semantics shifts the search tree and the count.
//
// Determinism requirements baked into the configs below:
//   • fixed seed (seeded xorshift32)
//   • shuffleStrategy 'none' (no restarts → no wall-clock branching)
//   • timeoutMs 0 (the timeout branch never fires)
//   • tail solver OFF for the node-count-sharp configs (the DLX tail's
//     main-thread time cap would otherwise couple node counts to wall time)
// A couple of configs turn the tail / gravity ON to guard those paths; on
// these tiny puzzles the tail completes in well under a millisecond, so they
// stay deterministic too.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Engine2Settings } from '../index';
import type { IJK } from '../../types';

export type Geometry = { i: number; j: number; k: number }[];

// Three structurally varied real puzzles (embedded so the test needs no DB):
//  wall16  — a 2×2×4 box with vertical walls (exercises the gravity filter)
//  plane12 — a single flat lattice plane
//  solid20 — an irregular 3D shape with interior cells
export const GEOMETRIES: Record<string, Geometry> = {
  wall16: [
    { i: 0, j: 0, k: 0 }, { i: 0, j: 0, k: 1 }, { i: 0, j: 0, k: 2 }, { i: 0, j: 0, k: 3 },
    { i: 0, j: 1, k: 0 }, { i: 0, j: 1, k: 1 }, { i: 0, j: 1, k: 2 }, { i: 0, j: 1, k: 3 },
    { i: 1, j: 0, k: 0 }, { i: 1, j: 0, k: 1 }, { i: 1, j: 0, k: 2 }, { i: 1, j: 0, k: 3 },
    { i: 1, j: 1, k: 0 }, { i: 1, j: 1, k: 1 }, { i: 1, j: 1, k: 2 }, { i: 1, j: 1, k: 3 },
  ],
  plane12: [
    { i: 0, j: 0, k: 0 }, { i: 0, j: 0, k: 1 }, { i: 0, j: 0, k: 2 },
    { i: 0, j: 1, k: 0 }, { i: 0, j: 1, k: 1 }, { i: 0, j: 1, k: 2 },
    { i: 0, j: 2, k: 0 }, { i: 0, j: 2, k: 1 }, { i: 0, j: 2, k: 2 },
    { i: 0, j: 3, k: 0 }, { i: 0, j: 3, k: 1 }, { i: 0, j: 3, k: 2 },
  ],
  solid20: [
    { i: 0, j: 0, k: 0 }, { i: -1, j: 0, k: 0 }, { i: -2, j: 0, k: 0 }, { i: -3, j: 0, k: 0 },
    { i: 0, j: -1, k: 1 }, { i: -1, j: -1, k: 1 }, { i: -2, j: -1, k: 1 },
    { i: 0, j: -2, k: 2 }, { i: -1, j: -2, k: 2 }, { i: 0, j: -3, k: 3 },
    { i: -1, j: 0, k: 1 }, { i: -1, j: -1, k: 2 }, { i: -2, j: 0, k: 1 }, { i: -3, j: 0, k: 1 },
    { i: -2, j: -1, k: 2 }, { i: -1, j: -2, k: 3 }, { i: -2, j: -1, k: 3 }, { i: -3, j: 0, k: 2 },
    { i: -2, j: 0, k: 2 }, { i: -3, j: 0, k: 3 },
  ],
};

const BASE: Engine2Settings = {
  maxSolutions: 3,          // force backtracking past the first solution
  pauseOnSolution: false,   // run straight through to completion
  statusIntervalMs: 1000,
  timeoutMs: 0,             // no wall-clock timeout branch
  moveOrdering: 'mostConstrainedCell',
  pruning: { connectivity: true, multipleOf4: true, colorResidue: true, neighborTouch: true },
  shuffleStrategy: 'none',
  seed: 20260101,
  tailSwitch: { enable: false },
  tt: { enable: false },
};

export type EngineCase = {
  name: string;
  geometry: keyof typeof GEOMETRIES;
  settings: Engine2Settings;
};

// The battery. Each case is deterministic and exercises a distinct path.
export const CASES: EngineCase[] = [
  // Pure DFS, MRV ordering, no tie randomization — the sharpest oracle.
  { name: 'plane12/mrv/deterministic', geometry: 'plane12', settings: { ...BASE } },
  { name: 'wall16/mrv/deterministic', geometry: 'wall16', settings: { ...BASE } },
  { name: 'solid20/mrv/deterministic', geometry: 'solid20', settings: { ...BASE } },

  // Tie randomization on (seeded) — exercises the candidate-cursor jump.
  { name: 'wall16/mrv/randomizeTies', geometry: 'wall16', settings: { ...BASE, randomizeTies: true } },
  { name: 'solid20/mrv/randomizeTies', geometry: 'solid20', settings: { ...BASE, randomizeTies: true } },

  // Naive move ordering (firstOpenBit) — guards the non-MRV target path.
  { name: 'wall16/naive', geometry: 'wall16', settings: { ...BASE, moveOrdering: 'naive' } },

  // Transposition table on — guards TT store/lookup/eviction.
  { name: 'solid20/tt', geometry: 'solid20', settings: { ...BASE, tt: { enable: true } } },

  // DLX tail on (engages immediately at ≤ N cells) — guards the tail path.
  { name: 'wall16/tail', geometry: 'wall16', settings: { ...BASE, maxSolutions: 1, tailSwitch: { enable: true, dlxThreshold: 64, dlxTimeoutMs: 5000 } } },

  // Gravity filter on the wall shape — guards gravity-legal candidate rows.
  { name: 'wall16/gravity', geometry: 'wall16', settings: { ...BASE, maxSolutions: 1, gravityConstraints: { enable: true } } },
];

// ---- Pieces loader for the headless (vitest/jsdom) environment ----
// The app fetches pieces_orientations.py at runtime; in tests we read it off
// disk and stub fetch so the real parser stays in the loop. Loaded once.
let piecesDbPromise: Promise<any> | null = null;
export function loadPiecesForTest() {
  if (piecesDbPromise) return piecesDbPromise;
  piecesDbPromise = (async () => {
    const pyPath = resolve(process.cwd(), 'public/data/Pieces/pieces_orientations.py');
    const text = readFileSync(pyPath, 'utf8');
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      if (String(url).includes('pieces_orientations.py')) {
        return { ok: true, text: async () => text } as any;
      }
      if (realFetch) return realFetch(url);
      throw new Error('unexpected fetch in test: ' + url);
    }) as any;
    try {
      const { loadAllPieces } = await import('../../piecesLoader');
      return await loadAllPieces();
    } finally {
      globalThis.fetch = realFetch;
    }
  })();
  return piecesDbPromise;
}

export type Fingerprint = {
  reason: string;
  solutions: number;
  nodes: number;
  bestDepth: number;
  restartCount: number;
  /** Canonical signature of each solution, in discovery order. */
  sigs: string[];
};

/** Run one case to completion and return its fingerprint. */
export async function runFingerprint(
  geometry: Geometry,
  settings: Engine2Settings
): Promise<Fingerprint> {
  const { engine2Precompute, engine2Solve } = await import('../index');
  const db = await loadPiecesForTest();
  const cells = geometry.map(c => [c.i, c.j, c.k] as [number, number, number]);
  const pre = engine2Precompute({ cells, id: 'golden' }, db);

  return new Promise<Fingerprint>((resolvePromise) => {
    const sigs: string[] = [];
    engine2Solve(pre, settings, {
      onSolution: (placements: Array<{ pieceId: string; ori: number; t: IJK }>) => {
        const sig = placements
          .map(p => `${p.pieceId}:${p.ori}:${p.t[0]},${p.t[1]},${p.t[2]}`)
          .sort()
          .join('|');
        sigs.push(sig);
      },
      onDone: (summary: any) => {
        resolvePromise({
          reason: summary.reason,
          solutions: summary.solutions,
          nodes: summary.nodes,
          bestDepth: summary.timing?.bestDepth ?? summary.bestDepth ?? 0,
          restartCount: summary.timing?.restartCount ?? summary.restartCount ?? 0,
          sigs,
        });
      },
    }).resume();
  });
}
