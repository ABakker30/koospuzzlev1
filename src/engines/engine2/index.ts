// src/engines/engine2/index.ts
// Engine #2 - DFS with stall-based shuffle + deterministic tie randomization
// Pass 0 & Pass 1: Drop-in replacement for dfs2 with stochastic plateau escape

import type { IJK, Placement, StatusV2 } from "../types";
import { dlxExactCover } from "./dlx";

// ---------- Public types ----------
export type Oriented = { id: number; cells: IJK[] };
export type PieceDB = Map<string, Oriented[]>;

export type Engine2Settings = {
  maxSolutions?: number;              // 0 = unlimited (default)
  timeoutMs?: number;                 // 0 = no timeout (default)
  statusIntervalMs?: number;          // default 250
  pauseOnSolution?: boolean;          // default true
  saveSolutions?: boolean;            // default false
  savePath?: string;                  // directory path for saving solutions

  moveOrdering?: "mostConstrainedCell" | "naive";
  pruning?: {
    connectivity?: boolean;           // default true
    multipleOf4?: boolean;            // default true
    colorResidue?: boolean;           // default true (Pass 3: FCC color parity)
    neighborTouch?: boolean;          // default true (Pass 4: require touching cluster)
  };

  pieces?: {
    allow?: string[];                 // only these piece IDs (default = all)
    inventory?: Record<string, number>; // per-piece counts (default = 1 each)
  };

  view?: {
    worldFromIJK: number[][];         // 4x4 transform matrix
    sphereRadiusWorld: number;        // sphere radius in world space
  };

  // Stochastic tie-breaking for deterministic plateau escape
  seed?: number;                      // RNG seed for deterministic behavior
  randomizeTies?: boolean;            // default true (escape plateaus)

  // Piece ordering strategies
  shuffleStrategy?: "none" | "initial" | "periodicRestart" | "periodicRestartTime" | "adaptive";  // default "none"
  restartInterval?: number;           // nodes between restarts (for periodicRestart)
  restartIntervalSeconds?: number;    // seconds between restarts (for periodicRestartTime)
  maxRestarts?: number;               // max restart attempts (for periodicRestart/periodicRestartTime)
  shuffleTriggerDepth?: number;       // backtrack depth threshold (for adaptive)
  maxSuffixShuffles?: number;         // max shuffles per branch (for adaptive)

  // Pass 3: Transposition Table
  tt?: {
    enable?: boolean;                 // default true
    bytes?: number;                   // default 64MB (67108864)
    policy?: "2way";                  // 2-way set associative
  };

  // Tail solver (DLX exact cover for endgame)
  tailSwitch?: {
    enable?: boolean;                 // default true
    dlxThreshold?: number;            // default 100 (use DLX when <= N open cells)
    dlxTimeoutMs?: number;            // default 30000 (30 seconds for DLX tail solver)
  };

  // Display settings
  visualRevealDelayMs?: number;       // default 150 (delay between pieces appearing)
};

export type Engine2Events = {
  onStatus?: (s: StatusV2) => void;
  onSolution?: (placements: Placement[]) => void;
  onDone?: (summary: {
    solutions: number; nodes: number; elapsedMs: number;
    reason: "complete" | "timeout" | "limit" | "canceled"
  }) => void;
  onSaveSolutionFile?: (solution: {
    index: number;
    placements: Placement[];
    containerId?: string;
    nodes: number;
    elapsedMs: number;
  }) => void;
};

export type Engine2Snapshot = {
  schema: 2;
  N: number;
  occHex: string;                         // BigInt hex
  pieceOrder: string[];
  remaining: Record<string, number>;
  frames: FrameSnap[];
  nodes: number;
  solutions: number;
  elapsedMs: number;
  settings: Engine2Settings;
  containerId?: string;
  // (optional future) rngState?: number;
};

export type Engine2RunHandle = {
  pause(): void;
  resume(): void;
  cancel(): void;
  snapshot(): Engine2Snapshot;
};

// ---------- Internal types ----------
type Candidate = {
  pid: string;
  ori: number;
  t: IJK;
  mask: Blocks;
  cellsIdx: number[];
};

type Placed = {
  pid: string;
  ori: number;
  t: IJK;
  mask: Blocks;
  cellsIdx: number[];
};

type Frame = {
  targetIdx: number;
  iPiece: number;
  iOri: number;
  iAnchor: number;
  placed?: Placed;
};

type FrameSnap = {
  targetIdx: number;
  iPiece: number;
  iOri: number;
  iAnchor: number;
  placed?: {
    pieceId: string;
    ori: number;
    t: IJK;
    maskHex: string;
  };
};

