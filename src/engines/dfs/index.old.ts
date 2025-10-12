// src/engines/dfs/index.ts
// Legacy-only DFS engine (FCC ijk) with piece inventory support

import type { IJK, Placement, StatusV2 } from '../types';

// ---------- Public types ----------
export type Oriented = { id: number; cells: IJK[] };
export type PieceDB = Map<string, Oriented[]>;

// Frame-based DFS: each frame tracks iteration state at one depth
type Frame = {
  targetIdx: number;      // which open cell we're filling at this depth
  pieceIdx: number;       // current position in pieceOrder array
  oriIdx: number;         // current orientation index
  anchorIdx: number;      // current anchor point index
  placed?: {              // what we placed at this frame (for undo), undefined if nothing yet
    pid: string;
    ori: number;
    t: IJK;
    mask: bigint;
  };
};

export type DFSSettings = {
  maxSolutions?: number;              // default 1
  timeoutMs?: number;                 // default 0 (no timeout)
  seed?: number;                      // for tie-breaks if you add randomness
  moveOrdering?: "mostConstrainedCell" | "naive" | "pieceScarcity";
  symmetryBreaking?: "none" | "firstCell" | "bboxMin";
  pruning?: {
    connectivity?: boolean;           // flood-fill on remaining
    multipleOf4?: boolean;            // (open % 4) === 0
    boundaryReject?: boolean;         // fast inside/bounds check
  };
  statusIntervalMs?: number;          // default 250
  pauseOnSolution?: boolean;          // default true → pause after each solution
  uniqueSolutions?: boolean;          // optional: dedupe by canonical hash (default false)
  pieces?: {
    allow?: string[];                 // only these pieces
    inventory?: Record<string, number>; // max count per piece
  };
};

export type DFSEvents = {
  onStatus?: (s: StatusV2) => void;
  onSolution?: (placements: Placement[]) => void;
  onDone?: (summary: {
    solutions: number; nodes: number; elapsedMs: number;
    reason: "complete" | "timeout" | "limit" | "canceled"
  }) => void;
};

export type DFSSnapshot = {
  schema: 1;
  N: number;
  keys: string[];                     // index -> "i,j,k"
  occHex: string;                     // BigInt hex
  remaining: Record<string, number>;  // piece inventory counts
  pieceOrder: string[];               // sorted pieceIds
  stack: { pieceId: string; ori: number; t: IJK; maskHex: string }[];
  nodes: number;
  solutions: number;
  elapsedMs: number;
  settings: DFSSettings;
  containerId?: string;
};

export type RunHandle = {
  pause(): void;
  resume(): void;
  cancel(): void;
  snapshot(): DFSSnapshot;
};

// ---------- Precompute ----------

export function dfsPrecompute(
  container: { cells: IJK[]; id?: string },
  pieces: PieceDB
) {
  console.log('🔧 dfsPrecompute: Starting...');
  console.log(`   Container: ${container.cells.length} cells`);
  console.log(`   Pieces: ${pieces.size} types`);
  
  // Map cell key -> bit index
  const bitIndex = new Map<string, number>();
  const keys: string[] = [];
  container.cells.forEach((c, idx) => {
    const k = key(c);
    bitIndex.set(k, idx);
    keys.push(k);
  });

  // FCC (rhombohedral) 12-neighbor kernel in ijk (integer)
  const NBR: IJK[] = [
    [ 1, 0, 0], [-1, 0, 0], [0, 1, 0], [0,-1, 0], [0, 0, 1], [0, 0,-1],
    [ 1,-1, 0], [-1, 1, 0], [1, 0,-1], [-1, 0, 1], [0, 1,-1], [0,-1, 1],
  ];

  // Build neighbor graph (by index)
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
    keys,
    neighbors,
    occMaskAll,
    pieces,
    N,
  };
}

// ---------- Solve ----------

