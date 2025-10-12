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

  // State
  let occ: bigint = 0n;
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

  // Snapshot restore (full)
  if (resumeSnapshot) {
    occ = BigInt("0x" + resumeSnapshot.occHex);
    Object.assign(remaining, resumeSnapshot.remaining);
    nodes = resumeSnapshot.nodes;
    solutions = resumeSnapshot.solutions;
    for (const s of resumeSnapshot.frames) {
      const f: Frame = {
        targetIdx: s.targetIdx,
        iPiece: s.iPiece, iOri: s.iOri, iAnchor: s.iAnchor,
        placed: s.placed
          ? { pid: s.placed.pieceId, ori: s.placed.ori, t: s.placed.t, mask: BigInt("0x" + s.placed.maskHex) }
          : undefined,
      };
      stack.push(f);
    }
    console.log('♻️ Engine2: Restored from snapshot (depth=' + stack.length + ')');
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

        if (occ === pre.occMaskAll) {
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
    return {
      schema: 2,
      N: pre.N,
      occHex: occ.toString(16),
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
      ? selectMostConstrained(pre, occ, remaining, pre.pieces)
      : firstOpenBit(pre.N, occ);
    if (targetIdx < 0) return false;
    stack.push({ targetIdx, iPiece: 0, iOri: 0, iAnchor: 0, placed: undefined });
    return true;
  }

  function nextCandidateAtFrame(f: Frame): { pid: string; ori: number; t: IJK; mask: bigint } | null {
    for (; f.iPiece < pieceOrderCur.length; f.iPiece++, f.iOri = 0, f.iAnchor = 0) {
      const pid = pieceOrderCur[f.iPiece];
      if ((remaining[pid] ?? 0) <= 0) continue;
      const oris = pre.pieces.get(pid) || [];

      // Optional tie shuffle by seed (one-time per frame): randomize ori/anchor suffixes
      if (cfg.randomizeTies && f.iOri === 0 && oris.length > 1) {
        // micro-random jump inside the suffix
        if (oris.length - f.iOri > 1) {
          f.iOri += Math.floor(rng() * (oris.length - f.iOri));
        }
      }

      for (; f.iOri < oris.length; f.iOri++, f.iAnchor = 0) {
        const o = oris[f.iOri];
        if (cfg.randomizeTies && o.cells.length - f.iAnchor > 1) {
          f.iAnchor += Math.floor(rng() * (o.cells.length - f.iAnchor));
        }
        for (; f.iAnchor < o.cells.length; f.iAnchor++) {
          const anchor = o.cells[f.iAnchor];
          const target = pre.cells[f.targetIdx];
          const t: IJK = [target[0] - anchor[0], target[1] - anchor[1], target[2] - anchor[2]];
          const mask = placementMask(pre, o.cells, t, occ);
          if (mask === null) {
            pruned++;
            continue;
          }
          if (cfg.pruning.multipleOf4) {
            const openAfter = pre.N - popcount(occ | mask);
            if ((openAfter % 4) !== 0) {
              pruned++;
              continue;
            }
          }
          if (cfg.pruning.connectivity) {
            if (!remainingLooksConnected(pre, occ, mask)) {
              pruned++;
              continue;
            }
          }
          return { pid, ori: o.id, t, mask };
        }
      }
    }
    return null;
  }

  function placeAtFrame(f: Frame, p: { pid: string; ori: number; t: IJK; mask: bigint }) {
    occ |= p.mask;
    remaining[p.pid]--;
    f.placed = p;
  }

  function undoAtFrame(f: Frame) {
    if (!f.placed) return;
    occ ^= f.placed.mask;
    remaining[f.placed.pid]++;
    f.placed = undefined;
  }

  function advanceCursor(f: Frame) {
    const pid = pieceOrderCur[f.iPiece];
    const oris = pre.pieces.get(pid);
    if (!oris || oris.length === 0) {
      f.iPiece++;
      f.iOri = 0;
      f.iAnchor = 0;
      return;
    }
    const o = oris[f.iOri];
    f.iAnchor++;
    if (f.iAnchor >= o.cells.length) {
      f.iAnchor = 0;
      f.iOri++;
      if (f.iOri >= oris.length) {
        f.iOri = 0;
        f.iPiece++;
      }
    }
  }

  // Stall handlers
  function reshuffleAtShallow(depthK: number) {
    // Shuffle root order suffix (preserve tried prefix)
    fyShuffle(pieceOrderCur, 0);
    // Nudge shallow frames to skip ahead inside their remaining suffix
    const lim = Math.min(depthK, stack.length);
    for (let d = 0; d < lim; d++) {
      const f = stack[d];
      // random jumps forward inside remaining suffixes
      const pid = pieceOrderCur[f.iPiece];
      const oris = pre.pieces.get(pid) || [];
      if (f.iOri < oris.length && oris.length - f.iOri > 1) {
        f.iOri += Math.floor(rng() * (oris.length - f.iOri));
      }
      if (f.iOri < oris.length) {
        const o = oris[f.iOri];
        if (f.iAnchor < o.cells.length && o.cells.length - f.iAnchor > 1) {
          f.iAnchor += Math.floor(rng() * (o.cells.length - f.iAnchor));
        }
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
      const pid = pieceOrderCur[f.iPiece];
      const oris = pre.pieces.get(pid) || [];
      if (f.iOri < oris.length && rng() < 0.5) {
        f.iOri = Math.min(oris.length - 1, f.iOri + 1);
        f.iAnchor = 0;
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
      open_cells: pre.N - popcount(occ),
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

function firstOpenBit(N: number, occ: bigint): number {
  for (let i = 0; i < N; i++) {
    const bit = 1n << BigInt(i);
    if ((occ & bit) === 0n) return i;
  }
  return -1;
}

function popcount(x: bigint): number {
  let n = 0;
  while (x) {
    x &= (x - 1n);
    n++;
  }
  return n;
}

function placementMask(
  pre: ReturnType<typeof engine2Precompute>,
  orientedCells: IJK[],
  t: IJK,
  occ: bigint
): bigint | null {
  let m = 0n;
  for (const c of orientedCells) {
    const w: IJK = [c[0] + t[0], c[1] + t[1], c[2] + t[2]];
    const idx = pre.bitIndex.get(key(w));
    if (idx === undefined) return null;     // outside
    const bit = 1n << BigInt(idx);
    if (occ & bit) return null;             // overlap
    m |= bit;
  }
  return m;
}

function remainingLooksConnected(
  pre: ReturnType<typeof engine2Precompute>,
  occPlus: bigint,
  addMask: bigint
): boolean {
  const occ2 = occPlus | addMask;
  if (occ2 === pre.occMaskAll) return true;

  const N = pre.N;
  // Seed open cell
  let seed = -1;
  for (let i = 0; i < N; i++) {
    const bit = 1n << BigInt(i);
    if ((occ2 & bit) === 0n) {
      seed = i;
      break;
    }
  }
  if (seed < 0) return true;

  const openAll = ~occ2 & pre.occMaskAll;
  let visited = 0n;
  const q: number[] = [seed];
  visited |= (1n << BigInt(seed));

  while (q.length) {
    const u = q.shift()!;
    for (const v of pre.neighbors[u]) {
      const vb = 1n << BigInt(v);
      if ((openAll & vb) && !(visited & vb)) {
        visited |= vb;
        q.push(v);
      }
    }
  }

  return visited === openAll;
}

// Most-constrained target cell (inventory-aware)
function selectMostConstrained(
  pre: ReturnType<typeof engine2Precompute>,
  occ: bigint,
  remaining: Record<string, number>,
  pieces: PieceDB
): number {
  let best = -1, bestCount = Infinity;

  for (let idx = 0; idx < pre.N; idx++) {
    const b = 1n << BigInt(idx);
    if (occ & b) continue;

    let count = 0;
    for (const [pid, oris] of pieces.entries()) {
      if ((remaining[pid] ?? 0) <= 0) continue;
      for (const o of oris) {
        for (const anchor of o.cells) {
          const t: IJK = [
            pre.cells[idx][0] - anchor[0],
            pre.cells[idx][1] - anchor[1],
            pre.cells[idx][2] - anchor[2]
          ];
          const m = placementMask(pre, o.cells, t, occ);
          if (m !== null) {
            count++;
            if (count >= bestCount) break;
          }
        }
        if (count >= bestCount) break;
      }
      if (count >= bestCount) break;
    }

    if (count < bestCount) {
      bestCount = count;
      best = idx;
      if (bestCount === 0) return idx; // perfect fail-fast
    }
  }
  return best;
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
  };
}