// ---------- Precompute (same as dfs2 for now) ----------
export function engine2Precompute(
  container: { cells: IJK[]; id?: string },
  pieces: PieceDB
) {
  // Map cell key -> bit index
  const bitIndex = new Map<string, number>();
  container.cells.forEach((c, idx) => bitIndex.set(key(c), idx));

  // FCC neighbor kernel (12)
  const NBR: IJK[] = [
    [ 1, 0, 0], [-1, 0, 0], [0, 1, 0], [0,-1, 0], [0, 0, 1], [0, 0,-1],
    [ 1,-1, 0], [-1, 1, 0], [1, 0,-1], [-1, 0, 1], [0, 1,-1], [0,-1, 1],
  ];

  // Build neighbor graph
  const neighbors: number[][] = container.cells.map((c) => {
    const out: number[] = [];
    for (const d of NBR) {
      const n: IJK = [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
      const j = bitIndex.get(key(n));
      if (j !== undefined) out.push(j);
    }
    return out;
  });

  const N = container.cells.length;
  const occMaskAll = (1n << BigInt(N)) - 1n;

  return {
    id: container.id,
    cells: container.cells,
    bitIndex,
    neighbors,
    pieces,
    N,
    occMaskAll,
  };
}

// ---- Bitboard precompute (Pass 2) ----
export type Blocks = BigUint64Array;               // bitboard blocks (64 cells per block)

export type CandMask = { pid: string; ori: number; t: IJK; mask: Blocks; cellsIdx: number[] };

export type BitboardPrecomp = {
  blockCount: number;
  occAllMask: Blocks;                       // ((1<<N)-1) packed into blocks (upper bits zeroed)
  // For each target cell index, all valid placements as bitboards
  candsByTarget: CandMask[][];
  // Per-index neighbor as bitboard (for flood fill)
  neighborBits: Blocks[];
  // Pass 3: FCC color masks (2-coloring based on coordinate parity)
  color0Blocks: Blocks;                     // cells where (i+j+k) % 2 == 0
  color1Blocks: Blocks;                     // cells where (i+j+k) % 2 == 1
  // Pass 3: Zobrist hashing for TT
  zCell: bigint[];                          // random value per cell index
  zInv: Map<string, bigint[]>;              // random values per piece ID per count
};

export function buildBitboards(pre: ReturnType<typeof engine2Precompute>): BitboardPrecomp {
  const N = pre.N;
  const blockCount = Math.ceil(N / 64);
  const occAllMask = newBlocks(blockCount);
  for (let i = 0; i < N; i++) setBit(occAllMask, i);     // all 1s for valid indices

  // neighbor bitboards per index
  const neighborBits: Blocks[] = Array.from({ length: N }, () => zeroBlocks(blockCount));
  for (let i = 0; i < N; i++) {
    const b = neighborBits[i];
    for (const j of pre.neighbors[i]) setBit(b, j);
  }

  // Pass 3: Color masks for FCC parity (2-coloring)
  const color0Blocks = zeroBlocks(blockCount);
  const color1Blocks = zeroBlocks(blockCount);
  for (let i = 0; i < N; i++) {
    const cell = pre.cells[i];
    const sum = cell[0] + cell[1] + cell[2];
    if (sum % 2 === 0) {
      setBit(color0Blocks, i);
    } else {
      setBit(color1Blocks, i);
    }
  }

  // Pass 3: Zobrist hashing (for TT)
  // Simple RNG for generating random bigints (seeded for reproducibility)
  let zobristSeed = 0x123456789abcdefn;
  function randomBigInt(): bigint {
    zobristSeed ^= zobristSeed << 13n;
    zobristSeed ^= zobristSeed >> 17n;
    zobristSeed ^= zobristSeed << 43n;
    return zobristSeed;
  }

  // One random value per cell index
  const zCell: bigint[] = [];
  for (let i = 0; i < N; i++) {
    zCell.push(randomBigInt());
  }

  // Random values per piece ID per inventory count
  const zInv = new Map<string, bigint[]>();
  for (const pid of pre.pieces.keys()) {
    const maxCount = 10; // arbitrary max inventory per piece
    const vals: bigint[] = [];
    for (let c = 0; c <= maxCount; c++) {
      vals.push(randomBigInt());
    }
    zInv.set(pid, vals);
  }

  // For each target cell, precompute all valid placements (piece, ori, anchor) as bitboards
  const candsByTarget: CandMask[][] = Array.from({ length: N }, () => []);

  // Helper: create a mask from a list of ijk cells (translated) → index bitboard + indices
  function cellsToMaskAndIdx(cells: IJK[]): { mask: Blocks; idx: number[] } | null {
    const M = zeroBlocks(blockCount);
    const idxs: number[] = [];
    for (const c of cells) {
      const idx = pre.bitIndex.get(`${c[0]},${c[1]},${c[2]}`);
      if (idx === undefined) return null;   // outside container
      setBit(M, idx);
      idxs.push(idx);
    }
    return { mask: M, idx: idxs };
  }

  // Precompute oriented placement masks by target
  for (const [pid, oris] of pre.pieces.entries()) {
    for (const o of oris) {
      // For each anchor cell in this orientation
      for (const anchor of o.cells) {
        // For each target cell in container: translate this orientation so 'anchor' → target
        for (let targetIdx = 0; targetIdx < N; targetIdx++) {
          const tCell = pre.cells[targetIdx];
          const dx = tCell[0] - anchor[0];
          const dy = tCell[1] - anchor[1];
          const dz = tCell[2] - anchor[2];

          // Translate all cells of this orientation
          const translated: IJK[] = o.cells.map(c => [c[0] + dx, c[1] + dy, c[2] + dz] as IJK);
          const built = cellsToMaskAndIdx(translated);
          if (!built) continue; // at least one cell outside container

          // Store bitboard with translation vector and cell indices
          const t: IJK = [dx, dy, dz];
          candsByTarget[targetIdx].push({ pid, ori: o.id, t, mask: built.mask, cellsIdx: built.idx });
        }
      }
    }
  }

  // De-duplicate identical masks per target (same pid/ori may collide via different anchors)
  for (let t = 0; t < N; t++) {
    const uniq: CandMask[] = [];
    const seen = new Set<string>();
    for (const cm of candsByTarget[t]) {
      const key = blocksToHex(cm.mask);
      const sig = `${cm.pid}:${cm.ori}:${key}`;
      if (!seen.has(sig)) { seen.add(sig); uniq.push(cm); }
    }
    candsByTarget[t] = uniq;
  }

  return { blockCount, occAllMask, candsByTarget, neighborBits, color0Blocks, color1Blocks, zCell, zInv };
}

// ---- Blocks helpers ----
function zeroBlocks(n: number): Blocks { return new BigUint64Array(n); }
function newBlocks(n: number): Blocks { return new BigUint64Array(n); }
function setBit(b: Blocks, idx: number) {
  const bi = (idx / 64) | 0; const bit = BigInt(idx % 64);
  b[bi] |= (1n << bit);
}
function isFits(occ: Blocks, mask: Blocks): boolean {
  for (let i = 0; i < occ.length; i++) if ((occ[i] & mask[i]) !== 0n) return false;
  return true;
}
function orEq(dst: Blocks, src: Blocks) { for (let i = 0; i < dst.length; i++) dst[i] |= src[i]; }
function xorEq(dst: Blocks, src: Blocks) { for (let i = 0; i < dst.length; i++) dst[i] ^= src[i]; }
function blocksToHex(b: Blocks): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16) + "|";
  return s;
}
function blocksEqual(a: Blocks, b: Blocks): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function orBlocks(a: Blocks, b: Blocks): Blocks {
  const out = newBlocks(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] | b[i];
  return out;
}
function andBlocks(a: Blocks, b: Blocks): Blocks {
  const out = newBlocks(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] & b[i];
  return out;
}
function andNotBlocks(a: Blocks, b: Blocks): Blocks {
  const out = newBlocks(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] & ~b[i];
  return out;
}
function popcountBlocks(b: Blocks): number {
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    let x = b[i];
    while (x) { x &= (x - 1n); n++; }
  }
  return n;
}
function testBit(b: Blocks, idx: number): boolean {
  const bi = (idx / 64) | 0; const bit = BigInt(idx % 64);
  return (b[bi] & (1n << bit)) !== 0n;
}
function testBitInverse(occ: Blocks, idx: number): boolean {
  // returns true if cell is OPEN (0 in occ)
  const bi = (idx / 64) | 0; const bit = BigInt(idx % 64);
  return (occ[bi] & (1n << bit)) === 0n;
}
function forEachSetBit(mask: Blocks, fn: (idx: number) => void) {
  for (let bi = 0; bi < mask.length; bi++) {
    let word = mask[bi];
    while (word) {
      const t = word & -word;                    // isolate lowest set bit
      const bit = Number(log2BigInt(t));         // position inside word
      const idx = bi * 64 + bit;
      fn(idx);
      word ^= t;
    }
  }
}
function log2BigInt(x: bigint): bigint {
  // count trailing zeros: position of isolated bit 'x'
  let n = 0n, y = x;
  while ((y & 1n) === 0n) { y >>= 1n; n++; }
  return n;
}

// ---- Pass 3: Transposition Table (TT) ----
class TranspositionTable {
  private slots: number;
  private ways = 2;  // 2-way set associative
  private keys: BigUint64Array;
  private flags: Uint8Array;
  