export function dfsSolve(
  pre: ReturnType<typeof dfsPrecompute>,
  settings: DFSSettings,
  events?: DFSEvents,
  snapshot?: DFSSnapshot
): RunHandle {
  console.log('🚀 dfsSolve: Starting DFS solver...');
  console.log(`   Settings:`, settings);
  
  const cfg = normalizeSettings(settings);
  console.log(`   Normalized config:`, cfg);
  
  const startTime = performance.now();

  // Build piece inventory
  const pieceIds = (cfg.pieces?.allow ?? [...pre.pieces.keys()]).sort();
  const remaining: Record<string, number> = {};
  for (const pid of pieceIds) {
    const inv = cfg.pieces?.inventory?.[pid];
    remaining[pid] = inv === undefined ? 1 : Math.max(0, Math.floor(inv));
  }

  // State
  let occ: bigint = 0n;
  let nodes = 0;
  let pruned = 0;
  let solutions = 0;
  const stack: Frame[] = [];  // Frame-based stack
  
  // Solution deduplication
  const seen = (cfg.uniqueSolutions ?? true) ? new Set<string>() : null;

  // Control
  let paused = false;
  let canceled = false;
  let lastStatusAt = startTime;

  // Apply snapshot if provided
  // NOTE: Snapshot restore not fully implemented for Frame-based stack yet
  // Would need to save/restore frame indices and placed state
  if (snapshot) {
    occ = BigInt("0x" + snapshot.occHex);
    Object.assign(remaining, snapshot.remaining);
    nodes = snapshot.nodes;
    solutions = snapshot.solutions;
    // TODO: Restore frame stack properly
  }

  // Emit initial status
  console.log('📤 dfsSolve: Emitting initial status...');
  emitStatus("search");

  // Kick off DFS cooperatively
  console.log('⏰ dfsSolve: Scheduling dfsLoop() via setTimeout...');
  setTimeout(() => {
    console.log('🔄 dfsLoop: STARTING (first call)');
    dfsLoop();
  }, 0);

  // ---- RunHandle
  function pause() { 
    console.log('⏸️ DFS: Paused');
    paused = true;
    emitStatus("search");  // Update UI to show current frontier
  }
  function resume() {
    if (canceled) return;
    console.log('▶️ DFS: Resumed from paused state');
    console.log(`   Stack depth: ${stack.length}, Nodes: ${nodes}, Solutions: ${solutions}`);
    const topFrame = stack[stack.length - 1];
    console.log(`   Stack top: ${topFrame?.placed ? topFrame.placed.pid : 'no placement'}`);
    paused = false;
    emitStatus("search");
    console.log('⏰ DFS: Scheduling dfsLoop to continue...');
    setTimeout(() => dfsLoop(), 0);
  }
  function cancel() {
    canceled = true;
    events?.onDone?.({
      solutions, nodes, elapsedMs: performance.now() - startTime,
      reason: "canceled",
    });
  }
  function snapshotFn(): DFSSnapshot {
    // Convert frame stack to placement stack for snapshot
    const placements = stack
      .filter(f => f.placed)
      .map(f => ({ 
        pieceId: f.placed!.pid, 
        ori: f.placed!.ori, 
        t: f.placed!.t, 
        maskHex: f.placed!.mask.toString(16) 
      }));
    
    return {
      schema: 1,
      N: pre.N,
      keys: pre.keys.slice(),
      occHex: occ.toString(16),
      remaining: { ...remaining },
      pieceOrder: pieceIds.slice(),
      stack: placements,
      nodes,
      solutions,
      elapsedMs: performance.now() - startTime,
      settings: cfg,
      containerId: pre.id,
    };
  }

  return { pause, resume, cancel, snapshot: snapshotFn };

  // ---------- Frame-Based Helper Functions ----------
  
  function makeSolutionKey(
    placements: Placement[],
    pieces: PieceDB,
    bitIndex: Map<string, number>
  ): string {
    // Order-independent, geometry-based signature:
    // For each piece, expand its 4 cells (ori+t), convert to bit indices, sort;
    // then sort pieces by pieceId and join.
    const rows: string[] = [];

    for (const p of placements) {
      const oris = pieces.get(p.pieceId);
      if (!oris) continue;
      const o = oris.find(x => x.id === p.ori);
      if (!o) continue;

      const idxs: number[] = [];
      for (const c of o.cells) {
        const w: IJK = [c[0] + p.t[0], c[1] + p.t[1], c[2] + p.t[2]];
        const idx = bitIndex.get(`${w[0]},${w[1]},${w[2]}`);
        if (idx !== undefined) idxs.push(idx);
      }
      idxs.sort((a, b) => a - b);
      rows.push(`${p.pieceId}:${idxs.join(',')}`);
    }

    rows.sort(); // piece order independent
    return rows.join('|');
  }
  
  function advanceCursor(f: Frame, pieces: PieceDB, pieceIds: string[]) {
    // We just undid a placement at (pieceIdx, oriIdx, anchorIdx).
    // Move to the NEXT anchor; if anchors exhausted → next ori; if oris exhausted → next piece.
    const pid = pieceIds[f.pieceIdx];
    const oris = pieces.get(pid);
    if (!oris) { f.pieceIdx++; f.oriIdx = 0; f.anchorIdx = 0; return; }

    const o = oris[f.oriIdx];
    f.anchorIdx++;
    if (f.anchorIdx >= o.cells.length) {
      f.anchorIdx = 0;
      f.oriIdx++;
      if (f.oriIdx >= oris.length) {
        f.oriIdx = 0;
        f.pieceIdx++;
      }
    }
  }
  
  function pushNewFrame(): boolean {
    // Pick next target cell
    const targetIdx = (cfg.moveOrdering === "mostConstrainedCell")
      ? selectMostConstrained(pre, occ, remaining, pre.pieces)
      : firstOpenBit(pre.N, occ);
    
    if (targetIdx < 0) return false; // No open cells
    
    stack.push({ 
      targetIdx, 
      pieceIdx: 0, 
      oriIdx: 0, 
      anchorIdx: 0, 
      placed: undefined 
    });
    return true;
  }
  
  function nextPlacementAtFrame(f: Frame): {pid: string; ori: number; t: IJK; mask: bigint} | null {
    // Defensive: if we arrive with a stale 'placed', skip past it
    if (f.placed) {
      advanceCursor(f, pre.pieces, pieceIds);
      f.placed = undefined;
    }
    
    console.log(`🔍 nextPlacement: searching from pieceIdx=${f.pieceIdx}, oriIdx=${f.oriIdx}, anchorIdx=${f.anchorIdx}, targetCell=${f.targetIdx}`);
    
    // Advance frame's indices until we find a legal placement
    // We continue from current indices (don't auto-reset in for-loop)
    for (; f.pieceIdx < pieceIds.length; ) {
      const pid = pieceIds[f.pieceIdx];
      if ((remaining[pid] ?? 0) <= 0) {
        f.pieceIdx++;
        f.oriIdx = 0;
        f.anchorIdx = 0;
        continue;
      }
      
      const oris = pre.pieces.get(pid)!;
      for (; f.oriIdx < oris.length; ) {
        const o = oris[f.oriIdx];
        for (; f.anchorIdx < o.cells.length; f.anchorIdx++) {
          const anchor = o.cells[f.anchorIdx];
          const targetCell = pre.cells[f.targetIdx];
          const t: IJK = [
            targetCell[0] - anchor[0],
            targetCell[1] - anchor[1],
            targetCell[2] - anchor[2]
          ];
          
          const mask = placementMask(pre, o.cells, t, occ);
          if (mask === null) { pruned++; continue; }
          
          // Pruning
          if (cfg.pruning?.multipleOf4) {
            const openAfter = pre.N - popcount(occ | mask);
            if ((openAfter % 4) !== 0) { pruned++; continue; }
          }
          if (cfg.pruning?.connectivity) {
            if (!remainingLooksConnected(pre, occ, mask)) { pruned++; continue; }
          }
          
          return { pid, ori: o.id, t, mask };
        }
        // Exhausted anchors for this orientation, move to next
        f.oriIdx++;
        f.anchorIdx = 0;
      }
      // Exhausted orientations for this piece, move to next
      f.pieceIdx++;
      f.oriIdx = 0;
      f.anchorIdx = 0;
    }
    return null;
  }
  
  function placeAtFrame(f: Frame, p: {pid: string; ori: number; t: IJK; mask: bigint}) {
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

  // ---------- Core DFS Loop (cooperative, frame-based) ----------
  function dfsLoop(): void {
    if (canceled || paused) {
      console.log(`⏸️ dfsLoop: Skipping (canceled=${canceled}, paused=${paused})`);
      return;
    }

    const BATCH_SIZE = 100;
    console.log(`🔄 dfsLoop: Processing batch (nodes=${nodes}, depth=${stack.length})`);
    
    for (let i = 0; i < BATCH_SIZE; i++) {
      // Check timeout
      if (cfg.timeoutMs && performance.now() - startTime >= cfg.timeoutMs) {
        console.log('⏱️ DFS: Timeout reached');
        emitDone("timeout");
        return;
      }
      
      // Initialize stack if empty
      if (stack.length === 0) {
        if (!pushNewFrame()) {
          console.log('✅ DFS: No open cells, search complete');
          emitDone("complete");
          return;
        }
      }
      
      // Check canceled
      if (canceled) return;
      
      // Try to advance current frame
      const f = stack[stack.length - 1];
      const next = nextPlacementAtFrame(f);
      
      if (next) {
        // Found valid placement
        placeAtFrame(f, next);
        nodes++;
        
        // Check if solution found AFTER placing
        if (occ === pre.occMaskAll) {
          // Build placements once
          const completeSolution: Placement[] = stack
            .filter(fr => fr.placed)
            .map(fr => ({ pieceId: fr.placed!.pid, ori: fr.placed!.ori, t: fr.placed!.t }));
          
          // Dedupe: compute key and skip if seen
          if (seen) {
            const key = makeSolutionKey(completeSolution, pre.pieces, pre.bitIndex);
            if (seen.has(key)) {
              // Duplicate leaf → just advance the cursor and keep going (no emit, no pause)
              console.log(`🔄 DFS: Duplicate solution detected, skipping...`);
              undoAtFrame(f);
              advanceCursor(f, pre.pieces, pieceIds);
              continue;
            }
            seen.add(key);
          }
          
          solutions++;
          console.log(`🎉 DFS: Solution #${solutions} found! (nodes: ${nodes})`);
          console.log(`   Solution pieces: ${completeSolution.map(p => p.pieceId).join(',')}`);
          
          // Emit solution
          events?.onSolution?.(completeSolution);
          
          // Check maxSolutions limit
          if (cfg.maxSolutions && solutions >= cfg.maxSolutions) {
            emitDone("limit");
            return;
          }
          
          // Back up one move and advance THIS frame's cursor so the next attempt is different
          undoAtFrame(f);
          advanceCursor(f, pre.pieces, pieceIds);
          
          // Instrumentation: show cursor moved
          const dbg = { pieceIdx: f.pieceIdx, oriIdx: f.oriIdx, anchorIdx: f.anchorIdx };
          console.log(`➡️  After solution: advanced cursor at depth ${stack.length - 1}`, dbg);
          
          // If pausing on solution, emit frontier state and stop
          if (cfg.pauseOnSolution) {
            paused = true;
            emitStatus("search");  // Show frontier (not full solution)
            console.log(`⏸️ DFS: Paused after backtrack, depth=${stack.length}`);
            return;
          }
          
          continue;
        }
        
        // Not a solution yet, descend: push new frame
        if (!pushNewFrame()) {
          // Can't push new frame (shouldn't happen if not a solution)
          console.warn('⚠️ DFS: Could not push new frame but not a solution?');
          undoAtFrame(f);
          f.anchorIdx++;
        }
      } else {
        // No more alternatives at this frame: backtrack
        undoAtFrame(f);
        stack.pop();
        console.log(`🔙 Backtrack: depth -> ${stack.length}`);
        
        if (stack.length === 0) {
          console.log('✅ DFS: Search exhausted (backtracked to root)');
          emitDone("complete");
          return;
        }
        
        // Advance parent's indices
        const parent = stack[stack.length - 1];
        parent.anchorIdx++;
      }
    }

    // Status heartbeat
    const now = performance.now();
    if (now - lastStatusAt >= cfg.statusIntervalMs) {
      emitStatus("search");
      lastStatusAt = now;
      
      if (nodes % 10000 === 0) {
        console.log(`🔍 DFS: nodes=${nodes}, depth=${stack.length}, open=${pre.N - popcount(occ)}, time=${((now - startTime) / 1000).toFixed(1)}s`);
      }
    }

    // Yield to event loop
    setTimeout(() => dfsLoop(), 0);
  }

  // ---------- Helpers ----------

  function emitStatus(phase: "search" | "done") {
    // Convert frame stack to placement list
    const placements = stack
      .filter(f => f.placed)
      .map(f => ({ pieceId: f.placed!.pid, ori: f.placed!.ori, t: f.placed!.t }));
    
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
    
    // Optional: add inventory remaining if configured
    if (cfg.pieces?.inventory) {
      (status as any).inventory_remaining = { ...remaining };
    }
    
    events?.onStatus?.(status);
    lastStatusAt = performance.now();  // Update heartbeat timestamp
  }

  function emitDone(reason: "complete" | "timeout" | "limit" | "canceled") {
    emitStatus("done");
    events?.onDone?.({ solutions, nodes, elapsedMs: performance.now() - startTime, reason });
  }
}

// ---------- Utility functions ----------

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
  pre: ReturnType<typeof dfsPrecompute>,
  orientedCells: IJK[],
  t: IJK,
  occ: bigint
): bigint | null {
  let m = 0n;
  for (const c of orientedCells) {
    const w: IJK = [c[0] + t[0], c[1] + t[1], c[2] + t[2]];
    const idx = pre.bitIndex.get(key(w));
    if (idx === undefined) return null;                 // outside container
    const bit = 1n << BigInt(idx);
    if (occ & bit) return null;                         // overlap
    m |= bit;
  }
  return m;
}

