// verify-tutorial.ts — prove the tutorial ladder containers are solvable with
// the real piece set (exact cover: distinct pieces, no overlaps, full fill).
//
//   npm run verify-tutorial
//
// Ladder (docs/onboarding-design.md): flat 8 (2 pieces) → flat 12 (3 pieces)
// → solid 16 (4 pieces). "Flat" = the i=0 lattice plane (coplanar in world
// space, so it classifies as the 2D category).

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

type IJK = { i: number; j: number; k: number };
const __dir = dirname(fileURLToPath(import.meta.url));

const pieces: Map<string, IJK[][]> = new Map(
  Object.entries(
    JSON.parse(readFileSync(resolve(__dir, '../public/data/Pieces/pieces.json'), 'utf-8'))
  )
);

const key = (c: IJK) => `${c.i},${c.j},${c.k}`;

function flat(js: number, ks: number): IJK[] {
  const cells: IJK[] = [];
  for (let j = 0; j < js; j++) for (let k = 0; k < ks; k++) cells.push({ i: 0, j, k });
  return cells;
}
function block(a: number, b: number, c: number): IJK[] {
  const cells: IJK[] = [];
  for (let i = 0; i < a; i++)
    for (let j = 0; j < b; j++) for (let k = 0; k < c; k++) cells.push({ i, j, k });
  return cells;
}

/** All placements of a piece inside the container, as cell-key sets. */
function placements(orientations: IJK[][], container: IJK[], inside: Set<string>) {
  const result: string[][] = [];
  for (const ori of orientations) {
    const base = ori[0];
    for (const anchor of container) {
      const di = anchor.i - base.i, dj = anchor.j - base.j, dk = anchor.k - base.k;
      const cells = ori.map((c) => `${c.i + di},${c.j + dj},${c.k + dk}`);
      if (cells.every((c) => inside.has(c))) result.push(cells);
    }
  }
  return result;
}

/** Count exact covers using distinct pieces (cap at `cap` to stop early). */
function solve(container: IJK[], cap = 5000): { solutions: number; sample: string[] | null } {
  const inside = new Set(container.map(key));
  const byPiece = new Map<string, string[][]>();
  for (const [id, oris] of pieces) byPiece.set(id, placements(oris, container, inside));

  let solutions = 0;
  let sample: string[] | null = null;
  const used: string[] = [];
  const covered = new Set<string>();
  const order = container.map(key);

  function dfs() {
    if (solutions >= cap) return;
    const target = order.find((c) => !covered.has(c));
    if (!target) {
      solutions++;
      if (!sample) sample = [...used];
      return;
    }
    for (const [id, places] of byPiece) {
      if (used.some((u) => u.startsWith(id + ':'))) continue;
      for (const cells of places) {
        if (!cells.includes(target)) continue;
        if (cells.some((c) => covered.has(c))) continue;
        cells.forEach((c) => covered.add(c));
        used.push(`${id}:${cells.join(' ')}`);
        dfs();
        used.pop();
        cells.forEach((c) => covered.delete(c));
        if (solutions >= cap) return;
      }
    }
  }
  dfs();
  return { solutions, sample };
}

// --- Search mode: find the most forgiving connected flat 8-cell shape -----
// FCC in-plane (i=0) neighbor offsets (triangular lattice).
const PLANE_NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
] as const;

function isConnected(cells: IJK[]): boolean {
  const inside = new Set(cells.map(key));
  const seen = new Set<string>([key(cells[0])]);
  const queue = [cells[0]];
  while (queue.length) {
    const c = queue.pop()!;
    for (const [dj, dk] of PLANE_NEIGHBORS) {
      const n = { i: 0, j: c.j + dj, k: c.k + dk };
      if (inside.has(key(n)) && !seen.has(key(n))) {
        seen.add(key(n));
        queue.push(n);
      }
    }
  }
  return seen.size === cells.length;
}

function searchFlat8() {
  // All connected 8-cell subsets of a 4×4 flat patch.
  const patch: IJK[] = [];
  for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) patch.push({ i: 0, j, k });
  const results: { cells: IJK[]; solutions: number }[] = [];
  const n = patch.length;
  // enumerate 16-choose-8 bitmasks (12870) — fine.
  for (let mask = 0; mask < 1 << n; mask++) {
    if (popcount(mask) !== 8) continue;
    const cells = patch.filter((_, idx) => mask & (1 << idx));
    if (!isConnected(cells)) continue;
    const { solutions } = solve(cells, 500);
    if (solutions > 0) results.push({ cells, solutions });
  }
  results.sort((a, b) => b.solutions - a.solutions);
  console.log(`\n== flat-8 search: ${results.length} solvable shapes found ==`);
  for (const r of results.slice(0, 5)) {
    console.log(`solutions: ${r.solutions}  cells: ${JSON.stringify(r.cells)}`);
  }
  if (results[0]) {
    const { sample } = solve(results[0].cells, 1);
    console.log('best shape sample solution:');
    sample?.forEach((s) => console.log(`  ${s.split(':')[0]} -> ${s.split(':')[1]}`));
  }
}
const popcount = (v: number) => {
  let c = 0;
  while (v) { c += v & 1; v >>= 1; }
  return c;
};

const ladder: [string, IJK[]][] = [
  ['flat 12 (4×3 in the i=0 plane, 3 pieces)', flat(4, 3)],
  ['solid 16 (2×2×4 block, 4 pieces)', block(2, 2, 4)],
];

for (const [name, cells] of ladder) {
  const { solutions, sample } = solve(cells);
  console.log(`\n== ${name} — ${cells.length} cells ==`);
  console.log(`exact covers (distinct pieces): ${solutions}${solutions >= 5000 ? '+' : ''}`);
  if (sample) {
    console.log('sample solution:');
    sample.forEach((s) => console.log(`  ${s.split(':')[0]} -> ${s.split(':')[1]}`));
  } else {
    console.log('NOT SOLVABLE — container needs redesign');
  }
  console.log(`cells: ${JSON.stringify(cells)}`);
}

searchFlat8();
