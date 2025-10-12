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

type CandMask = { pid: string; ori: number; t: IJK; mask: Blocks };

type BitboardPrecomp = {
  blockCount: number;
  occAllMask: Blocks;                       // ((1<<N)-1) packed into blocks (upper bits zeroed)
  // For each target cell index, all valid placements as bitboards
  candsByTarget: CandMask[][];
  // Per-index neighbor as bitboard (for flood fill)
  neighborBits: Blocks[];
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

  // For each target cell, precompute all valid placements (piece, ori, anchor) as bitboards
  const candsByTarget: CandMask[][] = Array.from({ length: N }, () => []);

  // Helper: create a mask from a list of ijk cells (translated) → index bitboard
  function cellsToMask(cells: IJK[]): Blocks | null {
    const M = zeroBlocks(blockCount);
    for (const c of cells) {
      const idx = pre.bitIndex.get(`${c[0]},${c[1]},${c[2]}`);
      if (idx === undefined) return null;   // outside container
      setBit(M, idx);
    }
    return M;
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
          const mask = cellsToMask(translated);
          if (!mask) continue; // at least one cell outside container

          // Store bitboard with translation vector
          const t: IJK = [dx, dy, dz];
          candsByTarget[targetIdx].push({ pid, ori: o.id, t, mask });
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

  return { blockCount, occAllMask, candsByTarget, neighborBits };
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

  // State (bitboards)
  let occBlocks: Blocks = zeroBlocks(bb.blockCount);
  let nodes = 0, pruned = 0, solutions = 0;
  const stack: Frame[] = [];
  let sceneVersion = 0;

  // Control
  let paused = false, canceled = false;
  let lastStatusAt = startTime;
  const view = cfg.view ?? {
    worldFromIJK: [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],
    sphereRadiusWorld: 1.0
  };

  // Stall bookkeeping
  let lastProgressAt = performance.now();
  let nodesAtLastProgress = 0;
  let shuffleCount = 0;
  const maxShuffles = cfg.stall?.maxShuffles ?? 8;
  const stallTimeout = cfg.stall?.timeoutMs ?? 3000;

  // Snapshot restore (Pass 2: not yet implemented for bitboards)
  // TODO: restore occBlocks from snapshot
  if (resumeSnapshot) {
    console.warn('⚠️ Engine2 (bitboards): Snapshot restore not yet implemented in Pass 2');
  }

  // Cooperative loop
  const loop = () => {
    if (canceled || paused) return;
    const batchStart = performance.now();

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

      const f = stack[stack.length - 1];
      const cand = nextCandidateAtFrame(f);
      if (cand) {
        placeAtFrame(f, cand);
        nodes++;
        markProgress();

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

    // Stall handling
    if (cfg.randomizeTies && shuffleCount < maxShuffles) {
      const stalled = (now - lastProgressAt >= stallTimeout) && (nodes === nodesAtLastProgress);
      if (stalled) {
        const action = cfg.stall?.action ?? "reshuffle";
        const depthK = Math.max(0, cfg.stall?.depthK ?? 2);
        console.log(`🔀 Engine2: Stall detected! Action=${action}, depthK=${depthK}, shuffleCount=${shuffleCount}`);
        if (action === "reshuffle") reshuffleAtShallow(depthK);
        else if (action === "restartDepthK") restartAtDepth(depthK);
        else perturbAtShallow(depthK);
        shuffleCount++;
        emitStatus("search");
      }
    }

    setTimeout(loop, Math.max(0, cfg.statusIntervalMs - (performance.now() - batchStart)));
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

      // pruning
      if (cfg.pruning.multipleOf4) {
        const openAfter = pre.N - popcountBlocks(orBlocks(occBlocks, cm.mask));
        if ((openAfter % 4) !== 0) { pruned++; continue; }
      }
      if (cfg.pruning.connectivity) {
        if (!looksConnectedBlocks(occBlocks, cm.mask)) { pruned++; continue; }
      }

      return { pid: cm.pid, ori: cm.ori, t: cm.t, mask: cm.mask };
    }
    return null;
  }

  function placeAtFrame(f: Frame, p: { pid: string; ori: number; t: IJK; mask: Blocks }) {
    orEq(occBlocks, p.mask);
    remaining[p.pid]--;
    // Store t + a reference to the mask for undo
    f.placed = { pid: p.pid, ori: p.ori, t: p.t, mask: 0n as any };
    (f.placed as any).maskBlocks = p.mask;
  }

  function undoAtFrame(f: Frame) {
    if (!f.placed) return;
    xorEq(occBlocks, (f.placed as any).maskBlocks);
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
        if (!isFits(occBlocks, cm.mask)) continue;
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

    const status: StatusV2 & any = {
      engine: "dfs",
      phase,
      nodes,
      depth: stack.length,
      elapsedMs: performance.now() - startTime,
      pruned,
      placed: placements.length,
      open_cells: pre.N - popcountBlocks(occBlocks),
      stack: placements,
      containerId: pre.id,
      worldFromIJK: view.worldFromIJK,
      sphereRadiusWorld: view.sphereRadiusWorld,
      clear: true,
      scene_version: ++sceneVersion,
    };
    if (cfg.pieces?.inventory) status.inventory_remaining = { ...remaining };
    events?.onStatus?.(status);
    lastStatusAt = performance.now();
  }

  function emitDone(reason: "complete" | "timeout" | "limit" | "canceled") {
    emitStatus("done");
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
    },
    visualRevealDelayMs: s.visualRevealDelayMs ?? 150,
  };
}
