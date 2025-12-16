// src/engines/engine2/dlx.ts
// True DLX (Dancing Links) exact cover solver
// Primary columns = OPEN cells (must be covered exactly once)
// Secondary columns = piece instances (at most one use per instance; optional to cover)

import type { IJK } from '../../types/shape';

// Keep types compatible with engine2 bitboards
type Blocks = BigUint64Array;

export type DLXPlacement = { 
  pid: string; 
  ori: number; 
  t: IJK; 
  mask: Blocks; 
  cellsIdx: number[] 
};

export type DlxResult = {
  feasible: boolean;
  count: number;                 // number of solutions found (capped)
  capped: boolean;               // true if count hit limit
  witness?: DLXPlacement[];      // one completion (if requested and feasible)
  elapsedMs: number;
  reason: 'complete' | 'limit' | 'timeout';
};

type CandMask = { 
  pid: string; 
  ori: number; 
  t: IJK; 
  mask: Blocks; 
  cellsIdx: number[] 
};

export type BitboardPrecompForDLX = {
  blockCount: number;
  occAllMask: Blocks;          // valid bits
  candsByTarget: CandMask[][];
};

function isZero(b: Blocks): boolean {
  for (let i = 0; i < b.length; i++) if (b[i] !== 0n) return false;
  return true;
}

function andNotBlocks(a: Blocks, b: Blocks): Blocks {
  const out = new BigUint64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] & ~b[i];
  return out;
}

function testBit(b: Blocks, idx: number): boolean {
  const bi = (idx / 64) | 0;
  const bit = BigInt(idx % 64);
  return (b[bi] & (1n << bit)) !== 0n;
}

function forEachSetBit(mask: Blocks, fn: (idx: number) => void) {
  for (let bi = 0; bi < mask.length; bi++) {
    let word = mask[bi];
    while (word) {
      const t = word & -word;
      const bit = ctz64(t);
      fn(bi * 64 + bit);
      word ^= t;
    }
  }
}

function ctz64(x: bigint): number {
  // x is power of two
  let n = 0;
  let y = x;
  while ((y & 1n) === 0n) { y >>= 1n; n++; }
  return n;
}

function isSubset(mask: Blocks, open: Blocks): boolean {
  // all 1s in mask must also be 1s in open
  for (let i = 0; i < mask.length; i++) {
    if ((mask[i] & ~open[i]) !== 0n) return false;
  }
  return true;
}

// ---------- DLX core ----------
class DLX {
  // Node arrays (index-based linked lists)
  // 0 = root
  private L: Int32Array;
  private R: Int32Array;
  private U: Int32Array;
  private D: Int32Array;
  private C: Int32Array;        // column header index for node
  private rowId: Int32Array;    // row identifier for node (for witness)
  private colSize: Int32Array;  // size of column (for headers only)

  private nCols: number;
  private nPrimary: number;
  private root = 0;

  private nodeCount: number;    // next free node index
  private colHeadBase = 1;      // headers are [1..nCols]

  constructor(nCols: number, nPrimary: number, maxNodes: number) {
    this.nCols = nCols;
    this.nPrimary = nPrimary;

    // allocate arrays
    this.L = new Int32Array(maxNodes);
    this.R = new Int32Array(maxNodes);
    this.U = new Int32Array(maxNodes);
    this.D = new Int32Array(maxNodes);
    this.C = new Int32Array(maxNodes);
    this.rowId = new Int32Array(maxNodes);
    this.colSize = new Int32Array(this.colHeadBase + nCols + 1);

    // init root
    this.L[this.root] = this.root;
    this.R[this.root] = this.root;
    this.U[this.root] = this.root;
    this.D[this.root] = this.root;

    // init headers and link horizontally
    // root <-> 1 <-> 2 <-> ... <-> nCols <-> root
    for (let c = 1; c <= nCols; c++) {
      this.C[c] = c;
      this.colSize[c] = 0;

      // vertical list initially points to itself
      this.U[c] = c;
      this.D[c] = c;

      // horizontal linkage
      this.L[c] = c - 1;
      this.R[c] = (c === nCols) ? this.root : (c + 1);
    }
    this.L[1] = this.root;
    this.R[this.root] = (nCols >= 1) ? 1 : this.root;
    this.L[this.root] = (nCols >= 1) ? nCols : this.root;

    this.nodeCount = nCols + 1;
  }

  addRow(row: number, cols: number[]) {
    // Create nodes for this row and link them horizontally
    let first = -1;
    let prev = -1;

    for (let k = 0; k < cols.length; k++) {
      const col = cols[k];
      const colHead = this.colHeadBase + col; // 1-based header index

      const n = this.nodeCount++;
      this.C[n] = colHead;
      this.rowId[n] = row;

      // insert vertically into column (at bottom)
      const up = this.U[colHead];
      this.U[n] = up;
      this.D[n] = colHead;
      this.D[up] = n;
      this.U[colHead] = n;

      this.colSize[colHead]++;

      // link horizontally
      if (first < 0) {
        first = n;
        prev = n;
        this.L[n] = n;
        this.R[n] = n;
      } else {
        // insert n to the right of prev
        const right = this.R[prev];
        this.R[prev] = n;
        this.L[n] = prev;
        this.R[n] = right;
        this.L[right] = n;
        prev = n;
      }
    }
  }

