// src/engines/engine2/index.ts
// Engine #2 - DFS with stall-based shuffle + deterministic tie randomization
// Pass 0 & Pass 1: Drop-in replacement for dfs2 with stochastic plateau escape

import type { IJK, Placement, StatusV2 } from "../types";

// ---------- Public types ----------
export type Oriented = { id: number; cells: IJK[] };
export type PieceDB = Map<string, Oriented[]>;

export type Engine2Settings = {
  maxSolutions?: number;              // 0 = unlimited (default)
  timeoutMs?: number;                 // 0 = no timeout (default)
  statusIntervalMs?: number;          // default 250
  pauseOnSolution?: boolean;          // default true

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

  // NEW: stochastic tie-breaking & stall-response
  seed?: number;                      // RNG seed for deterministic behavior
  randomizeTies?: boolean;            // default false (deterministic like engine1)
  stall?: {
    timeoutMs?: number;               // default 3000 (3 seconds without progress)
    action?: "reshuffle" | "restartDepthK" | "perturb"; // default "reshuffle"
    depthK?: number;                  // default 2 (shallow levels to modify)
    maxShuffles?: number;             // default 8 (max attempts before giving up)
    minNodesPerSec?: number;          // default 50 (entropy threshold for restart)
  };

  // Pass 3: Transposition Table
  tt?: {
    enable?: boolean;                 // default true
    bytes?: number;                   // default 64MB (67108864)
    policy?: "2way";                  // 2-way set associative
  };

  // Tail solver (endgame turbo)
  tailSwitch?: {
    enable?: boolean;                 // default true
    tailSize?: number;                // default 20 (trigger when <= N open cells)
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

// ---------- Internal frame ----------
type Frame = {
  targetIdx: number;   // chosen open cell at this depth
  iPiece: number;      // cursor in pieceOrder
  iOri: number;        // cursor in orientations list of current piece
  iAnchor: number;     // cursor in o.cells for translation anchoring
  placed?: { pid: string; ori: number; t: IJK; mask: bigint };
};

type FrameSnap = {
  targetIdx: number;
  iPiece: number;
  iOri: number;
  iAnchor: number;
  placed?: { pieceId: string; ori: number; t: IJK; maskHex: string };
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
type Blocks = BigUint64Array;               // bitboard blocks (64 cells per block)

type CandMask = { pid: string; ori: number; t: IJK; mask: Blocks; cellsIdx: number[] };

type BitboardPrecomp = {
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

function buildBitboards(pre: ReturnType<typeof engine2Precompute>): BitboardPrecomp {
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
function blocksClone(src: Blocks): Blocks { return new BigUint64Array(src); }
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

// ---------- Solve ----------
export function engine2Solve(
  pre: ReturnType<typeof engine2Precompute>,
  settings: Engine2Settings,
  events?: Engine2Events,
  resumeSnapshot?: Engine2Snapshot
): Engine2RunHandle {
  const cfg = normalize(settings);
  const startTime = performance.now();

  // Seeded RNG for deterministic shuffles
  const rng = xorshift32(cfg.seed ?? 12345);
  function fyShuffle<T>(arr: T[], start = 0) {
    for (let i = arr.length - 1; i > start; i--) {
      const j = start + Math.floor(rng() * (i - start + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // Inventory + piece order (root)
  const pieceOrderBase = (cfg.pieces?.allow ?? [...pre.pieces.keys()]).sort();
  const pieceOrderCur = [...pieceOrderBase];              // we may shuffle suffixes here
  const remaining: Record<string, number> = {};
  for (const pid of pieceOrderCur) {
    remaining[pid] = Math.max(0, Math.floor(cfg.pieces?.inventory?.[pid] ?? 1));
  }

  console.log('📋 Engine2: Piece inventory:', remaining);
  console.log('📋 Engine2: Piece order:', pieceOrderCur);
  console.log('🎲 Engine2: Random ties:', cfg.randomizeTies, 'Seed:', cfg.seed);

  // Build bitboard precomp (Pass 2)
  const bb = buildBitboards(pre);
  console.log(`🔢 Engine2: Bitboards built: ${bb.blockCount} blocks, ${bb.candsByTarget.reduce((s, c) => s + c.length, 0)} precomputed placements`);
  console.log(`🔢 Engine2: Zobrist tables: zCell=${bb.zCell?.length ?? 0} entries, zInv=${bb.zInv?.size ?? 0} pieces`);

  // State (bitboards)
  let occBlocks: Blocks = zeroBlocks(bb.blockCount);
  let nodes = 0, pruned = 0, solutions = 0;
  const stack: Frame[] = [];
  let sceneVersion = 0;
  let bestDepth = 0, bestPlaced = 0;  // Track deepest search progress

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

  // Control
  let paused = false, canceled = false;
  let lastStatusAt = startTime;
  const view = cfg.view ?? {
    worldFromIJK: [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],
    sphereRadiusWorld: 1.0
  };

  // Stall bookkeeping (Pass 1: time-based)
  let lastProgressAt = performance.now();
  let nodesAtLastProgress = 0;
  let shuffleCount = 0;
  const maxShuffles = cfg.stall?.maxShuffles ?? 8;
  const stallTimeout = cfg.stall?.timeoutMs ?? 3000;

  // Pass 4: Entropy-based stall detection
  let lastEntropyAt = performance.now();
  let nodesAtEntropySample = 0;

  // Snapshot restore (Pass 2: not yet implemented for bitboards)
  // TODO: restore occBlocks from snapshot
  if (resumeSnapshot) {
    console.warn('⚠️ Engine2 (bitboards): Snapshot restore not yet implemented in Pass 2');
  }

  // Cooperative loop
  const loop = () => {
    if (canceled || paused) return;

    for (let step = 0; step < 200; step++) {
      if (cfg.timeoutMs && performance.now() - startTime >= cfg.timeoutMs) {
        emitDone("timeout");
        return;
      }

      if (stack.length === 0) {
        if (!pushNewFrame()) {
          emitDone("complete");
          return;
        }
      }

      // Tail cutoff (endgame turbo)
      if (cfg.tailSwitch.enable) {
        // compute OPEN bitboard: open = ~(occ) & occAll
        const openNow = andNotBlocks(bb.occAllMask, occBlocks);
        const openCells = popcountBlocks(openNow);
        const tailSize = cfg.tailSwitch.tailSize ?? 20;
        if (openCells > 0 && openCells <= tailSize) {
          // Run fast tail exact-cover DFS with current constraints
          const tail = tailSolveExactCover(openNow, remaining, bb, pieceOrderCur);
          if (tail.ok) {
            // Combine current frontier placements (from stack) + tail placements
            const prefix: Placement[] = stack
              .filter(fr => fr.placed)
              .map(fr => ({ pieceId: fr.placed!.pid, ori: fr.placed!.ori, t: fr.placed!.t }));

            const suffix: Placement[] = tail.placements.map(p => ({
              pieceId: p.pid, ori: p.ori, t: p.t
            }));
            const fullSolution = [...prefix, ...suffix];

            // Emit solution
            solutions++;
            emitSolutionFrame(fullSolution);
            events?.onSolution?.(fullSolution);

            if (cfg.maxSolutions > 0 && solutions >= cfg.maxSolutions) { emitDone("limit"); return; }

            // Advance cursor at current frame to continue exploring next branch
            if (stack.length) {
              const f = stack[stack.length - 1];
              advanceCursor(f);
            }

            if (cfg.pauseOnSolution) { paused = true; emitStatus("search"); return; }

            // Else continue loop naturally
            continue;
          } else {
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
            continue;
          }
        }
      }

      const f = stack[stack.length - 1];
      const cand = nextCandidateAtFrame(f);
      if (cand) {
        placeAtFrame(f, cand);
        nodes++;
        markProgress();
        
        // Track best progress
        const currentDepth = stack.length;
        const currentPlaced = stack.filter(fr => fr.placed).length;
        if (currentDepth > bestDepth) bestDepth = currentDepth;
        if (currentPlaced > bestPlaced) bestPlaced = currentPlaced;

        const isFull = blocksEqual(occBlocks, bb.occAllMask);
        if (isFull) {
          const placements: Placement[] = stack
            .filter(fr => fr.placed)
            .map(fr => ({ pieceId: fr.placed!.pid, ori: fr.placed!.ori, t: fr.placed!.t }));
          solutions++;
          emitSolutionFrame(placements);
          events?.onSolution?.(placements);

          if (cfg.maxSolutions > 0 && solutions >= cfg.maxSolutions) {
            emitDone("limit");
            return;
          }

          undoAtFrame(f);
          advanceCursor(f);
          if (cfg.pauseOnSolution) {
            paused = true;
            emitStatus("search");
            return;
          }
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
      if (stack.length === 0) {
        emitDone("complete");
        return;
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

    // Pass 4: Entropy-based stall detection + time-based fallback
    const dt = (now - lastEntropyAt) / 1000;
    if (dt >= 1.0) {
      const dn = nodes - nodesAtEntropySample;
      const nps = dn / dt;  // nodes per second
      nodesAtEntropySample = nodes;
      lastEntropyAt = now;

      const minNps = cfg.stall?.minNodesPerSec ?? 50;
      const entropyStalled = nps < minNps;  // entropy criterion

      if (cfg.randomizeTies && entropyStalled && shuffleCount < maxShuffles) {
        const action = cfg.stall?.action ?? "reshuffle";
        const depthK = Math.max(0, cfg.stall?.depthK ?? 2);
        console.log(`🔀 Engine2: Entropy stall (${nps.toFixed(0)} nodes/s < ${minNps})! Action=${action}, depthK=${depthK}, shuffleCount=${shuffleCount}`);
        if (action === "reshuffle") reshuffleAtShallow(depthK);
        else if (action === "restartDepthK") restartAtDepth(depthK);
        else perturbAtShallow(depthK);
        shuffleCount++;
        emitStatus("search");
      }
    }

    // Time-based stall fallback (original Pass 1 logic)
    if (cfg.randomizeTies && shuffleCount < maxShuffles) {
      const timeStalled = (now - lastProgressAt >= stallTimeout) && (nodes === nodesAtLastProgress);
      if (timeStalled) {
        const action = cfg.stall?.action ?? "reshuffle";
        const depthK = Math.max(0, cfg.stall?.depthK ?? 2);
        console.log(`🔀 Engine2: Time stall (${((now - lastProgressAt) / 1000).toFixed(1)}s)! Action=${action}, depthK=${depthK}, shuffleCount=${shuffleCount}`);
        if (action === "reshuffle") reshuffleAtShallow(depthK);
        else if (action === "restartDepthK") restartAtDepth(depthK);
        else perturbAtShallow(depthK);
        shuffleCount++;
        emitStatus("search");
      }
    }

    setTimeout(loop, 0);  // Yield to event loop, then continue immediately
  };

  // Start
  emitStatus("search");
  console.log('🚀 Engine2: Starting solver loop...');
  setTimeout(loop, 0);

  // ---- Handle API ----
  function pause() {
    console.log('⏸️ Engine2: User paused');
    paused = true;
    emitStatus("search");
  }
  function resume() {
    if (canceled) return;
    console.log('▶️ Engine2: Resuming from pause');
    paused = false;
    emitStatus("search");
    setTimeout(loop, 0);
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
        ? { pieceId: f.placed.pid, ori: f.placed.ori, t: f.placed.t, maskHex: f.placed.mask.toString(16) }
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

  return { pause, resume, cancel, snapshot };

  // ---- Helpers ----
  function markProgress() {
    lastProgressAt = performance.now();
    nodesAtLastProgress = nodes;
  }

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

  // ---- Tail solver: small exact-cover DFS on bitboards ----
  type TailResult = { ok: boolean; placements: { pid: string; ori: number; t: IJK; mask: Blocks }[] };

  // Mutating block ops for tail (faster than copying)
  function andNotEq(dst: Blocks, src: Blocks) { for (let i=0;i<dst.length;i++) dst[i] &= ~src[i]; }
  function orEq(dst: Blocks, src: Blocks)     { for (let i=0;i<dst.length;i++) dst[i] |=  src[i]; }
  function isZero(b: Blocks): boolean { for (let i=0;i<b.length;i++) if (b[i] !== 0n) return false; return true; }

  function isFitsOpen(openB: Blocks, mask: Blocks): boolean {
    // Fits if (mask & ~openB) == 0  <=>  all 1s of mask are inside open
    for (let i = 0; i < openB.length; i++) {
      if ((mask[i] & ~openB[i]) !== 0n) return false;
    }
    return true;
  }

  function tailSolveExactCover(
    open: Blocks,
    remaining: Record<string, number>,
    bb: BitboardPrecomp,
    pieceOrder: string[],
  ): TailResult {
    const placements: { pid: string; ori: number; t: IJK; mask: Blocks }[] = [];

    // Reusable working copies (avoid allocs)
    const openWork = new BigUint64Array(open);   // clone
    const remWork: Record<string, number> = { ...remaining };

    // Choose next target cell: MRV over open set (greedy)
    function pickTargetIdx(openB: Blocks): number {
      // MRV: cell with fewest fitting candidates (respecting inventory and fit)
      let bestIdx = -1, bestCount = Number.POSITIVE_INFINITY;
      // iterate set bits in openB
      forEachSetBit(openB, (idx) => {
        const cands = bb.candsByTarget[idx];
        let count = 0;
        for (const cm of cands) {
          if ((remWork[cm.pid] ?? 0) <= 0) continue;
          if (!isFitsOpen(openB, cm.mask)) continue;
          count++;
          if (count >= bestCount) break;
        }
        if (count < bestCount) { bestCount = count; bestIdx = idx; if (bestCount === 0) return; }
      });
      return bestIdx;
    }

    function dfsTail(): boolean {
      // Done if open is empty
      if (isZero(openWork)) return true;

      // MRV choose
      const targetIdx = pickTargetIdx(openWork);
      if (targetIdx < 0) return false;

      const cands = bb.candsByTarget[targetIdx];

      // Try candidates that fit (and respect remaining)
      for (const cm of cands) {
        const left = remWork[cm.pid] ?? 0;
        if (left <= 0) continue;
        if (!isFitsOpen(openWork, cm.mask)) continue;

        // Optional: parity check to speed tail even more
        if (cfg.pruning.colorResidue) {
          const openPrime = new BigUint64Array(openWork);
          andNotEq(openPrime, cm.mask);
          if (!colorResidueOK(openPrime)) continue;
        }

        // Place
        remWork[cm.pid]--;
        andNotEq(openWork, cm.mask);                  // openWork = openWork & ~mask
        placements.push({ pid: cm.pid, ori: cm.ori, t: cm.t, mask: cm.mask });

        if (dfsTail()) return true;

        // Undo
        placements.pop();
        orEq(openWork, cm.mask);                      // revert open bits
        remWork[cm.pid]++;
      }
      return false;
    }

    const ok = dfsTail();
    return { ok, placements };
  }

  function pushNewFrame(): boolean {
    const targetIdx = (cfg.moveOrdering === "mostConstrainedCell")
      ? selectMostConstrained(occBlocks, remaining)
      : firstOpenBitBlocks(occBlocks, pre.N);
    if (targetIdx < 0) return false;
    stack.push({ targetIdx, iPiece: 0, iOri: 0, iAnchor: 0, placed: undefined });
    return true;
  }

  function nextCandidateAtFrame(f: Frame): { pid: string; ori: number; t: IJK; mask: Blocks } | null {
    const cands = bb.candsByTarget[f.targetIdx];

    // Tie-randomization: on first entry at this frame, jump forward inside suffix
    if (cfg.randomizeTies && f.iAnchor === 0 && cands.length > 1) {
      // reuse f.iAnchor as 'iCand' (overwrite cursor meaning for speed)
      f.iAnchor = Math.min(cands.length - 1, f.iAnchor + Math.floor(rng() * (cands.length - f.iAnchor)));
    }

    for (; f.iAnchor < cands.length; f.iAnchor++) {
      const cm = cands[f.iAnchor];
      if ((remaining[cm.pid] ?? 0) <= 0) continue;               // inventory depleted
      if (!isFits(occBlocks, cm.mask)) continue;                  // overlap

      // Pass 4: Neighbor-touch pruning (skip for very first placement)
      const placedCount = popcountBlocks(occBlocks);
      if (cfg.pruning.neighborTouch && placedCount > 0) {
        if (!touchesCluster(cm, occBlocks)) { pruned++; continue; }
      }

      // pruning
      if (cfg.pruning.colorResidue) {
        const openPrime = andNotBlocks(bb.occAllMask, orBlocks(occBlocks, cm.mask));
        if (!colorResidueOK(openPrime)) { pruned++; continue; }
      }
      if (cfg.pruning.multipleOf4) {
        const openAfter = pre.N - popcountBlocks(orBlocks(occBlocks, cm.mask));
        if ((openAfter % 4) !== 0) { pruned++; continue; }
      }
      if (cfg.pruning.connectivity) {
        if (!looksConnectedBlocks(occBlocks, cm.mask)) { pruned++; continue; }
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
          continue;
        }
      }

      return { pid: cm.pid, ori: cm.ori, t: cm.t, mask: cm.mask };
    }
    return null;
  }

  function placeAtFrame(f: Frame, p: { pid: string; ori: number; t: IJK; mask: Blocks; cellsIdx?: number[] }) {
    orEq(occBlocks, p.mask);
    // Pass 4: Incremental hash updates
    toggleOpenHashByMask(p.mask);  // OPEN cells toggled off
    applyInvDelta(p.pid, remaining[p.pid], remaining[p.pid] - 1);
    remaining[p.pid]--;
    // Store t + a reference to the mask for undo
    f.placed = { pid: p.pid, ori: p.ori, t: p.t, mask: 0n as any };
    (f.placed as any).maskBlocks = p.mask;
    if (p.cellsIdx) (f.placed as any).cellsIdx = p.cellsIdx;
  }

  function undoAtFrame(f: Frame) {
    if (!f.placed) return;
    const mask = (f.placed as any).maskBlocks as Blocks;
    xorEq(occBlocks, mask);
    // Pass 4: Incremental hash updates (reverse)
    toggleOpenHashByMask(mask);  // OPEN cells toggled back on
    applyInvDelta(f.placed.pid, remaining[f.placed.pid], remaining[f.placed.pid] + 1);
    remaining[f.placed.pid]++;
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

  // Stall handlers (bitboard mode: shuffle candidate lists)
  function reshuffleAtShallow(depthK: number) {
    // Shuffle root order suffix (preserve tried prefix)
    fyShuffle(pieceOrderCur, 0);
    // Nudge shallow frames to skip ahead inside their remaining suffix
    const lim = Math.min(depthK, stack.length);
    for (let d = 0; d < lim; d++) {
      const f = stack[d];
      const cands = bb.candsByTarget[f.targetIdx];
      if (f.iAnchor < cands.length && cands.length - f.iAnchor > 1) {
        f.iAnchor += Math.floor(rng() * (cands.length - f.iAnchor));
      }
    }
  }

  function restartAtDepth(depthK: number) {
    while (stack.length > depthK) {
      const top = stack[stack.length - 1];
      undoAtFrame(top);
      stack.pop();
    }
    if (stack.length === 0) {
      fyShuffle(pieceOrderCur, 0);
      pushNewFrame();
      return;
    }
    const f = stack[stack.length - 1];
    undoAtFrame(f);
    advanceCursor(f);
  }

  function perturbAtShallow(depthK: number) {
    if (pieceOrderCur.length > 2) {
      const i = Math.floor(rng() * pieceOrderCur.length);
      let j = Math.floor(rng() * pieceOrderCur.length);
      if (j === i) j = (j + 1) % pieceOrderCur.length;
      [pieceOrderCur[i], pieceOrderCur[j]] = [pieceOrderCur[j], pieceOrderCur[i]];
    }
    const d = Math.min(depthK, Math.max(0, stack.length - 1));
    if (stack.length) {
      const f = stack[d];
      const cands = bb.candsByTarget[f.targetIdx];
      if (f.iAnchor < cands.length && rng() < 0.5) {
        f.iAnchor = Math.min(cands.length - 1, f.iAnchor + 1);
      }
    }
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
      clear: true,
      scene_version: ++sceneVersion,
    };
    if (cfg.pieces?.inventory) status.inventory_remaining = { ...remaining };
    events?.onStatus?.(status);
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
      clear: true,
      scene_version: ++sceneVersion,
      // Pass 3: Best progress tracking
      bestDepth,
      bestPlaced,
      nodesPerSec,
    };
    if (cfg.pieces?.inventory) status.inventory_remaining = { ...remaining };
    events?.onStatus?.(status);
    lastStatusAt = performance.now();
  }

  function emitDone(reason: "complete" | "timeout" | "limit" | "canceled") {
    emitStatus("done");
    // Log TT metrics if enabled
    if (tt) {
      console.log(`📊 TT Stats: Hits=${ttHits}, Stores=${ttStores}, Prunes=${ttPrunes}`);
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
    return (x >>> 0) / 0xffffffff;
  };
}

function normalize(s: Engine2Settings): Required<Engine2Settings> {
  return {
    maxSolutions: s.maxSolutions ?? 0,
    timeoutMs: s.timeoutMs ?? 0,
    statusIntervalMs: s.statusIntervalMs ?? 250,
    pauseOnSolution: s.pauseOnSolution ?? true,
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
    randomizeTies: s.randomizeTies ?? false,
    stall: {
      timeoutMs: s.stall?.timeoutMs ?? 3000,
      action: s.stall?.action ?? "reshuffle",
      depthK: s.stall?.depthK ?? 2,
      maxShuffles: s.stall?.maxShuffles ?? 8,
      minNodesPerSec: s.stall?.minNodesPerSec ?? 50,
    },
    tt: {
      enable: s.tt?.enable ?? true,
      bytes: s.tt?.bytes ?? 64 * 1024 * 1024, // 64 MB
      policy: s.tt?.policy ?? "2way",
    },
    tailSwitch: {
      enable: s.tailSwitch?.enable ?? true,
      tailSize: s.tailSwitch?.tailSize ?? 20,
    },
    visualRevealDelayMs: s.visualRevealDelayMs ?? 150,
  };
}