  constructor(bytes: number) {
    // Each entry: 8 bytes (key) + 1 byte (flag) = 9 bytes
    // But we store 2 ways per slot, so ~18 bytes per slot
    this.slots = Math.floor(bytes / (this.ways * 9));
    this.keys = new BigUint64Array(this.slots * this.ways);
    this.flags = new Uint8Array(this.slots * this.ways);
    // Initialize with zeros (0 = empty)
  }
  
  lookup(h: bigint): number {
    const slot = Number(h % BigInt(this.slots));
    const baseIdx = slot * this.ways;
    
    for (let way = 0; way < this.ways; way++) {
      const idx = baseIdx + way;
      if (this.keys[idx] === h) {
        return this.flags[idx]; // Hit: return flag (1=UNSOLVABLE, 2=SEEN, etc.)
      }
    }
    return 0; // Miss
  }
  
  store(h: bigint, flag: number): void {
    const slot = Number(h % BigInt(this.slots));
    const baseIdx = slot * this.ways;
    
    // Try to find empty slot or replace oldest
    for (let way = 0; way < this.ways; way++) {
      const idx = baseIdx + way;
      if (this.flags[idx] === 0 || this.keys[idx] === h) {
        // Empty or updating same key
        this.keys[idx] = h;
        this.flags[idx] = flag;
        return;
      }
    }
    
    // All ways occupied, replace first slot (simple replacement policy)
    this.keys[baseIdx] = h;
    this.flags[baseIdx] = flag;
  }
}

// Pass 4: Old hash functions removed - now using incremental hashing in solver

// ---------- Exported Helpers for DLX Integration ----------
// These are used by hintEngine.ts for DLX-based hints and solvability checks
export { andNotBlocks, popcountBlocks, forEachSetBit, newBlocks, orBlocks, testBit };