  private cover(colHead: number) {
    // remove column header from horizontal list
    this.R[this.L[colHead]] = this.R[colHead];
    this.L[this.R[colHead]] = this.L[colHead];

    // remove rows that intersect this column
    for (let i = this.D[colHead]; i !== colHead; i = this.D[i]) {
      for (let j = this.R[i]; j !== i; j = this.R[j]) {
        const c = this.C[j];
        this.D[this.U[j]] = this.D[j];
        this.U[this.D[j]] = this.U[j];
        this.colSize[c]--;
      }
    }
  }

  private uncover(colHead: number) {
    // restore rows in reverse order
    for (let i = this.U[colHead]; i !== colHead; i = this.U[i]) {
      for (let j = this.L[i]; j !== i; j = this.L[j]) {
        const c = this.C[j];
        this.colSize[c]++;
        this.D[this.U[j]] = j;
        this.U[this.D[j]] = j;
      }
    }
    // restore column header into horizontal list
    this.R[this.L[colHead]] = colHead;
    this.L[this.R[colHead]] = colHead;
  }

  private choosePrimaryColumnMinSize(): number {
    // among PRIMARY columns only (headers 1..nPrimary), choose min size
    let best = -1;
    let bestSz = 0x7fffffff;

    // iterate headers in current horizontal list, but skip secondary > nPrimary
    for (let c = this.R[this.root]; c !== this.root; c = this.R[c]) {
      const idx0 = c - this.colHeadBase;     // 0-based
      if (idx0 >= this.nPrimary) continue;   // secondary column
      const sz = this.colSize[c];
      if (sz < bestSz) {
        bestSz = sz;
        best = c;
        if (bestSz <= 1) break;
      }
    }
    return best;
  }

  // Search
  solve(opts: { limit: number; deadlineMs: number; wantWitness: boolean }) {
    const t0 = performance.now();
    let count = 0;
    let capped = false;
    let reason: 'complete' | 'limit' | 'timeout' = 'complete';

    const solution: number[] = []; // row ids
    let witness: number[] | undefined;

    const dfs = (k: number): boolean => {
      if (performance.now() >= opts.deadlineMs) {
        reason = 'timeout';
        return false;
      }

      // done if no PRIMARY columns left
      // (i.e., all remaining columns in header list are secondary)
      let anyPrimaryLeft = false;
      for (let c = this.R[this.root]; c !== this.root; c = this.R[c]) {
        const idx0 = c - this.colHeadBase;
        if (idx0 < this.nPrimary) { anyPrimaryLeft = true; break; }
      }
      if (!anyPrimaryLeft) {
        count++;
        if (opts.wantWitness && !witness) witness = solution.slice();
        if (count >= opts.limit) {
          capped = true;
          reason = 'limit';
          return false; // stop search
        }
        return true; // continue search
      }

      const c = this.choosePrimaryColumnMinSize();
      if (c < 0) return true; // no primary columns found -> should have exited above

      if (this.colSize[c] === 0) return true; // dead end

      this.cover(c);
      for (let r = this.D[c]; r !== c; r = this.D[r]) {
        solution.push(this.rowId[r]);

        // cover all columns in row
        for (let j = this.R[r]; j !== r; j = this.R[j]) this.cover(this.C[j]);

        const cont = dfs(k + 1);

        // uncover
        for (let j = this.L[r]; j !== r; j = this.L[j]) this.uncover(this.C[j]);
        solution.pop();

        if (!cont && (reason === 'limit' || reason === 'timeout')) {
          this.uncover(c);
          return false;
        }
      }
      this.uncover(c);
      return true;
    };

    dfs(0);

    const elapsedMs = performance.now() - t0;
    return { count, capped, reason, witness, elapsedMs };
  }
}

