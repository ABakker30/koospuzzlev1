// combinatorics.ts — compute honest, per-container search-space numbers for
// the Koos puzzle, from the engine's real piece data (public/data/Pieces/
// pieces.json: 25 pieces A–Y, each a list of precomputed FCC orientations).
//
// What is counted (all exact, BigInt):
//   orientations O_p   distinct rotated forms of piece p (from the data file)
//   placements  P_p    ways piece p fits fully inside the container
//                      (orientation × translation)
//   rows R = Σ P_p     the exact-cover matrix size solvers actually search
//   e_k(P_A..P_Y)      configurations: choose k = N/4 DISTINCT pieces and one
//                      placement each, ignoring overlaps — the naive
//                      configuration space a blind search wanders
//   e_k × k!           assembly sequences: same, counting placement ORDER
//
// Usage:
//   npm run combinatorics                      # canonical demo containers
//   npm run combinatorics -- --block 5x5x4    # ijk block container
//   npm run combinatorics -- --puzzle <uuid>  # real puzzle from Supabase
//   npm run combinatorics -- --md             # markdown table output
//
// Requires .env.local (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) only for
// --puzzle.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

type IJK = { i: number; j: number; k: number };
const __dir = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Piece data
// ---------------------------------------------------------------------------
function loadPieces(): Map<string, IJK[][]> {
  const raw = JSON.parse(
    readFileSync(resolve(__dir, '../public/data/Pieces/pieces.json'), 'utf-8')
  ) as Record<string, IJK[][]>;
  return new Map(Object.entries(raw));
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------
const key = (c: IJK) => `${c.i},${c.j},${c.k}`;

function blockContainer(a: number, b: number, c: number): IJK[] {
  const cells: IJK[] = [];
  for (let i = 0; i < a; i++)
    for (let j = 0; j < b; j++)
      for (let k = 0; k < c; k++) cells.push({ i, j, k });
  return cells;
}

async function fetchPuzzle(id: string): Promise<{ name: string; cells: IJK[] }> {
  const env = readFileSync(resolve(__dir, '../.env.local'), 'utf-8');
  const url = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
  const anon = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
  if (!url || !anon) throw new Error('Supabase env not found in .env.local');
  const res = await fetch(`${url}/rest/v1/puzzles?id=eq.${id}&select=name,geometry`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  const rows = (await res.json()) as { name: string; geometry: IJK[] }[];
  if (!rows[0]) throw new Error(`Puzzle ${id} not found`);
  return { name: rows[0].name, cells: rows[0].geometry };
}

// ---------------------------------------------------------------------------
// Placement counting
// ---------------------------------------------------------------------------
function placementsInContainer(orientations: IJK[][], container: IJK[]): number {
  const inside = new Set(container.map(key));
  let count = 0;
  for (const ori of orientations) {
    const base = ori[0];
    for (const anchor of container) {
      const di = anchor.i - base.i;
      const dj = anchor.j - base.j;
      const dk = anchor.k - base.k;
      let fits = true;
      for (const cell of ori) {
        if (!inside.has(`${cell.i + di},${cell.j + dj},${cell.k + dk}`)) {
          fits = false;
          break;
        }
      }
      if (fits) count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Exact big-number math
// ---------------------------------------------------------------------------
/** e_k of the placement counts: k distinct pieces, one placement each. */
function elementarySymmetric(values: number[], k: number): bigint {
  const c: bigint[] = new Array(k + 1).fill(0n);
  c[0] = 1n;
  for (const v of values) {
    const bv = BigInt(v);
    for (let j = Math.min(k, values.length); j >= 1; j--) {
      c[j] += c[j - 1] * bv;
    }
  }
  return c[k];
}

function factorial(n: number): bigint {
  let f = 1n;
  for (let i = 2; i <= n; i++) f *= BigInt(i);
  return f;
}

/** "3.2 × 10^76" for a BigInt. */
function sci(v: bigint): string {
  const s = v.toString();
  if (s.length <= 6) return s;
  const mant = `${s[0]}.${s.slice(1, 3)}`;
  return `${mant} × 10^${s.length - 1}`;
}

const log10 = (v: bigint): number => {
  const s = v.toString();
  return s.length - 1 + Math.log10(Number(`0.${s.slice(0, 15)}`) * 10);
};

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
function report(name: string, container: IJK[], pieces: Map<string, IJK[][]>, md: boolean) {
  const N = container.length;
  const k = N / 4;
  const ids = Array.from(pieces.keys());
  const rows = ids.map((id) => ({
    id,
    orientations: pieces.get(id)!.length,
    placements: placementsInContainer(pieces.get(id)!, container),
  }));
  const totalRows = rows.reduce((s, r) => s + r.placements, 0);
  const totalOris = rows.reduce((s, r) => s + r.orientations, 0);

  if (!Number.isInteger(k)) {
    console.log(`\n== ${name}: ${N} cells — not divisible by 4, not a valid container ==`);
    return;
  }

  const configs = elementarySymmetric(rows.map((r) => r.placements), Math.min(k, 25));
  const sequences = configs * factorial(Math.min(k, 25));

  console.log(`\n== ${name} — ${N} cells, needs ${k} of the 25 pieces ==`);
  if (md) {
    console.log('| piece | orientations | placements in container |');
    console.log('|---|---|---|');
    rows.forEach((r) => console.log(`| ${r.id} | ${r.orientations} | ${r.placements} |`));
  } else {
    const line = rows.map((r) => `${r.id}:${r.orientations}o/${r.placements}p`).join('  ');
    console.log(line);
  }
  console.log(`orientations, all pieces:      ${totalOris} (min ${Math.min(...rows.map(r => r.orientations))}, max ${Math.max(...rows.map(r => r.orientations))})`);
  console.log(`placement rows (solver search): ${totalRows}`);
  if (k > 25) {
    console.log(`NOTE: needs ${k} pieces > 25 — multiple sets; numbers below assume one set of each piece and are a LOWER bound.`);
  }
  console.log(`configurations  e_${Math.min(k, 25)}(P):        ${sci(configs)}   (choose ${Math.min(k, 25)} distinct pieces + a placement each, overlaps ignored)`);
  console.log(`assembly sequences (× ${Math.min(k, 25)}!):    ${sci(sequences)}   (same, counting placement order)`);
  console.log(`log10: configurations ${log10(configs).toFixed(1)}, sequences ${log10(sequences).toFixed(1)}`);
}

// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const md = args.includes('--md');
  const pieces = loadPieces();

  console.log('Koos puzzle combinatorics — computed from public/data/Pieces/pieces.json');
  console.log(`pieces: ${pieces.size}, orientation counts: ${Array.from(pieces.entries()).map(([id, o]) => `${id}=${o.length}`).join(' ')}`);

  const blockArg = args[args.indexOf('--block') + 1];
  const puzzleArg = args[args.indexOf('--puzzle') + 1];

  if (args.includes('--puzzle') && puzzleArg) {
    const p = await fetchPuzzle(puzzleArg);
    report(`puzzle "${p.name}"`, p.cells, pieces, md);
  } else if (args.includes('--block') && blockArg) {
    const [a, b, c] = blockArg.split('x').map(Number);
    report(`ijk block ${a}×${b}×${c}`, blockContainer(a, b, c), pieces, md);
  } else {
    // Canonical demo ladder: small → classic full-set container.
    report('small: ijk block 2×2×4 (16 cells)', blockContainer(2, 2, 4), pieces, md);
    report('medium: ijk block 5×5×2 (50 cells)', blockContainer(5, 5, 2), pieces, md);
    report('classic: ijk block 5×5×4 (100 cells)', blockContainer(5, 5, 4), pieces, md);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