// ---------- Solve ----------
export function engine2Solve(
  pre: ReturnType<typeof engine2Precompute>,
  settings: Engine2Settings,
  events?: Engine2Events,
  resumeSnapshot?: Engine2Snapshot
): Engine2RunHandle {
  const cfg = normalize(settings);
  const startTime = performance.now();

  // Seeded RNG for tie-breaking and shuffling
  const rng = xorshift32(cfg.seed ?? 12345);
  
  // Fisher-Yates shuffle helper
  function shuffleArray<T>(arr: T[], start = 0): void {
    for (let i = arr.length - 1; i > start; i--) {
      const j = start + Math.floor(rng() * (i - start + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // Piece order state (mutated during search) (root)
  const pieceOrderBase = (cfg.pieces?.allow ?? [...pre.pieces.keys()]).sort();
  const pieceOrderCur = [...pieceOrderBase];
  
  // Apply initial shuffle based on strategy
  if (cfg.shuffleStrategy === "initial" || cfg.shuffleStrategy === "periodicRestart" || cfg.shuffleStrategy === "periodicRestartTime" || cfg.shuffleStrategy === "adaptive") {
    shuffleArray(pieceOrderCur);
  }
  
  const remaining: Record<string, number> = {};
  for (const pid of pieceOrderCur) {
    remaining[pid] = Math.max(0, Math.floor(cfg.pieces?.inventory?.[pid] ?? 1));
  }

  // CRITICAL: Verify shuffle actually happened
  if (cfg.shuffleStrategy === 'initial') {
    const isAlphabetical = pieceOrderCur.every((p, i) => i === 0 || p >= pieceOrderCur[i-1]);
    console.log('🎲 SEED:', cfg.seed, '| ORDER:', pieceOrderCur.slice(0, 8).join(','), '|', isAlphabetical ? '❌ FAILED' : '✅ OK');
  }

  // Build bitboard precomp (Pass 2)
  const bb = buildBitboards(pre);
  
  // CRITICAL: Sort candidates by current piece order so shuffle actually affects search
  const pieceOrderMap = new Map<string, number>();
  pieceOrderCur.forEach((pid: string, idx: number) => pieceOrderMap.set(pid, idx));
  
  for (let t = 0; t < pre.N; t++) {
    bb.candsByTarget[t].sort((a, b) => {
      const orderA = pieceOrderMap.get(a.pid) ?? 999;
      const orderB = pieceOrderMap.get(b.pid) ?? 999;
      return orderA - orderB;
    });
  }
  console.log('\ud83d\udd04 Candidates sorted by piece order');

  // State (bitboards)
  let occBlocks: Blocks = zeroBlocks(bb.blockCount);
  let nodes = 0, pruned = 0, solutions = 0;
  const stack: Frame[] = [];
  let sceneVersion = 0;
  let bestDepth = 0, bestPlaced = 0;  // Track deepest search progress
  let maxDepthHits = 0;               // Track how many times we've reached the current bestDepth
  let seenBelowBestDepthSinceLastHit = false;
  
  // Shuffle tracking
  let restartCount = 0;
  let nodesAtLastRestart = 0;
  let timeAtLastRestart = startTime;
  const suffixShuffleCount = new Map<number, number>();  // depth -> count
  
  // Solution-level de-duplication for this run
  const seenSolutions = new Set<string>();
  
  // Avoid re-running tail on the exact same open/inventory state in this run
  const tailTried = new Set<bigint>();
  let maxDepthForTailClear = 0;  // Only clear tailTried when exceeding this depth
  
  // Track if tail solver was used in this run (for telemetry)
  let tailUsed = false;

  // Pass 3: Transposition Table
  const tt = cfg.tt.enable ? new TranspositionTable(cfg.tt.bytes ?? 64 * 1024 * 1024) : null;
  let ttHits = 0, ttStores = 0, ttPrunes = 0;
  if (tt) {
    console.log(`🗂️  Engine2: TT enabled (${((cfg.tt.bytes ?? 64 * 1024 * 1024) / (1024 * 1024)).toFixed(0)} MB, 2-way)`);
  }

  // Pass 4: Incremental Zobrist hashing for TT
  // openHash = XOR of zCell[idx] for all OPEN cells (initially all cells are open)
  let openHash = 0n;
  for (let idx = 0; idx < pre.N; idx++) {
    if (bb.zCell && bb.zCell[idx] !== undefined) {
      openHash ^= bb.zCell[idx];
    }
  }

  // invHash = XOR of zInv[pid][count] for current inventory
  let invHash = 0n;
  for (const pid in remaining) {
    const arr = bb.zInv.get(pid);
    if (arr) {
      const cnt = remaining[pid] ?? 0;
      invHash ^= arr[Math.min(cnt, arr.length - 1)];
    }
  }

  function stateHash(): bigint { return openHash ^ invHash; }

  // Incremental hash update helpers
  function toggleOpenHashByMask(mask: Blocks) {
    if (bb.zCell) {
      forEachSetBit(mask, (idx) => { 
        if (bb.zCell[idx] !== undefined) {
          openHash ^= bb.zCell[idx]; 
        }
      });
    }
  }

  function applyInvDelta(pid: string, from: number, to: number) {
    const arr = bb.zInv.get(pid);
    if (arr) {
      invHash ^= arr[Math.min(from, arr.length - 1)];
      invHash ^= arr[Math.min(to, arr.length - 1)];
    }
  }
  
  // ---- Solution canonicalization ----
  // Build an order-independent signature from absolute container indices per piece.
  function computeSolutionKey(placements: Placement[]): string {
    // Precompute pieceId -> (oriId -> cells)
    const orisByPid = new Map<string, Map<number, IJK[]>>();
    for (const [pid, oris] of pre.pieces.entries()) {
      const m = new Map<number, IJK[]>();
      for (const o of oris) m.set(o.id, o.cells);
      orisByPid.set(pid, m);
    }

    const pieceSigs: string[] = [];
    for (const p of placements) {
      const m = orisByPid.get(p.pieceId);
      if (!m) throw new Error(`Unknown pieceId in solution: ${p.pieceId}`);
      const base = m.get(p.ori);
      if (!base) throw new Error(`Unknown orientation for ${p.pieceId}: ${p.ori}`);

      // Translate oriented cells to absolute IJK
      const abs = base!.map(c => [c[0] + p.t[0], c[1] + p.t[1], c[2] + p.t[2]] as IJK);
      // Convert absolute IJK to container indices
      const idxs: number[] = [];
      for (const c of abs) {
        const idx = pre.bitIndex.get(`${c[0]},${c[1]},${c[2]}`);
        if (idx === undefined) throw new Error(`Solution cell outside container for ${p.pieceId}`);
        idxs.push(idx);
      }
      idxs.sort((a,b)=>a-b);
      pieceSigs.push(`${p.pieceId}:${idxs.join(",")}`);
    }
    pieceSigs.sort();
    return pieceSigs.join("|");
  }

  // Control
  let paused = false, canceled = false;
  let pendingAfterSolution = false; // perform post-solution backtrack on resume
  let lastStatusAt = startTime;
  let scheduled = false; // latch to prevent multiple timer races
  const view = cfg.view ?? {
    worldFromIJK: [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],
    sphereRadiusWorld: 1.0
  };

  // Total pieces target for this run (N)
  const cellsTarget = Math.floor(pre.N / 4);
  const inventoryTarget = Object.values(remaining).reduce((a,b)=> a + (b ?? 0), 0);
  const totalPiecesTarget = Math.min(cellsTarget, inventoryTarget);

  // Pruning statistics tracking
  let pruneStats = {
    inventory: 0,
    overlap: 0,
    neighborTouch: 0,
    colorResidue: 0,
    multipleOf4: 0,
    connectivity: 0,
    ttPrune: 0,
    total: 0
  };
  let lastPruneLogAt = performance.now();

  // Snapshot restore (Pass 2: not yet implemented for bitboards)
  // TODO: restore occBlocks from snapshot
  if (resumeSnapshot) {
    console.warn('⚠️ Engine2 (bitboards): Snapshot restore not yet implemented in Pass 2');
  }

  // Starting solver

  // Timer latch to prevent race conditions (mobile-critical)
  function kickLoop() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      loop();
    }, 0);
  }

  // Helper: Reset search state for restart strategies
  function resetSearchState(reason: "nodes" | "time") {
    console.log(
      `🔄 [RESTART] Triggering ${reason}-based restart #${restartCount + 1} at ${nodes} nodes`
    );

    // Reset occupancy and search stack
    occBlocks = zeroBlocks(bb.blockCount);
    stack.length = 0;
    sceneVersion++;

    // Depth-hit tracking should continue within the same run (do not reset bestDepth here).
    // But we have definitely been below best depth after a restart.
    seenBelowBestDepthSinceLastHit = true;

    // Restore inventory
    for (const pid of pieceOrderCur) {
      remaining[pid] = Math.max(0, Math.floor(cfg.pieces?.inventory?.[pid] ?? 1));
    }

    // Reshuffle pieces
    shuffleArray(pieceOrderCur);
    restartCount++;
    
    // CRITICAL: Resort candidates after shuffle to make restart actually explore new regions
    const pieceOrderMap = new Map<string, number>();
    pieceOrderCur.forEach((pid: string, idx: number) => pieceOrderMap.set(pid, idx));
    
    for (let t = 0; t < pre.N; t++) {
      bb.candsByTarget[t].sort((a, b) => {
        const orderA = pieceOrderMap.get(a.pid) ?? 999;
        const orderB = pieceOrderMap.get(b.pid) ?? 999;
        return orderA - orderB;
      });
    }
    console.log('🔄 Candidates resorted by new piece order');

    // Rebuild openHash and invHash
    openHash = 0n;
    for (let idx = 0; idx < pre.N; idx++) {
      if (bb.zCell && bb.zCell[idx] !== undefined) {
        openHash ^= bb.zCell[idx];
      }
    }

    invHash = 0n;
    for (const pid in remaining) {
      const arr = bb.zInv.get(pid);
      if (arr) {
        const cnt = remaining[pid] ?? 0;
        invHash ^= arr[Math.min(cnt, arr.length - 1)];
      }
    }

    // Removed duplicate shuffle and restartCount++ (was here, already done above)
    nodesAtLastRestart = nodes;
    timeAtLastRestart = performance.now();
    emitStatus("search");
  }

  // Cooperative loop
  const loop = () => {
    if (canceled) return;
    
    if (paused) {
      // Keep heartbeat alive so resume always works on mobile
      kickLoop();
      return;
    }
    
    try {
      for (let step = 0; step < 200; step++) {
      if (cfg.timeoutMs && performance.now() - startTime >= cfg.timeoutMs) {
        emitDone("timeout");
        return;
      }

      // Periodic restart strategy (node-based)
      if (cfg.shuffleStrategy === "periodicRestart") {
        if (nodes - nodesAtLastRestart >= cfg.restartInterval && restartCount < cfg.maxRestarts) {
          resetSearchState("nodes");
          continue;
        }
      }

      // Periodic restart strategy (time-based)
      if (cfg.shuffleStrategy === "periodicRestartTime") {
        const elapsedSinceRestart = (performance.now() - timeAtLastRestart) / 1000;
        if (elapsedSinceRestart >= cfg.restartIntervalSeconds && restartCount < cfg.maxRestarts) {
          resetSearchState("time");
          continue;
        }
      }

      if (stack.length === 0) {
        if (!pushNewFrame()) {
          console.log(`❌ [NO MOVES] Cannot push initial frame - no valid moves available`);
          console.log(`   └─ This means the first piece cannot be placed anywhere (all positions pruned or invalid)`);
          emitDone("complete");
          return;
        }
      }

      // Tail cutoff (DLX exact cover endgame)
      if (cfg.tailSwitch.enable) {
        // compute OPEN bitboard: open = ~(occ) & occAll
        const openNow = andNotBlocks(bb.occAllMask, occBlocks);
        const openCells = popcountBlocks(openNow);
        const dlxThreshold = cfg.tailSwitch.dlxThreshold ?? 100;
        if (openCells > 0 && openCells <= dlxThreshold) {
          // Skip tail if we've already tried this state in this run
          const hNow = stateHash();
          if (tailTried.has(hNow)) {
            // backtrack as if no candidates
            const f = stack[stack.length - 1];
            undoAtFrame(f);
            stack.pop();
            if (stack.length === 0) { emitDone("complete"); return; }
            const parent = stack[stack.length - 1];
            undoAtFrame(parent);
            advanceCursor(parent);
            const now = performance.now();
            if (now - lastStatusAt >= cfg.statusIntervalMs) { emitStatus("search"); lastStatusAt = now; }
            continue;
          }
          
          // If TT says UNSOLVABLE, skip entirely
          if (tt && tt.lookup(hNow) === 1) {
            // Backtrack immediately out of this state
            const f = stack[stack.length - 1];
            undoAtFrame(f);
            stack.pop();
            if (stack.length === 0) { emitDone("complete"); return; }
            const parent = stack[stack.length - 1];
            undoAtFrame(parent);
            advanceCursor(parent);
            // light heartbeat
            const now = performance.now();
            if (now - lastStatusAt >= cfg.statusIntervalMs) { emitStatus("search"); lastStatusAt = now; }
            continue;
          }
          
          // Run DLX tail solver
          const dlxTimeoutMs = cfg.tailSwitch.dlxTimeoutMs ?? 30000;
          
          // Mark we attempted tail here (avoid repeated attempts on identical state)
          tailTried.add(hNow);
          
          // Mark that tail solver is being used
          tailUsed = true;
          
          let foundAny = false;
          const newlyAccepted: Placement[][] = [];
          
          // console.log(`🎯 DLX Tail solver triggered: ${openCells} open cells ≤ ${dlxThreshold}`);
          
          // Call DLX exact cover - only need ONE solution
          const dlxResult = dlxExactCover({
            open: openNow,
            remaining,
            bb: bb as any, // Type cast for IJK compatibility between engine2 and dlx
            timeoutMs: dlxTimeoutMs,
            limit: 1, // Only need one solution for tail
            wantWitness: true,
          });
          
          if (dlxResult.feasible && dlxResult.witness && dlxResult.witness.length > 0) {
            foundAny = true;
            
            // Build full solution = prefix + DLX witness
            const prefix: Placement[] = stack
              .filter(fr => fr.placed)
              .map(fr => ({ pieceId: fr.placed!.pid, ori: fr.placed!.ori, t: fr.placed!.t }));
            const suffix: Placement[] = dlxResult.witness.map(w => ({
              pieceId: w.pid,
              ori: w.ori,
              t: w.t as unknown as IJK // Type cast IJK compatibility
            }));
            const full = [...prefix, ...suffix];
            
            const sig = computeSolutionKey(full);
            const isNew = !seenSolutions.has(sig);
            if (isNew) {
              seenSolutions.add(sig);
              newlyAccepted.push(full);
              solutions++;
              console.log(`✅ Solution #${solutions} (DLX):`, full.map(p => p.pieceId).join(','));
              
              if (tt) { tt.store(stateHash(), 2); ttStores++; }
              emitSolutionFrame(full);
              
              // Check if we should stop
              if (cfg.maxSolutions > 0 && solutions >= cfg.maxSolutions) {
                foundAny = true; // ensure we continue to success path
              }
              // if pausing on solution, pause immediately
              if (cfg.pauseOnSolution) {
                pendingAfterSolution = true;
                paused = true;
                emitStatus("search");
              }
            }
          }
          
          if (foundAny) {
            if (cfg.maxSolutions > 0 && solutions >= cfg.maxSolutions) { emitDone("limit"); return; }
            if (paused) return; // already paused on first new solution

            // Not paused: do the one-step backtrack (legacy behavior)
            if (stack.length) {
              const f = stack[stack.length - 1];
              if (f.placed) undoAtFrame(f);
              advanceCursor(f);
              while (stack.length > 0 && !hasNextCandidate(stack[stack.length - 1])) {
                const popped = stack.pop()!;
                if (popped.placed) undoAtFrame(popped);
              }
              if (stack.length === 0) { emitDone("complete"); return; }
              emitStatus("search");
            }
            continue;
          } else {
            // console.log(`❌ Tail solver FAILED: no solution from this state (backtracking)`);
            // No completion from this state → optionally mark current state UNSOLVABLE in TT
            if (tt) { tt.store(stateHash(), 1); ttStores++; }
            // Force a backtrack by making current frame "no candidates"
            const f = stack[stack.length - 1];
            undoAtFrame(f);
            stack.pop();
            if (stack.length === 0) { emitDone("complete"); return; }
            const parent = stack[stack.length-1];
            undoAtFrame(parent);
            advanceCursor(parent);
            
            // Ensure status update after tail backtrack
            const now = performance.now();
            if (now - lastStatusAt >= cfg.statusIntervalMs) {
              emitStatus("search");
              lastStatusAt = now;
            }
            
            continue;
          }
        }
      }

      const f = stack[stack.length - 1];
      const cand = nextCandidateAtFrame(f);
      if (cand) {
        placeAtFrame(f, cand);
        nodes++;
        
        // Track best progress
        const currentDepth = stack.length;
        const currentPlaced = stack.filter(fr => fr.placed).length;
        if (currentDepth > bestDepth) {
          bestDepth = currentDepth;
          maxDepthHits = 1;
          seenBelowBestDepthSinceLastHit = false;
        } else if (bestDepth > 0 && currentDepth === bestDepth && seenBelowBestDepthSinceLastHit) {
          maxDepthHits++;
          seenBelowBestDepthSinceLastHit = false;
        }
        if (currentPlaced > bestPlaced) bestPlaced = currentPlaced;
        
        // Only clear tailTried when we exceed previous maximum depth (real progress)
        if (currentDepth > maxDepthForTailClear) {
          maxDepthForTailClear = currentDepth;
          tailTried.clear();
        }

        const isFull = blocksEqual(occBlocks, bb.occAllMask);
        if (isFull) {
          const placements: Placement[] = stack
            .filter(fr => fr.placed)
            .map(fr => ({ pieceId: fr.placed!.pid, ori: fr.placed!.ori, t: fr.placed!.t }));
          
          // === NEW: de-duplication gate ===
          const sig = computeSolutionKey(placements);
          const isNewSolution = !seenSolutions.has(sig);
          
          if (isNewSolution) {
            seenSolutions.add(sig);
            solutions++;
            console.log(`✅ Solution #${solutions}:`, placements.map(p => p.pieceId).join(','));
            
            // (Optional) mark terminal "seen" in TT
            if (tt) { tt.store(stateHash(), 2); ttStores++; }
            emitSolutionFrame(placements);
            
            if (cfg.maxSolutions > 0 && solutions >= cfg.maxSolutions) {
              emitDone("limit");
              return;
            }
            
            // Pause immediately after finding a new solution (before backtracking)
            if (cfg.pauseOnSolution && isNewSolution) {
              paused = true;
              emitStatus("search");
              return;
            }
          } else {
          }

          // Backtrack: undo and advance cursor to explore alternative branches
          undoAtFrame(f);
          advanceCursor(f);
          
          // Continue backtracking until we find a frame with alternatives
          while (stack.length > 0 && !hasNextCandidate(stack[stack.length - 1])) {
            const popped = stack.pop()!;
            if (popped.placed) {
              undoAtFrame(popped);
            }
          }
          
          // Check if backtracking exhausted the stack
          if (stack.length === 0) {
            emitDone("complete");
            return;
          }
          
          emitStatus("search");
          continue;
        }

        if (!pushNewFrame()) {
          undoAtFrame(f);
          advanceCursor(f);
        }
        continue;
      }

      // No candidates: backtrack one level
      // Pass 4: Store current state as UNSOLVABLE in TT (using incremental hash)
      if (tt) {
        tt.store(stateHash(), 1); // 1 = UNSOLVABLE
        ttStores++;
      }

      undoAtFrame(f);
      stack.pop();

      // If we are below the current bestDepth, mark it so the next time we reach bestDepth we count a hit.
      if (bestDepth > 0 && stack.length < bestDepth) {
        seenBelowBestDepthSinceLastHit = true;
      }
      if (stack.length === 0) {
        emitDone("complete");
        return;
      }

      // Adaptive suffix shuffle strategy
      if (cfg.shuffleStrategy === "adaptive") {
        const currentDepth = stack.length;
        if (currentDepth < cfg.shuffleTriggerDepth) {
          const shuffleKey = currentDepth;
          const shufflesAtDepth = suffixShuffleCount.get(shuffleKey) ?? 0;
          
          if (shufflesAtDepth < cfg.maxSuffixShuffles) {
            // Count placed pieces to determine suffix start
            const placedPieces = stack.filter(fr => fr.placed).map(fr => fr.placed!.pid);
            const suffixStart = placedPieces.length;
            
            if (suffixStart < pieceOrderCur.length - 1) {
              console.log(`🧠 [ADAPTIVE] Shuffling suffix at depth ${currentDepth} (shuffle #${shufflesAtDepth + 1})`);
              shuffleArray(pieceOrderCur, suffixStart);
              console.log(`   └─ Kept first ${suffixStart} pieces, shuffled remaining ${pieceOrderCur.length - suffixStart}`);
              
              suffixShuffleCount.set(shuffleKey, shufflesAtDepth + 1);
              emitStatus("search");
            }
          }
        }
      }

      const parent = stack[stack.length - 1];
      undoAtFrame(parent);            // ensure previous choice is freed
      advanceCursor(parent);
    }

      // Heartbeat
      const now = performance.now();
      if (now - lastStatusAt >= cfg.statusIntervalMs) {
        emitStatus("search");
        lastStatusAt = now;
      }
    } catch (e) {
      throw e;
    }

    kickLoop();  // Yield to event loop with latch protection
  };

  // ---- Handle API ----
  function pause() {
    paused = true;
    emitStatus("search");
  }
  function resume() {
    if (canceled) return;
    // Resumed
    paused = false;
    
    // If we paused on a solution before backtracking, do that now once.
    if (pendingAfterSolution) {
      pendingAfterSolution = false;
      if (stack.length) {
        const f = stack[stack.length - 1];
        if (f.placed) undoAtFrame(f);
        advanceCursor(f);
        while (stack.length > 0 && !hasNextCandidate(stack[stack.length - 1])) {
          const popped = stack.pop()!;
          if (popped.placed) undoAtFrame(popped);
        }
      }
    }
    
    emitStatus("search");
    kickLoop();
  }
  function cancel() {
    canceled = true;
    events?.onDone?.({ solutions, nodes, elapsedMs: performance.now() - startTime, reason: "canceled" });
  }
  function snapshot(): Engine2Snapshot {
    const frames = stack.map(f => ({
      targetIdx: f.targetIdx,
      iPiece: f.iPiece, iOri: f.iOri, iAnchor: f.iAnchor,
      placed: f.placed
        ? { pieceId: f.placed.pid, ori: f.placed.ori, t: f.placed.t, maskHex: blocksToHex(f.placed.mask) }
        : undefined
    }));
    // Snapshot (Pass 2: serialize bitboards to hex)
    let occHex = "";
    for (let i = 0; i < occBlocks.length; i++) {
      if (i > 0) occHex += "|";
      occHex += occBlocks[i].toString(16);
    }
    return {
      schema: 2,
      N: pre.N,
      occHex,
      pieceOrder: [...pieceOrderCur],
      remaining: { ...remaining },
      frames,
      nodes,
      solutions,
      elapsedMs: performance.now() - startTime,
      settings: cfg,
      containerId: pre.id,
    };
  }

  // Start the solver loop automatically
  emitStatus("search");
  kickLoop();

  return { pause, resume, cancel, snapshot };

  // ---- Helpers ----

  // Pass 3: Color residue check (FCC parity)
  // FCC parity necessary conditions for 4-cell pieces:
  // - total open cells must be %4 === 0
  // - each color class must have even cardinality (c0%2==0, c1%2==0)
  function colorResidueOK(open: Blocks): boolean {
    const openCount = popcountBlocks(open);
    if ((openCount & 3) !== 0) return false; // not divisible by 4

    const c0 = popcountBlocks(andBlocks(open, bb.color0Blocks));
    const c1 = openCount - c0; // faster than recomputing andBlocks open∧color1

    // Both parities must be even
    if ((c0 & 1) !== 0 || (c1 & 1) !== 0) return false;

    return true;
  }

  // Pass 4: Neighbor-touch check (must touch current cluster)
  function touchesCluster(cm: CandMask, occ: Blocks): boolean {
    // For each cell index in this candidate, check if any neighbor is already occupied
    for (const idx of cm.cellsIdx) {
      const nb = bb.neighborBits[idx];  // Neighbor bitboard for this cell
      for (let bi = 0; bi < nb.length; bi++) {
        if ((nb[bi] & occ[bi]) !== 0n) return true;  // Neighbor is occupied
      }
    }
    return false;
  }

  function pushNewFrame(): boolean {
    const targetIdx = (cfg.moveOrdering === "mostConstrainedCell")
      ? selectMostConstrained(occBlocks, remaining)
      : firstOpenBitBlocks(occBlocks, pre.N);
    if (targetIdx < 0) return false;
    stack.push({ targetIdx, iPiece: 0, iOri: 0, iAnchor: 0, placed: undefined });
    return true;
  }

  function nextCandidateAtFrame(f: Frame): Candidate | null {
    const cands = bb.candsByTarget[f.targetIdx];
    const depth = stack.length;

    // Tie-randomization: on first entry at this frame, jump forward inside suffix
    if (cfg.randomizeTies && f.iAnchor === 0 && cands.length > 1) {
      // reuse f.iAnchor as 'iCand' (overwrite cursor meaning for speed)
      f.iAnchor = Math.min(cands.length - 1, f.iAnchor + Math.floor(rng() * (cands.length - f.iAnchor)));
    }

    let candsChecked = 0;
    let localRejects = { inventory: 0, overlap: 0, neighborTouch: 0, colorResidue: 0, multipleOf4: 0, connectivity: 0, ttPrune: 0 };
    for (; f.iAnchor < cands.length; f.iAnchor++) {
      candsChecked++;
      const cm = cands[f.iAnchor];
      if ((remaining[cm.pid] ?? 0) <= 0) { pruneStats.inventory++; localRejects.inventory++; continue; }
      if (!isFits(occBlocks, cm.mask)) { pruneStats.overlap++; localRejects.overlap++; continue; }

      // Pass 4: Neighbor-touch pruning (skip for very first placement)
      const placedCount = popcountBlocks(occBlocks);
      if (cfg.pruning.neighborTouch && placedCount > 0) {
        if (!touchesCluster(cm, occBlocks)) { 
          pruned++;
          pruneStats.neighborTouch++;
          localRejects.neighborTouch++;
          continue; 
        }
      }

      // pruning (with detailed tracking)
      if (cfg.pruning.colorResidue) {
        const openPrime = andNotBlocks(bb.occAllMask, orBlocks(occBlocks, cm.mask));
        if (!colorResidueOK(openPrime)) { 
          pruned++; 
          pruneStats.colorResidue++;
          localRejects.colorResidue++;
          continue; 
        }
      }
      if (cfg.pruning.multipleOf4) {
        const openAfter = pre.N - popcountBlocks(orBlocks(occBlocks, cm.mask));
        if ((openAfter % 4) !== 0) { 
          pruned++; 
          pruneStats.multipleOf4++;
          localRejects.multipleOf4++;
          continue; 
        }
      }
      if (cfg.pruning.connectivity) {
        if (!looksConnectedBlocks(occBlocks, cm.mask)) { 
          pruned++; 
          pruneStats.connectivity++;
          localRejects.connectivity++;
          continue; 
        }
      }

      // Pass 4: TT lookup with incremental hashing (O(1) child state hash)
      if (tt) {
        // Compute child state hash by simulating deltas without copying
        let h = stateHash();
        
        // Toggle OPEN bits for child (simulate placement)
        for (const idx of cm.cellsIdx) h ^= bb.zCell[idx];
        
        // Inventory delta for child
        const arr = bb.zInv.get(cm.pid)!;
        const from = remaining[cm.pid] ?? 0;
        const to = from - 1;
        h ^= arr[Math.min(from, arr.length - 1)];
        h ^= arr[Math.min(to, arr.length - 1)];
        
        const flag = tt.lookup(h);
        if (flag === 1) { // UNSOLVABLE
          ttHits++;
          ttPrunes++;
          pruned++;
          pruneStats.ttPrune++;
          localRejects.ttPrune++;
          continue;
        }
      }

      // Log pruning stats periodically (every 10 seconds)
      const now = performance.now();
      if (now - lastPruneLogAt >= 10000) {
        const totalPruned = Object.values(pruneStats).reduce((a,b) => a+b, 0);
        console.log(`🔍 [PRUNING STATS] Depth ${depth}, Total pruned: ${totalPruned.toLocaleString()}`);
        console.log(`   ├─ Inventory: ${pruneStats.inventory.toLocaleString()}`);
        console.log(`   ├─ Overlap: ${pruneStats.overlap.toLocaleString()}`);
        console.log(`   ├─ NeighborTouch: ${pruneStats.neighborTouch.toLocaleString()}`);
        console.log(`   ├─ ColorResidue: ${pruneStats.colorResidue.toLocaleString()}`);
        console.log(`   ├─ MultipleOf4: ${pruneStats.multipleOf4.toLocaleString()}`);
        console.log(`   ├─ Connectivity: ${pruneStats.connectivity.toLocaleString()}`);
        console.log(`   └─ TT Prune: ${pruneStats.ttPrune.toLocaleString()}`);
        lastPruneLogAt = now;
      }

      return {
      pid: cm.pid,
      ori: cm.ori,
      t: cm.t,
      mask: cm.mask,
      cellsIdx: cm.cellsIdx,
    };
    }
    
    // No valid candidate found - log if we had candidates to check
    if (candsChecked > 0 && depth <= 5) {
      console.log(`❌ [NO MOVES] Depth ${depth}, checked ${candsChecked} candidates, all pruned`);
      console.log(`   ├─ Inventory rejects: ${localRejects.inventory}`);
      console.log(`   ├─ Overlap rejects: ${localRejects.overlap}`);
      console.log(`   ├─ NeighborTouch rejects: ${localRejects.neighborTouch}`);
      console.log(`   ├─ ColorResidue rejects: ${localRejects.colorResidue}`);
      console.log(`   ├─ MultipleOf4 rejects: ${localRejects.multipleOf4}`);
      console.log(`   ├─ Connectivity rejects: ${localRejects.connectivity}`);
      console.log(`   └─ TT rejects: ${localRejects.ttPrune}`);
    }
    return null;
  }

  function placeAtFrame(f: Frame, c: Candidate) {
    orEq(occBlocks, c.mask);

    // hash updates
    toggleOpenHashByMask(c.mask);
    applyInvDelta(c.pid, remaining[c.pid], remaining[c.pid] - 1);

    remaining[c.pid]--;

    f.placed = {
      pid: c.pid,
      ori: c.ori,
      t: c.t,
      mask: c.mask,
      cellsIdx: c.cellsIdx,
    };
  }

  function undoAtFrame(f: Frame) {
    if (!f.placed) return;

    const { pid, mask } = f.placed;

    xorEq(occBlocks, mask);
    toggleOpenHashByMask(mask);
    applyInvDelta(pid, remaining[pid], remaining[pid] + 1);

    remaining[pid]++;
    f.placed = undefined;
  }

  function firstOpenBitBlocks(occ: Blocks, N: number): number {
    for (let i = 0; i < N; i++) if (testBitInverse(occ, i)) return i;
    return -1;
  }

  function selectMostConstrained(
    occ: Blocks,
    remaining: Record<string, number>
  ): number {
    let bestIdx = -1, bestCount = Number.POSITIVE_INFINITY;
    const N = pre.N;

    for (let idx = 0; idx < N; idx++) {
      // If target cell already filled, skip
      if (!testBitInverse(occ, idx)) continue; // if filled, skip

      let count = 0;
      const cands = bb.candsByTarget[idx];
      for (const cm of cands) {
        if ((remaining[cm.pid] ?? 0) <= 0) continue;
        if (!isFits(occ, cm.mask)) continue;  // Use parameter 'occ', not global 'occBlocks'
        count++;
        if (count >= bestCount) break;
      }

      if (count < bestCount) {
        bestCount = count;
        bestIdx = idx;
        if (bestCount === 0) return idx; // perfect fail-fast
      }
    }
    return bestIdx;
  }

  // Bitboard connectivity
  function looksConnectedBlocks(occ: Blocks, addMask: Blocks): boolean {
    // open = complement(occ|addMask) ∧ occAllMask
    const filled = orBlocks(occ, addMask);
    const open = newBlocks(bb.blockCount);
    for (let i = 0; i < bb.blockCount; i++) open[i] = (~filled[i]) & bb.occAllMask[i];

    // Find seed bit in 'open'
    let seed = -1;
    outer: for (let bi = 0; bi < bb.blockCount; bi++) {
      let word = open[bi];
      if (word === 0n) continue;
      // find first 1 bit
      let offset = 0n;
      while ((word & 1n) === 0n) { word >>= 1n; offset++; }
      seed = bi * 64 + Number(offset);
      break outer;
    }
    if (seed < 0) return true; // no open cells

    // BFS over open cells using neighborBits per index
    const visited = zeroBlocks(bb.blockCount);
    const queue: number[] = [seed];
    setBit(visited, seed);

    while (queue.length) {
      const u = queue.pop()!;
      // frontier_u = neighbors(u) ∧ open
      const nb = bb.neighborBits[u];
      const frontier = andBlocks(nb, open);
      // iterate set bits in 'frontier'
      forEachSetBit(frontier, (vIdx) => {
        if (!testBit(visited, vIdx)) {
          setBit(visited, vIdx);
          queue.push(vIdx);
        }
      });
    }

    // If visited == open, all open cells connected
    return blocksEqual(visited, open);
  }

  function advanceCursor(f: Frame) {
    // In bitboard mode, f.iAnchor is candidate index at this target
    f.iAnchor++;
  }
  
  function hasNextCandidate(f: Frame): boolean {
    const cands = bb.candsByTarget[f.targetIdx];
    // Check if there are any valid candidates remaining at this frame
    for (let i = f.iAnchor; i < cands.length; i++) {
      const cm = cands[i];
      if ((remaining[cm.pid] ?? 0) > 0) {
        return true; // Found at least one candidate with available inventory
      }
    }
    return false;
  }

  function emitSolutionFrame(placements: Placement[]) {
    const status: StatusV2 & any = {
      engine: "dfs",
      phase: "search",
      nodes,
      depth: stack.length,
      elapsedMs: performance.now() - startTime,
      pruned,
      placed: placements.length,
      open_cells: 0,
      stack: placements,
      containerId: pre.id,
      worldFromIJK: view.worldFromIJK,
      sphereRadiusWorld: view.sphereRadiusWorld,
      clear: true,        // solution frames clear & rebuild
      scene_version: ++sceneVersion,
    };
    if (cfg.pieces?.inventory) status.inventory_remaining = { ...remaining };
    events?.onStatus?.(status);
    
    // Call onSolution callback for app to handle animation/saving
    events?.onSolution?.(placements);
    
    // Save solution to file if enabled
    if (cfg.saveSolutions && events?.onSaveSolutionFile) {
      events.onSaveSolutionFile({
        index: solutions,
        placements,
        containerId: pre.id,
        nodes,
        elapsedMs: performance.now() - startTime,
      });
    }
  }
  

  function emitStatus(phase: "search" | "done") {
    const placements: Placement[] = stack
      .filter(fr => fr.placed)
      .map(fr => ({ pieceId: fr.placed!.pid, ori: fr.placed!.ori, t: fr.placed!.t }));

    const elapsedMs = performance.now() - startTime;
    const nodesPerSec = elapsedMs > 0 ? Math.round((nodes / elapsedMs) * 1000) : 0;
 
    const status: StatusV2 & any = {
      engine: "dfs",
      phase,
      nodes,
      depth: stack.length,
      elapsedMs,
      pruned,
      placed: placements.length,
      open_cells: pre.N - popcountBlocks(occBlocks),
      stack: placements,
      containerId: pre.id,
      worldFromIJK: view.worldFromIJK,
      sphereRadiusWorld: view.sphereRadiusWorld,
      clear: false,       // status ticks should not wipe the scene
      scene_version: sceneVersion,
      // Pass 3: Best progress tracking
      bestDepth,
      maxDepthHits,
      bestPlaced,
      totalPiecesTarget,  // Y in "Best N/Y" display
      nodesPerSec,
      // Tail solver tracking
      tailTriggered: tailUsed,
      // Shuffle/restart tracking
      restartCount,
      shuffleStrategy: cfg.shuffleStrategy,
      restartInterval: cfg.restartInterval,
      restartIntervalSeconds: cfg.restartIntervalSeconds,
    };
    if (cfg.pieces?.inventory) status.inventory_remaining = { ...remaining };
    
    // Periodic status logging (every 5 seconds during search)
    if (phase === "search" && elapsedMs > 0 && Math.floor(elapsedMs / 5000) > Math.floor((lastStatusAt - startTime) / 5000)) {
      // Status update
    }
    
    events?.onStatus?.(status);
    lastStatusAt = performance.now();
  }

  function emitDone(reason: "complete" | "timeout" | "limit" | "canceled") {
    const elapsedMs = performance.now() - startTime;
    
    console.log(`✅ DONE: ${nodes} nodes | ${solutions} solutions | ${(elapsedMs / 1000).toFixed(1)}s`);
    
    emitStatus("done");
    if (tt) {
    }
    events?.onDone?.({ solutions, nodes, elapsedMs: performance.now() - startTime, reason });
  }
}

// ---------- Utility ----------
function key(c: IJK): string {
  return `${c[0]},${c[1]},${c[2]}`;
}

function xorshift32(seed: number) {
  let x = (seed | 0) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // Use 0x100000000 (2^32) to ensure [0,1) range, not [0,1]
    // Prevents out-of-bounds array access in Fisher-Yates shuffle
    return (x >>> 0) / 0x100000000;
  };
}