// ---------- Build DLX from your state ----------
export function dlxExactCover(
  args: {
    open: Blocks;                        // OPEN cells bitboard
    remaining: Record<string, number>;   // inventory remaining
    bb: BitboardPrecompForDLX;           // your engine2 buildBitboards output (subset fields)
    // Optional: prefer only placements that stay within open (default true)
    timeoutMs?: number;                  // 0 = none
    limit?: number;                      // max solutions to count (default 1000)
    wantWitness?: boolean;               // return 1 completion placement list
  }
): DlxResult {
  const t0 = performance.now();
  const limit = args.limit ?? 1000;
  const timeoutMs = args.timeoutMs ?? 0;
  const deadlineMs = timeoutMs > 0 ? (performance.now() + timeoutMs) : Number.POSITIVE_INFINITY;
  const wantWitness = !!args.wantWitness;

  // Collect open cell indices and map idx->primary column
  const openIdxs: number[] = [];
  forEachSetBit(args.open, (idx) => openIdxs.push(idx));
  const nPrimary = openIdxs.length;

  // If no open cells -> already solved
  if (nPrimary === 0) {
    return {
      feasible: true,
      count: 1,
      capped: false,
      witness: wantWitness ? [] : undefined,
      elapsedMs: performance.now() - t0,
      reason: 'complete',
    };
  }

  // Secondary columns: expand inventory into piece instances
  // pid with count k => k columns
  const pieceCols: { pid: string; inst: number }[] = [];
  for (const pid of Object.keys(args.remaining)) {
    const k = Math.max(0, args.remaining[pid] ?? 0);
    for (let i = 0; i < k; i++) pieceCols.push({ pid, inst: i });
  }
  const nSecondary = pieceCols.length;

  const nCols = nPrimary + nSecondary;

  // Map from absolute cell idx to primary column id (0..nPrimary-1)
  const cellToCol = new Map<number, number>();
  for (let i = 0; i < openIdxs.length; i++) cellToCol.set(openIdxs[i], i);

  // Map from pid to its secondary column base range
  const pidToSecStart = new Map<string, number>();
  {
    let cursor = nPrimary;
    for (const pid of Object.keys(args.remaining)) {
      const k = Math.max(0, args.remaining[pid] ?? 0);
      if (k > 0) pidToSecStart.set(pid, cursor);
      cursor += k;
    }
  }

  // Build candidate rows: every valid placement that is fully inside OPEN
  // To avoid duplicates: maskHex + pid + ori + t
  const rows: DLXPlacement[] = [];
  const seen = new Set<string>();

  // To get full coverage, iterate targets over OPEN cells only, and pull candsByTarget[target]
  for (const targetIdx of openIdxs) {
    const cands = args.bb.candsByTarget[targetIdx] ?? [];
    for (const cm of cands) {
      // Must be subset of open (exact cover)
      if (!isSubset(cm.mask, args.open)) continue;

      // Must have inventory
      const k = args.remaining[cm.pid] ?? 0;
      if (k <= 0) continue;

      // dedup signature
      const sig = `${cm.pid}:${cm.ori}:${cm.t.i},${cm.t.j},${cm.t.k}:${maskToKey(cm.mask)}`;
      if (seen.has(sig)) continue;
      seen.add(sig);

      rows.push({ pid: cm.pid, ori: cm.ori, t: cm.t, mask: cm.mask, cellsIdx: cm.cellsIdx });
    }
  }

  // If no rows, infeasible
  if (rows.length === 0) {
    return {
      feasible: false,
      count: 0,
      capped: false,
      elapsedMs: performance.now() - t0,
      reason: 'complete',
    };
  }

  // Estimate node count: each row has 4 primary cell nodes + 1 secondary node variant per instance
  // But we will expand each row into k variants (one per piece instance) => nodes = sum( (4+1)*k )
  // This is okay because k is typically 1.
  let maxNodes = 1 + nCols; // root + headers
  for (const r of rows) {
    const k = Math.max(0, args.remaining[r.pid] ?? 0);
    maxNodes += (4 + 1) * k;
  }

  const dlx = new DLX(nCols, nPrimary, maxNodes);

  // Add rows to DLX, expanding by piece instance
  // RowId indexes into an expanded row table so we can reconstruct witness placements.
  const expanded: DLXPlacement[] = [];
  for (let baseRow = 0; baseRow < rows.length; baseRow++) {
    const r = rows[baseRow];
    const k = Math.max(0, args.remaining[r.pid] ?? 0);
    const secStart = pidToSecStart.get(r.pid);
    if (secStart === undefined) continue;

    // Primary cols for 4 cells
    const primCols: number[] = [];
    for (const cellIdx of r.cellsIdx) {
      const col = cellToCol.get(cellIdx);
      if (col === undefined) { primCols.length = 0; break; }
      primCols.push(col);
    }
    if (primCols.length !== 4) continue;

    // Expand with one secondary per instance
    for (let inst = 0; inst < k; inst++) {
      const rowId = expanded.length;
      expanded.push(r);

      const cols = primCols.concat([secStart + inst]); // add secondary col
      dlx.addRow(rowId, cols);
    }
  }

  // Solve
  const { count, capped, reason, witness, elapsedMs } = dlx.solve({
    limit,
    deadlineMs,
    wantWitness,
  });

  const feasible = count > 0;
  const outWitness = (feasible && wantWitness && witness)
    ? witness.map((rid) => expanded[rid])
    : undefined;

  return {
    feasible,
    count,
    capped,
    witness: outWitness,
    elapsedMs,
    reason,
  };
}

function maskToKey(mask: Blocks): string {
  // stable-ish key; used only for dedup
  let s = '';
  for (let i = 0; i < mask.length; i++) s += mask[i].toString(16) + '|';
  return s;
}
