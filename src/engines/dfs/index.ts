// src/engines/dfs/index.ts
// Legacy-only DFS engine (FCC ijk) with piece inventory support

import type { IJK, Placement, StatusV2 } from '../types';

// ---------- Public types ----------
export type Oriented = { id: number; cells: IJK[] };
export type PieceDB = Map<string, Oriented[]>;

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
  const stack: { pieceId: string; ori: number; t: IJK; mask: bigint }[] = [];

  // Control
  let paused = false;
  let canceled = false;
  let lastStatusAt = startTime;
  let searchCompleted = false;

  // Apply snapshot if provided
  if (snapshot) {
    occ = BigInt("0x" + snapshot.occHex);
    Object.assign(remaining, snapshot.remaining);
    nodes = snapshot.nodes;
    solutions = snapshot.solutions;
    for (const s of snapshot.stack) {
      stack.push({ pieceId: s.pieceId, ori: s.ori, t: s.t, mask: BigInt("0x" + s.maskHex) });
    }
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
  }
  function resume() {
    if (canceled) return;
    console.log('▶️ DFS: Resumed from paused state');
    console.log(`   Stack depth: ${stack.length}, Nodes: ${nodes}, Solutions: ${solutions}`);
    console.log(`   Stack top: ${stack.length > 0 ? `${stack[stack.length-1].pieceId}` : 'empty'}`);
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
    return {
      schema: 1,
      N: pre.N,
      keys: pre.keys.slice(),
      occHex: occ.toString(16),
      remaining: { ...remaining },
      pieceOrder: pieceIds.slice(),
      stack: stack.map(s => ({ pieceId: s.pieceId, ori: s.ori, t: s.t, maskHex: s.mask.toString(16) })),
      nodes,
      solutions,
      elapsedMs: performance.now() - startTime,
      settings: cfg,
      containerId: pre.id,
    };
  }

  return { pause, resume, cancel, snapshot: snapshotFn };

  // ---------- Core DFS Loop (cooperative) ----------
  function dfsLoop(): void {
    if (canceled || paused) {
      console.log(`⏸️ dfsLoop: Skipping (canceled=${canceled}, paused=${paused})`);
      return;
    }

    // Process a batch of nodes, then yield
    const BATCH_SIZE = 100; // Process 100 nodes per batch
    console.log(`🔄 dfsLoop: Processing batch (nodes=${nodes}, depth=${stack.length})`);
    
    for (let i = 0; i < BATCH_SIZE; i++) {
      // Check timeout
      if (cfg.timeoutMs && performance.now() - startTime >= cfg.timeoutMs) {
        console.log('⏱️ DFS: Timeout reached');
        emitDone("timeout");
        return;
      }

      // Check if done
      if (occ === pre.occMaskAll) {
        solutions++;
        console.log(`🎉 DFS: Solution #${solutions} found! (nodes: ${nodes})`);
        
        // SAVE the complete solution before backtracking
        const completeSolution = stack.map(({ pieceId, ori, t }) => ({ pieceId, ori, t }));
        console.log(`   Solution pieces: ${completeSolution.map(p => p.pieceId).join(',')}`);
        
        // Check maxSolutions limit
        if (cfg.maxSolutions && solutions >= cfg.maxSolutions) {
          console.log(`✅ DFS: Max solutions (${cfg.maxSolutions}) reached`);
          events?.onSolution?.(completeSolution);
          emitDone("limit");
          return;
        }
        
        // Backtrack to prepare for next solution
        if (stack.length === 0) {
          console.log('✅ DFS: Search exhausted after finding solution');
          events?.onSolution?.(completeSolution);
          emitDone("complete");
          return;
        }
        
        console.log(`🔙 DFS: Backtracking to find next solution...`);
        const last = stack.pop()!;
        occ ^= last.mask;
        remaining[last.pieceId]++;
        console.log(`   Popped: ${last.pieceId}[${last.ori}] @ (${last.t})`);
        
        // Mark this placement as "exhausted" temporarily so we don't try it again immediately
        const avoidPiece = last.pieceId;
        const beforeDepth = stack.length;
        
        // Keep trying steps until we either:
        // 1. Place a DIFFERENT piece (success)
        // 2. Backtrack further (stack depth decreases)
        // 3. Search exhausted
        let attempts = 0;
        while (attempts < 1000) { // Safety limit
          attempts++;
          
          if (paused || canceled) {
            console.log('⏸️ DFS: Paused during backtrack search');
            return;
          }
          
          const stepResult = dfsStep();
          if (!stepResult) {
            console.log('✅ DFS: Search exhausted during backtrack');
            emitDone("complete");
            return;
          }
          
          // Check if we placed a different piece or backtracked further
          if (stack.length > beforeDepth) {
            // We placed something
            const newTop = stack[stack.length - 1];
            if (newTop.pieceId !== avoidPiece || stack.length > beforeDepth + 1) {
              console.log(`✅ DFS: Found alternative: ${newTop.pieceId} (was avoiding ${avoidPiece})`);
              break; // Success - we found an alternative path
            } else {
              // Same piece placed - backtrack it and try again
              console.log(`   Skipping ${newTop.pieceId} (same as popped piece), backtracking...`);
              const dup = stack.pop()!;
              occ ^= dup.mask;
              remaining[dup.pieceId]++;
            }
          } else if (stack.length < beforeDepth) {
            // We backtracked further - that's fine, continue search
            console.log(`   Backtracked further to depth ${stack.length}`);
            break;
          }
        }
        
        // NOW emit the saved solution (after backtracking is complete)
        console.log(`📤 DFS: Emitting solution and checking for pause...`);
        events?.onSolution?.(completeSolution);
        
        // Check if callback paused us
        if (paused) {
          console.log(`⏸️ DFS: Paused after backtracking, state ready to resume with ${stack.length} pieces`);
          return;
        }
        
        // Continue loop to explore new branch
      }
      // Check if paused or canceled before continuing
      if (canceled || paused) return;

      // Do one step of DFS
      if (!dfsStep()) {
        // Search exhausted
        console.log(`✅ DFS: Search exhausted (nodes: ${nodes}, solutions: ${solutions})`);
        emitDone("complete");
        return;
      }
    }

    // Status heartbeat
    const now = performance.now();
    if (now - lastStatusAt >= cfg.statusIntervalMs) {
      emitStatus("search");
      lastStatusAt = now;
      
      // Log progress every 10k nodes
      if (nodes % 10000 === 0) {
        console.log(`🔍 DFS: nodes=${nodes}, depth=${stack.length}, open=${pre.N - popcount(occ)}, time=${((now - startTime) / 1000).toFixed(1)}s`);
      }
    }

    // Yield to event loop, then continue
    setTimeout(() => dfsLoop(), 0);
  }

  // ---------- Single DFS Step (iterative, non-recursive) ----------
  function dfsStep(): boolean {
    nodes++;
    
    // Try to place a piece
    const targetIdx = (cfg.moveOrdering === "mostConstrainedCell")
      ? selectMostConstrained(pre, occ, remaining, pre.pieces)
      : firstOpenBit(pre.N, occ);

    if (targetIdx < 0) {
      // No open cells - backtrack if we have a stack
      if (stack.length === 0) {
        return false; // Search exhausted
      }
      // Pop and try next option (handled by caller loop)
      const last = stack.pop()!;
      occ ^= last.mask;
      remaining[last.pieceId]++;
      return true;
    }

    const targetCell = pre.cells[targetIdx];

    // Try each piece
    for (const pid of pieceIds) {
      if (remaining[pid] <= 0) continue;

      const oris = pre.pieces.get(pid)!;
      for (const o of oris) {
        for (const anchor of o.cells) {
          const t: IJK = [
            targetCell[0] - anchor[0],
            targetCell[1] - anchor[1],
            targetCell[2] - anchor[2],
          ];

          const m = placementMask(pre, o.cells, t, occ);
          if (m === null) { pruned++; continue; }

          // Pruning
          if (cfg.pruning?.multipleOf4) {
            const openAfter = pre.N - popcount(occ | m);
            if ((openAfter % 4) !== 0) { pruned++; continue; }
          }
          if (cfg.pruning?.connectivity) {
            if (!remainingLooksConnected(pre, occ, m)) { pruned++; continue; }
          }

          // Place piece
          remaining[pid]--;
          occ |= m;
          stack.push({ pieceId: pid, ori: o.id, t, mask: m });
          return true; // Placed successfully
        }
      }
    }

    // No valid placement - backtrack
    if (stack.length === 0) {
      return false; // Search exhausted
    }
    const last = stack.pop()!;
    occ ^= last.mask;
    remaining[last.pieceId]++;
    return true;
  }

  // ---------- Helpers ----------

  function emitStatus(phase: "search" | "done") {
    const status: StatusV2 = {
      engine: "dfs",
      phase,
      nodes,
      depth: stack.length,
      elapsedMs: performance.now() - startTime,
      pruned,
      placed: stack.length,
      open_cells: pre.N - popcount(occ),
      stack: stack.map(({ pieceId, ori, t }) => ({ pieceId, ori, t })),
      containerId: pre.id,
    };
    
    // Optional: add inventory remaining if configured
    if (cfg.pieces?.inventory) {
      (status as any).inventory_remaining = { ...remaining };
    }
    
    events?.onStatus?.(status);
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
    pieces: s.pieces ?? {},
  };
}