function normalize(s: Engine2Settings): Required<Engine2Settings> {
  return {
    maxSolutions: s.maxSolutions ?? 0,
    timeoutMs: s.timeoutMs ?? 0,
    statusIntervalMs: s.statusIntervalMs ?? 250,
    pauseOnSolution: s.pauseOnSolution ?? true,
    saveSolutions: s.saveSolutions ?? false,
    savePath: s.savePath ?? "",
    moveOrdering: s.moveOrdering ?? "mostConstrainedCell",
    pruning: {
      connectivity: s.pruning?.connectivity ?? true,
      multipleOf4: s.pruning?.multipleOf4 ?? true,
      colorResidue: s.pruning?.colorResidue ?? true,
      neighborTouch: s.pruning?.neighborTouch ?? true,
    },
    pieces: s.pieces ?? {},
    view: s.view ?? {
      worldFromIJK: [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],
      sphereRadiusWorld: 1.0
    },
    seed: s.seed ?? 12345,
    randomizeTies: s.randomizeTies ?? true,
    shuffleStrategy: s.shuffleStrategy ?? "none",
    restartInterval: s.restartInterval ?? 50000,
    restartIntervalSeconds: s.restartIntervalSeconds ?? 300,
    maxRestarts: s.maxRestarts ?? 10,
    shuffleTriggerDepth: s.shuffleTriggerDepth ?? 8,
    maxSuffixShuffles: s.maxSuffixShuffles ?? 5,
    tt: {
      enable: s.tt?.enable ?? true,
      bytes: s.tt?.bytes ?? 64 * 1024 * 1024, // 64 MB
      policy: s.tt?.policy ?? "2way",
    },
    tailSwitch: {
      enable: s.tailSwitch?.enable ?? true,
      dlxThreshold: s.tailSwitch?.dlxThreshold ?? 100,
      dlxTimeoutMs: s.tailSwitch?.dlxTimeoutMs ?? 30000,
    },
    visualRevealDelayMs: s.visualRevealDelayMs ?? 150,
  };
}