function remainingLooksConnected(
  pre: ReturnType<typeof dfsPrecompute>,
  occPlus: bigint,
  addMask: bigint
): boolean {
  const N = pre.N;
  const occ = occPlus | addMask;
  if (occ === pre.occMaskAll) return true;

  // Find a seed open cell
  let seed = -1;
  for (let i = 0; i < N; i++) {
    const bit = 1n << BigInt(i);
    if ((occ & bit) === 0n) { seed = i; break; }
  }
  if (seed < 0) return true;

  // BFS over open cells
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

  // If any open bit is unvisited, it's disconnected (reject)
  return visited === openMaskAll;
}

// Choose next cell with fewest legal continuations
function selectMostConstrained(
  pre: ReturnType<typeof dfsPrecompute>,
  occ: bigint,
  remaining: Record<string, number>,
  pieces: PieceDB
): number {
  let bestIdx = -1;
  let bestCount = Number.POSITIVE_INFINITY;

  // iterate open cells
  for (let idx = 0; idx < pre.N; idx++) {
    const bit = 1n << BigInt(idx);
    if (occ & bit) continue;

    let count = 0;

    for (const [pid, oris] of pieces.entries()) {
      if (remaining[pid] <= 0) continue;

      for (const o of oris) {
        // translations that cover idx
        for (const anchor of o.cells) {
          const t: IJK = [
            pre.cells[idx][0] - anchor[0],
            pre.cells[idx][1] - anchor[1],
            pre.cells[idx][2] - anchor[2],
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
      bestIdx = idx;
      if (bestCount === 0) return idx;
    }
  }
  return bestIdx;
}

function normalizeSettings(s: DFSSettings): Required<DFSSettings> {
  return {
    maxSolutions: s.maxSolutions ?? 1,
    timeoutMs: s.timeoutMs ?? 0,
    seed: s.seed ?? 12345,
    moveOrdering: s.moveOrdering ?? "mostConstrainedCell",
    symmetryBreaking: s.symmetryBreaking ?? "none",
    pruning: {
      connectivity: s.pruning?.connectivity ?? true,
      multipleOf4: s.pruning?.multipleOf4 ?? true,
      boundaryReject: s.pruning?.boundaryReject ?? true,
    },
    statusIntervalMs: s.statusIntervalMs ?? 250,
    pauseOnSolution: s.pauseOnSolution ?? true,     // default true
    uniqueSolutions: s.uniqueSolutions ?? true,     // default true - dedupe by geometry
    pieces: s.pieces ?? {},
  };
}
