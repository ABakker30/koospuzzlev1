// src/engines/dfs2/index.ts
// Legacy-only, iterative DFS (FCC ijk) with per-level cursors, pause-on-solution, inventory, and StatusV2.

import type { IJK, Placement, StatusV2 } from "../types";

// ---------- Public types ----------
export type Oriented = { id: number; cells: IJK[] };
export type PieceDB = Map<string, Oriented[]>;

export type DFS2Settings = {
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
};

export type DFS2Events = {
  onStatus?: (s: StatusV2) => void;
  onSolution?: (placements: Placement[]) => void;
  onDone?: (summary: {
    solutions: number; nodes: number; elapsedMs: number;
    reason: "complete" | "timeout" | "limit" | "canceled"
  }) => void;
};

export type DFS2Snapshot = {
  schema: 2;
  N: number;
  occHex: string;                         // BigInt hex
  pieceOrder: string[];
  remaining: Record<string, number>;
  frames: FrameSnap[];
  nodes: number;
  solutions: number;
  elapsedMs: number;
  settings: DFS2Settings;
  containerId?: string;
};

export type DFS2RunHandle = {
  pause(): void;
  resume(): void;
  cancel(): void;
  snapshot(): DFS2Snapshot;
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

// ---------- Precompute ----------
export function dfs2Precompute(
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
export function dfs2Solve(
  pre: ReturnType<typeof dfs2Precompute>,
  settings: DFS2Settings,
  events?: DFS2Events,
  resumeSnapshot?: DFS2Snapshot
): DFS2RunHandle {
  const cfg = normalize(settings);
  const startTime = performance.now();

  // Inventory + piece order
  const pieceOrder = (cfg.pieces?.allow ?? [...pre.pieces.keys()]).sort();
  const remaining: Record<string, number> = {};
  for (const pid of pieceOrder) {
    const inv = cfg.pieces?.inventory?.[pid];
    remaining[pid] = Math.max(0, Math.floor(inv ?? 1));
  }
  
  console.log('📋 DFS2: Piece inventory:', remaining);
  console.log('📋 DFS2: Piece order:', pieceOrder);

  // State
  let occ: bigint = 0n;
  let nodes = 0;
  let pruned = 0;
  let solutions = 0;
  const stack: Frame[] = [];

  // Control
  let paused = false;
  let canceled = false;
  let lastStatusAt = startTime;

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
  }

  // Emit initial status
  emitStatus("search");

  // Cooperative loop
  const BATCH_SIZE = 200;

  const loop = () => {
    if (canceled || paused) return;
    const batchStart = performance.now();

    for (let step = 0; step < BATCH_SIZE; step++) {
      // Timeout
      if (cfg.timeoutMs && performance.now() - startTime >= cfg.timeoutMs) {
        emitDone("timeout");
        return;
      }

      // Initialize depth 0
      if (stack.length === 0) {
        console.log('🏁 DFS2: Initializing depth 0...');
        if (!pushNewFrame()) {
          console.log('❌ DFS2: Failed to push initial frame!');
          emitDone("complete");
          return;
        }
      }

      const f = stack[stack.length - 1];

      // Try next candidate at this frame
      const cand = nextCandidateAtFrame(f);
      if (cand) {
        // Place
        placeAtFrame(f, cand);
        nodes++;

        // Solution?
        if (occ === pre.occMaskAll) {
          // Build placements in order of depth
          const placements: Placement[] = stack
            .filter(fr => fr.placed)
            .map(fr => ({ pieceId: fr.placed!.pid, ori: fr.placed!.ori, t: fr.placed!.t }));

          solutions++;
          console.log(`🎉 DFS2: Solution #${solutions} found! (nodes: ${nodes})`);
          console.log(`   Pieces: ${placements.map(p => p.pieceId).join(',')}`);
          events?.onSolution?.(placements);

          // Limit?
          if (cfg.maxSolutions > 0 && solutions >= cfg.maxSolutions) {
            console.log(`✅ DFS2: Max solutions (${cfg.maxSolutions}) reached`);
            emitDone("limit");
            return;
          }

          // Always undo leaf first, then advance cursor at this frame
          undoAtFrame(f);
          advanceCursor(f);
          console.log(`➡️  DFS2: Advanced cursor at depth ${stack.length - 1}, iPiece=${f.iPiece}, iOri=${f.iOri}, iAnchor=${f.iAnchor}`);

          // Auto-pause after solution?
          if (cfg.pauseOnSolution) {
            paused = true;
            console.log(`⏸️ DFS2: Auto-paused after solution, depth=${stack.length}`);
            emitStatus("search");   // frontier (post-undo)
            return;
          }

          // Continue trying next alternative at this depth
          continue;
        }

        // Not a solution: descend
        if (!pushNewFrame()) {
          // Shouldn't happen if not solution; defensive:
          undoAtFrame(f);
          advanceCursor(f);
        }
        continue;
      }

      // No candidates at this frame → backtrack
      undoAtFrame(f);
      stack.pop();
      console.log(`🔙 DFS2: Backtrack to depth ${stack.length}`);

      if (stack.length === 0) {
        console.log('✅ DFS2: Search exhausted (backtracked to root)');
        emitDone("complete");
        return;
      }

      // IMPORTANT: we are about to change the parent's choice → undo it first
      const parent = stack[stack.length - 1];
      undoAtFrame(parent);           // ← free cells and restore inventory
      advanceCursor(parent);         // ← move to the next alternative at this depth
      console.log(`↪️  Parent retry at depth ${stack.length - 1}, iPiece=${parent.iPiece}, iOri=${parent.iOri}, iAnchor=${parent.iAnchor}`);
    }

    // Heartbeat
    const now = performance.now();
    if (now - lastStatusAt >= cfg.statusIntervalMs) {
      emitStatus("search");
      lastStatusAt = now;
    }

    // Yield to event loop regularly (also ensure we don't hog the main thread)
    setTimeout(loop, Math.max(0, cfg.statusIntervalMs - (performance.now() - batchStart)));
  };

  // Start
  console.log('🚀 DFS2: Starting solver...');
  console.log(`   Settings: maxSolutions=${cfg.maxSolutions}, pauseOnSolution=${cfg.pauseOnSolution}`);
  setTimeout(loop, 0);

  // ---- Handle API ----
  function pause() {
    console.log('⏸️ DFS2: User paused');
    paused = true;
    emitStatus("search");
  }
  function resume() {
    if (canceled) return;
    console.log('▶️ DFS2: Resuming from pause');
    console.log(`   Stack depth: ${stack.length}, Nodes: ${nodes}, Solutions: ${solutions}`);
    paused = false;
    emitStatus("search");
    setTimeout(loop, 0);
  }
  function cancel() {
    canceled = true;
    events?.onDone?.({ solutions, nodes, elapsedMs: performance.now() - startTime, reason: "canceled" });
  }
  function snapshot(): DFS2Snapshot {
    const frames: FrameSnap[] = stack.map(f => ({
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
      pieceOrder: [...pieceOrder],
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

  // ---------- Local helpers (use state above) ----------

  function pushNewFrame(): boolean {
    const targetIdx =
      cfg.moveOrdering === "mostConstrainedCell"
        ? selectMostConstrained(pre, occ, remaining, pre.pieces)
        : firstOpenBit(pre.N, occ);
    
    console.log(`📌 pushNewFrame: targetIdx=${targetIdx}, depth will be ${stack.length}`);
    
    if (targetIdx < 0) {
      console.log('❌ pushNewFrame: No target cell found!');
      return false;
    }
    
    stack.push({ targetIdx, iPiece: 0, iOri: 0, iAnchor: 0, placed: undefined });
    console.log(`✅ pushNewFrame: Pushed frame at depth ${stack.length - 1}, target cell ${targetIdx}`);
    return true;
  }

  function nextCandidateAtFrame(f: Frame): { pid: string; ori: number; t: IJK; mask: bigint } | null {
    // The caller must ensure f.placed is undefined (via undoAtFrame)
    // No defensive skip needed - fail fast if violated
    
    console.log(`🔍 nextCandidate: depth=${stack.length-1}, targetCell=${f.targetIdx}, pieceIdx=${f.iPiece}/${pieceOrder.length}`);
    
    for (; f.iPiece < pieceOrder.length; f.iPiece++, f.iOri = 0, f.iAnchor = 0) {
      const pid = pieceOrder[f.iPiece];
      console.log(`  Trying piece ${pid}, remaining=${remaining[pid]}`);
      if ((remaining[pid] ?? 0) <= 0) continue;

      const oris = pre.pieces.get(pid) || [];
      console.log(`    Piece ${pid} has ${oris.length} orientations`);
      for (; f.iOri < oris.length; f.iOri++, f.iAnchor = 0) {
        const o = oris[f.iOri];
        for (; f.iAnchor < o.cells.length; f.iAnchor++) {
          const anchor = o.cells[f.iAnchor];
          const target = pre.cells[f.targetIdx];
          const t: IJK = [target[0] - anchor[0], target[1] - anchor[1], target[2] - anchor[2]];
          const mask = placementMask(pre, o.cells, t, occ);
          if (mask === null) {
            console.log(`      Rejected: doesn't fit (overlap or outside)`);
            pruned++;
            continue;
          }

          // Pruning
          if (cfg.pruning.multipleOf4) {
            const openAfter = pre.N - popcount(occ | mask);
            if ((openAfter % 4) !== 0) {
              console.log(`      Rejected: multipleOf4 pruning (openAfter=${openAfter})`);
              pruned++;
              continue;
            }
          }
          if (cfg.pruning.connectivity) {
            if (!remainingLooksConnected(pre, occ, mask)) {
              console.log(`      Rejected: connectivity pruning`);
              pruned++;
              continue;
            }
          }

          console.log(`      ✅ FOUND valid placement: ${pid}[${o.id}] anchor ${f.iAnchor}`);
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
    const pid = pieceOrder[f.iPiece];
    const oris = pre.pieces.get(pid);
    if (!oris || oris.length === 0) { f.iPiece++; f.iOri = 0; f.iAnchor = 0; return; }
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

  function emitStatus(phase: "search" | "done") {
    const placements: Placement[] = stack
      .filter(fr => fr.placed)
      .map(fr => ({ pieceId: fr.placed!.pid, ori: fr.placed!.ori, t: fr.placed!.t }));

    const status: StatusV2 = {
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
    };

    if (cfg.pieces.inventory) (status as any).inventory_remaining = { ...remaining };
    events?.onStatus?.(status);
    lastStatusAt = performance.now();
  }

  function emitDone(reason: "complete" | "timeout" | "limit" | "canceled") {
    emitStatus("done");
    events?.onDone?.({ solutions, nodes, elapsedMs: performance.now() - startTime, reason });
  }
}

// ---------- Utility ----------
function key(c: IJK): string { return `${c[0]},${c[1]},${c[2]}`; }

function firstOpenBit(N: number, occ: bigint): number {
  for (let i = 0; i < N; i++) {
    const bit = 1n << BigInt(i);
    if ((occ & bit) === 0n) return i;
  }
  return -1;
}

function popcount(x: bigint): number {
  let n = 0;
  while (x) { x &= (x - 1n); n++; }
  return n;
}

function placementMask(
  pre: ReturnType<typeof dfs2Precompute>,
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
  pre: ReturnType<typeof dfs2Precompute>,
  occPlus: bigint,
  addMask: bigint
): boolean {
  const occ = occPlus | addMask;
  if (occ === pre.occMaskAll) return true;

  const N = pre.N;
  // Seed open cell
  let seed = -1;
  for (let i = 0; i < N; i++) {
    const bit = 1n << BigInt(i);
    if ((occ & bit) === 0n) { seed = i; break; }
  }
  if (seed < 0) return true;

  const openMaskAll = ~occ & pre.occMaskAll;
  let visited = 0n;
  const q: number[] = [seed];
  visited |= (1n << BigInt(seed));

  while (q.length) {
    const u = q.shift()!;
    for (const v of pre.neighbors[u]) {
      const vb = 1n << BigInt(v);
      if ((openMaskAll & vb) && !(visited & vb)) {
        visited |= vb;
        q.push(v);
      }
    }
  }

  return visited === openMaskAll;
}

// Most-constrained target cell (inventory-aware)
function selectMostConstrained(
  pre: ReturnType<typeof dfs2Precompute>,
  occ: bigint,
  remaining: Record<string, number>,
  pieces: PieceDB
): number {
  let bestIdx = -1;
  let bestCount = Number.POSITIVE_INFINITY;

  for (let idx = 0; idx < pre.N; idx++) {
    const bit = 1n << BigInt(idx);
    if (occ & bit) continue;

    let count = 0;

    for (const [pid, oris] of pieces.entries()) {
      if ((remaining[pid] ?? 0) <= 0) continue;

      for (const o of oris) {
        for (const anchor of o.cells) {
          const t: IJK = [pre.cells[idx][0]-anchor[0], pre.cells[idx][1]-anchor[1], pre.cells[idx][2]-anchor[2]];
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
      bestIdx = idx;
      if (bestCount === 0) return idx; // perfect fail-fast
    }
  }
  return bestIdx;
}

function normalize(s: DFS2Settings): Required<DFS2Settings> {
  return {
    maxSolutions: s.maxSolutions ?? 0,             // 0 = unlimited
    timeoutMs: s.timeoutMs ?? 0,
    statusIntervalMs: s.statusIntervalMs ?? 250,
    pauseOnSolution: s.pauseOnSolution ?? true,

    moveOrdering: s.moveOrdering ?? "mostConstrainedCell",
    pruning: {
      connectivity: s.pruning?.connectivity ?? true,
      multipleOf4: s.pruning?.multipleOf4 ?? true,
    },

    pieces: s.pieces ?? {},
  };
}
