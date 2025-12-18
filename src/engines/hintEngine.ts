// src/engines/hintEngine.ts
// Lightweight "hint / solvability" engine entry point for Manual Solve and VS modes.
// Uses Engine2's bitboard system (Blocks = BigUint64Array) for scalability beyond N=64.
// Integrates DLX (Dancing Links) for exact cover when state is small enough.

import type { IJK } from '../types/shape';
import type { DLXCheckInput } from './dlxSolver';
import type { PieceDB } from './dfs2';
import { 
  engine2Precompute, 
  buildBitboards,
  type Blocks,
  type BitboardPrecomp,
  andNotBlocks,
  popcountBlocks,
  forEachSetBit,
  newBlocks,
  orBlocks,
  testBit,
} from './engine2';
import { dlxExactCover } from './engine2/dlx';
import { DLX_CONFIG } from './engine2/dlxConfig';
import { loadAllPieces } from './piecesLoader';

// ========== WITNESS CACHE ==========
// Cache the witness solution from DLX so hints come from the same solution path
interface WitnessCache {
  witness: Array<{ pid: string; ori: number; t: any; mask: any; cellsIdx: number[] }>;
  occMask: string; // Hex string of occupancy state
  remainingKey: string; // JSON of remaining inventory
  usedIndices: Set<number>; // Track which witness pieces we've already returned
}

let witnessCache: WitnessCache | null = null;

// Invalidate cache when board state changes
export function invalidateWitnessCache() {
  witnessCache = null;
  console.log('🗑️ [WitnessCache] Invalidated');
}

function keyIJK(c: IJK): string {
  return `${c.i},${c.j},${c.k}`;
}

// Local copy of key(), matching dfs2's utility
function key(c: [number, number, number] | IJK): string {
  if (Array.isArray(c)) {
    return `${c[0]},${c[1]},${c[2]}`;
  }
  return `${c.i},${c.j},${c.k}`;
}

// Keep old popcount for existing DFS code (N ≤ 64 compatibility)
function popcount(x: bigint): number {
  let n = 0;
  while (x) {
    x &= x - 1n;
    n++;
  }
  return n;
}

// Helper to set a bit in Blocks
function setBitBlocks(b: Blocks, idx: number) {
  const bi = (idx / 64) | 0;
  const bit = BigInt(idx % 64);
  b[bi] |= (1n << bit);
}

// Convert bigint occ to Blocks format (handles any N, including N > 64)
function bigintToBlocks(occ: bigint, blockCount: number): Blocks {
  const blocks = newBlocks(blockCount);
  
  // Split bigint across multiple 64-bit blocks
  for (let bi = 0; bi < blockCount; bi++) {
    // Extract 64 bits for this block
    const mask = (1n << 64n) - 1n;
    blocks[bi] = (occ >> BigInt(bi * 64)) & mask;
  }
  
  return blocks;
}

function placementMask(
  pre: ReturnType<typeof engine2Precompute>,
  orientedCells: [number, number, number][],
  t: [number, number, number],
  occ: bigint
): bigint | null {
  let m = 0n;
  for (const c of orientedCells) {
    const w: [number, number, number] = [c[0] + t[0], c[1] + t[1], c[2] + t[2]];
    const idx = pre.bitIndex.get(key(w));
    if (idx === undefined) return null; // outside
    const bit = 1n << BigInt(idx);
    if (occ & bit) return null; // overlap
    m |= bit;
  }
  return m;
}

function remainingLooksConnected(
  pre: ReturnType<typeof engine2Precompute>,
  occPlus: bigint,
  addMask: bigint
): boolean {
  const occ = occPlus | addMask;
  if (occ === pre.occMaskAll) return true;

  const N = pre.N;
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

function lightweightSolvabilityCheckGlobal(
  pre: ReturnType<typeof engine2Precompute>,
  occ: bigint
): boolean {
  // Remaining open cells
  const openAfter = pre.N - popcount(occ);

  // Quick rule 1: total open cells must be multiple of 4
  if (openAfter % 4 !== 0) return false;

  // Quick rule 2: remaining open cells must form one connected region
  // (no isolated "holes" like a single cell pocket)
  const openMaskAll = ~occ & pre.occMaskAll;

  // Find seed open index
  let seed = -1;
  for (let i = 0; i < pre.N; i++) {
    const bit = 1n << BigInt(i);
    if (openMaskAll & bit) { seed = i; break; }
  }
  if (seed < 0) return true; // no open cells → trivially OK

  let visited = 0n;
  const q: number[] = [seed];
  visited |= 1n << BigInt(seed);

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

  // If visited != openMaskAll → there's at least one disconnected open region
  return visited === openMaskAll;
}

function lightweightSolvabilityCheck(
  pre: ReturnType<typeof engine2Precompute>,
  occ: bigint,
  addMask: bigint
): boolean {
  const newOcc = occ | addMask;
  const openCount = pre.N - popcount(newOcc);

  // must remain divisible by 4
  if (openCount % 4 !== 0) return false;

  // must remain connected
  if (!remainingLooksConnected(pre, occ, addMask)) return false;

  return true;
}

function selectMostConstrained(
  pre: ReturnType<typeof engine2Precompute>,
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
          const t: [number, number, number] = [
            pre.cells[idx][0] - anchor[0],
            pre.cells[idx][1] - anchor[1],
            pre.cells[idx][2] - anchor[2],
          ];
          const m = placementMask(pre, o.cells as [number, number, number][], t, occ);
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

function buildOccMaskFromPlaced(
  pre: ReturnType<typeof engine2Precompute>,
  placedPieces: DLXCheckInput['placedPieces']
): bigint {
  let occ = 0n;
  let totalCellsProcessed = 0;
  let cellsInContainer = 0;
  let cellsOutsideContainer = 0;

  for (const p of placedPieces) {
    let pieceInContainer = 0;
    let pieceOutside = 0;
    
    for (const cell of p.cells) {
      totalCellsProcessed++;
      const idx = pre.bitIndex.get(keyIJK(cell));
      if (idx != null) {
        occ |= 1n << BigInt(idx);
        cellsInContainer++;
        pieceInContainer++;
      } else {
        cellsOutsideContainer++;
        pieceOutside++;
      }
    }
    
    if (pieceOutside > 0) {
      console.warn('⚠️ [buildOccMask] Piece has cells outside container:', {
        pieceId: p.pieceId,
        totalCells: p.cells.length,
        inContainer: pieceInContainer,
        outside: pieceOutside,
        cells: p.cells
      });
    }
  }

  console.log('🔢 [buildOccMask] Summary:', {
    placedPiecesCount: placedPieces.length,
    totalCells: totalCellsProcessed,
    inContainer: cellsInContainer,
    outside: cellsOutsideContainer,
    occBits: popcount(occ),
    containerSize: pre.N
  });

  return occ;
}

function buildRemainingInventory(
  remainingPieces: DLXCheckInput['remainingPieces']
): Record<string, number> {
  const inv: Record<string, number> = {};
  for (const r of remainingPieces) {
    if (r.remaining === 'infinite') {
      inv[r.pieceId] = 999; // effectively unlimited for hint/solvability
    } else {
      inv[r.pieceId] = Math.max(0, r.remaining);
    }
  }
  return inv;
}

type PartialState = {
  occ: bigint;
  remaining: Record<string, number>;
};

function dfsSolvable(
  pre: ReturnType<typeof engine2Precompute>,
  piecesDb: PieceDB,
  state: PartialState,
  depth: number,
  maxDepth: number,
  deadlineMs: number
): boolean {
  console.log('🔎 dfsSolvable start', { depth, occ: state.occ.toString(16) });
  
  if (Date.now() > deadlineMs) return false;
  if (depth > maxDepth) return false;

  // If all cells are filled, it's a solution
  if (state.occ === pre.occMaskAll) {
    console.log('✅ Solution found at depth', depth);
    return true;
  }

  // Select target cell (most constrained)
  const targetIdx = selectMostConstrained(pre, state.occ, state.remaining, piecesDb);
  if (targetIdx < 0) {
    // No open cell found, but occ != occMaskAll → dead end
    console.log('⚠️ No target cell selected (dead end)');
    return false;
  }

  const target = pre.cells[targetIdx];
  
  // Debug: check shapes at depth 0
  if (depth === 0) {
    console.log('🔎 Debug at depth 0:');
    console.log('  target:', target);
    console.log('  piecesDb type:', piecesDb instanceof Map ? 'Map' : 'Object');
    console.log('  piecesDb keys sample:', piecesDb instanceof Map ? Array.from(piecesDb.keys()).slice(0, 3) : Object.keys(piecesDb).slice(0, 3));
    
    // Sample first piece to check orientation shape
    const firstPiece = piecesDb instanceof Map ? piecesDb.values().next().value : Object.values(piecesDb)[0];
    if (firstPiece && firstPiece[0]) {
      console.log('  first orientation sample:', firstPiece[0]);
      console.log('  has cells?', 'cells' in firstPiece[0]);
      console.log('  has ijkOffsets?', 'ijkOffsets' in firstPiece[0]);
    }
  }

  let candidateCount = 0;
  let prunedByMask = 0;
  let prunedByMod4 = 0;
  let prunedByConnectivity = 0;

  // Try all piece placements that cover targetIdx
  for (const [pid, oris] of piecesDb.entries()) {
    if ((state.remaining[pid] ?? 0) <= 0) continue;

    for (const o of oris) {
      for (const anchor of o.cells) {
        const t: [number, number, number] = [
          target[0] - anchor[0],
          target[1] - anchor[1],
          target[2] - anchor[2],
        ];

        const mask = placementMask(pre, o.cells as [number, number, number][], t, state.occ);
        if (mask === null) {
          prunedByMask++;
          continue;
        }

        candidateCount++;

        // Pruning: connectivity & multiple-of-4 (same as DFS2)
        const openAfter = pre.N - popcount(state.occ | mask);

        // Only log detailed prunes for shallow depths to avoid log spam
        if (openAfter % 4 !== 0) {
          prunedByMod4++;
          if (depth <= 2) {
            console.log('🚫 dfsSolvable prune: mod4', {
              depth,
              openAfter,
              occHex: state.occ.toString(16),
              maskHex: mask.toString(16),
            });
          }
          continue;
        }

        if (!remainingLooksConnected(pre, state.occ, mask)) {
          prunedByConnectivity++;
          if (depth <= 2) {
            console.log('🚫 dfsSolvable prune: connectivity', {
              depth,
              openAfter,
              occHex: state.occ.toString(16),
              maskHex: mask.toString(16),
            });
          }
          continue;
        }

        // Apply move
        state.occ |= mask;
        state.remaining[pid]--;

        // Recurse
        if (dfsSolvable(pre, piecesDb, state, depth + 1, maxDepth, deadlineMs)) {
          return true;
        }

        // Undo move (backtrack)
        state.occ &= ~mask;
        state.remaining[pid]++;
      }
    }
  }

  console.log('🔎 dfsSolvable at depth', depth, {
    targetIdx,
    candidateCount,
    prunedByMask,
    prunedByMod4,
    prunedByConnectivity
  });

  return false;
}

/**
 * DFS to count ALL solutions (doesn't early-exit)
 * Returns the number of solutions found (up to maxSolutions limit)
 */
function dfsCountSolutions(
  pre: ReturnType<typeof engine2Precompute>,
  piecesDb: PieceDB,
  state: PartialState,
  depth: number,
  maxDepth: number,
  deadlineMs: number,
  maxSolutions: number = 1000 // Stop after finding this many
): number {
  if (Date.now() > deadlineMs) return 0;
  if (depth > maxDepth) return 0;

  // If all cells are filled, it's a solution
  if (state.occ === pre.occMaskAll) {
    return 1;
  }

  // Select target cell (most constrained)
  const targetIdx = selectMostConstrained(pre, state.occ, state.remaining, piecesDb);
  if (targetIdx < 0) {
    // No open cell found, but occ != occMaskAll → dead end
    return 0;
  }

  const target = pre.cells[targetIdx];
  let totalSolutions = 0;

  // Try all piece placements that cover targetIdx
  for (const [pid, oris] of piecesDb.entries()) {
    if ((state.remaining[pid] ?? 0) <= 0) continue;
    if (totalSolutions >= maxSolutions) break; // Stop if we've found enough

    for (const o of oris) {
      for (const anchor of o.cells) {
        if (totalSolutions >= maxSolutions) break; // Stop if we've found enough

        const t: [number, number, number] = [
          target[0] - anchor[0],
          target[1] - anchor[1],
          target[2] - anchor[2],
        ];

        const mask = placementMask(pre, o.cells as [number, number, number][], t, state.occ);
        if (mask === null) continue;

        // Pruning: connectivity & multiple-of-4
        const openAfter = pre.N - popcount(state.occ | mask);
        if (openAfter % 4 !== 0) continue;
        if (!remainingLooksConnected(pre, state.occ, mask)) continue;

        // Apply move
        state.occ |= mask;
        state.remaining[pid]--;

        // Recurse and accumulate solutions
        totalSolutions += dfsCountSolutions(pre, piecesDb, state, depth + 1, maxDepth, deadlineMs, maxSolutions - totalSolutions);

        // Undo move (backtrack)
        state.occ &= ~mask;
        state.remaining[pid]++;
      }
    }
  }

  return totalSolutions;
}

function dfsWithForcedFirstMove(
  pre: ReturnType<typeof engine2Precompute>,
  state: PartialState,
  targetBitIndex: number,
  deadlineMs: number
): { solvable: boolean; move?: { pieceId: string; orientationId: string; anchorCell: IJK } } {
  // TODO: Implement real hint search logic
  // Outline:
  // 1. Compute candidate placements that cover targetBitIndex.
  // 2. For each such placement:
  //    - Check inventory & overlap.
  //    - Apply it to state (occupied + inventory).
  //    - Run dfsSolvable from there (normal DFS).
  //    - If dfsSolvable returns true:
  //      - Convert that placement back into:
  //        * pieceId
  //        * orientationId
  //        * anchorCell (IJK)
  //      - Return { solvable: true, move: { ... } }.
  //    - Otherwise, backtrack and try the next placement.
  // 3. If none work → { solvable: false }.

  return { solvable: false };
}

export type HintEngineSolvableResult = {
  solvable: boolean;
  mode: 'full' | 'lightweight';
  emptyCount: number;
  definiteFailure?: boolean;
  solutionCount?: number; // Number of solutions found (only in full mode)
};

export type HintEngineHintResult = {
  solvable: boolean;
  hintedPieceId?: string;
  hintedOrientationId?: string;
  hintedAnchorCell?: IJK;
  reason?: string; // Debug reason when solvable=false
};

export async function loadHintEnginePiecesDb(): Promise<PieceDB> {
  // For now: just delegate to existing loader
  const db = await loadAllPieces();
  return db;
}

export async function checkSolvableFromPartial(
  input: DLXCheckInput,
  piecesDb: PieceDB
): Promise<HintEngineSolvableResult> {
  console.log('📥 [checkSolvableFromPartial] Input:', {
    containerCells: input.containerCells.length,
    placedPieces: input.placedPieces.length,
    placedPieceIds: input.placedPieces.map(p => p.pieceId),
    remainingPieces: input.remainingPieces.length,
    mode: input.mode
  });
  
  const containerCells = input.containerCells.map(
    c => [c.i, c.j, c.k] as [number, number, number]
  );
  const pre = engine2Precompute({ cells: containerCells, id: input.mode }, piecesDb);

  const occ = buildOccMaskFromPlaced(pre, input.placedPieces);
  const remaining = buildRemainingInventory(input.remainingPieces);

  const emptyCount = pre.N - popcount(occ);
  const RUN_FULL_SOLVABILITY = emptyCount <= DLX_CONFIG.SOLVE_THRESHOLD;

  console.log('🧩 [HintEngine] partial state for solvability:', {
    N: pre.N,
    mode: input.mode,
    remaining,
    emptyCount,
    checkMode: RUN_FULL_SOLVABILITY ? 'full' : 'lightweight',
  });

  // ========== DLX PATH (for small states) ==========
  if (RUN_FULL_SOLVABILITY && emptyCount <= DLX_CONFIG.SOLVE_THRESHOLD) {
    console.log('🎯 [HintEngine] Using DLX for solvability check (N=', emptyCount, ')');
    try {
      // Build bitboards for DLX
      const bb = buildBitboards(pre);
      const occBlocks = bigintToBlocks(occ, bb.blockCount);
      const openBlocks = andNotBlocks(bb.occAllMask, occBlocks);
      
      // DEBUG: Check container mask
      let containerMaskBits = 0;
      forEachSetBit(bb.occAllMask, () => { containerMaskBits++; });
      let occBlocksBits = 0;
      forEachSetBit(occBlocks, () => { occBlocksBits++; });
      let openBlocksBits = 0;
      forEachSetBit(openBlocks, () => { openBlocksBits++; });
      
      console.log('🔍 [DLX Bitboard Check]:', {
        N: pre.N,
        containerMaskBits,  // Should equal N
        occBlocksBits,      // Should equal number of placed cells
        openBlocksBits,     // Should equal emptyCount
        emptyCount
      });

      // Run DLX exact cover (cast bb to expected type - IJK type compatibility)
      // For solvability, we only need to find ONE solution, not count them all
      const dlxResult = dlxExactCover({
        open: openBlocks,
        remaining,
        bb: bb as any, // Type cast for IJK compatibility between engine2 and dlx
        timeoutMs: DLX_CONFIG.TIMEOUT_MS,
        limit: 1, // Exit on first solution found
        wantWitness: false,
      });

      console.log('🎯 [DLX] Result:', {
        feasible: dlxResult.feasible,
        count: dlxResult.count,
        capped: dlxResult.capped,
        elapsedMs: dlxResult.elapsedMs,
      });
      
      // DEBUG: If infeasible, log the state DLX saw
      if (!dlxResult.feasible) {
        let openCellsCount = 0;
        forEachSetBit(openBlocks, () => { openCellsCount++; });
        console.error('❌ [DLX] INFEASIBLE STATE:', {
          N: pre.N,
          emptyCount,
          remaining,
          openCellsCount,
          containerCells: input.containerCells.length,
          placedPieces: input.placedPieces.length
        });
        
        // Check if there's a witness cache
        if (witnessCache) {
          console.warn('⚠️ [DLX] But witness cache exists!', {
            witnessSize: witnessCache.witness.length,
            usedPieces: witnessCache.usedIndices.size
          });
        }
      }

      return {
        solvable: dlxResult.feasible,
        mode: 'full',
        emptyCount,
        solutionCount: dlxResult.count,
      };
    } catch (err) {
      console.warn('⚠️ [DLX] Failed, falling back to DFS:', err);
      // Fall through to DFS
    }
  }

  if (!RUN_FULL_SOLVABILITY) {
    // LIGHTWEIGHT MODE – only detect definite impossibility vs still potential
    const liteOk = lightweightSolvabilityCheckGlobal(pre, occ);

    return {
      solvable: liteOk,           // "still has potential" if true
      mode: 'lightweight',
      emptyCount,
      definiteFailure: !liteOk,   // true = definitely impossible config
    };
  }

  // FULL MODE – try to actually prove solvable / not solvable with DFS
  const now = Date.now();
  const deadlineMs = now + 4000; // 4 seconds budget
  const maxDepth = 100;

  const state: PartialState = { occ, remaining };

  const solvable = dfsSolvable(pre, piecesDb, state, 0, maxDepth, deadlineMs);

  let solutionCount: number | undefined = undefined;
  
  // If solvable, count solutions (with reasonable limit)
  if (solvable) {
    const countState: PartialState = { 
      occ, 
      remaining: { ...remaining } // Copy to avoid mutation
    };
    const countDeadline = now + 2000; // 2 more seconds for counting
    solutionCount = dfsCountSolutions(pre, piecesDb, countState, 0, maxDepth, countDeadline, 1000);
    console.log(`🔢 [HintEngine] Found ${solutionCount}${solutionCount >= 1000 ? '+' : ''} solutions`);
  }

  // In full mode:
  //   solvable → we can confidently say it's solvable
  //   !solvable → we say "not solvable" for UI purposes
  return {
    solvable,
    mode: 'full',
    emptyCount,
    solutionCount,
    // In full mode, definiteFailure isn't needed; result.solvable already encodes it
  };
}

export async function computeHintFromPartial(
  input: DLXCheckInput,
  targetCell: IJK,
  piecesDb: PieceDB
): Promise<HintEngineHintResult> {
  const containerCells = input.containerCells.map(
    c => [c.i, c.j, c.k] as [number, number, number]
  );
  const pre = engine2Precompute({ cells: containerCells, id: input.mode }, piecesDb);

  const occ = buildOccMaskFromPlaced(pre, input.placedPieces);
  const remaining = buildRemainingInventory(input.remainingPieces);

  console.log('💡 [HintEngine] partial state for hint:', {
    N: pre.N,
    occMask: occ.toString(16),
    mode: input.mode,
    remaining,
    targetCell,
  });

  // Map target cell to a container-space coordinate
  const targetKey = keyIJK(targetCell);
  const targetIdx = pre.bitIndex.get(targetKey);
  
  // 🎯 PROBE C: Log target mapping and container verification
  console.log('🎯 [HINT-ENGINE] Target cell mapping:', {
    targetCell,
    targetKey,
    targetIdx,
    foundInContainer: targetIdx != null,
  });
  
  if (targetIdx == null) {
    console.warn('💡 [HintEngine] targetCell is not in container:', targetCell);
    return { solvable: false };
  }

  const target = pre.cells[targetIdx]; // [i,j,k] cell in container

  // Calculate empty cells for DLX threshold check
  const emptyCount = pre.N - popcount(occ);
  console.log('💡 [HintEngine] empty cell count:', emptyCount);

  // ========== DLX PATH (for small states) ==========
  if (emptyCount <= DLX_CONFIG.HINT_THRESHOLD) {
    console.log('🎯 [HintEngine] Using DLX for hint (N=', emptyCount, ')');
    try {
      // Build bitboards for DLX
      const bb = buildBitboards(pre);
      const occBlocks = bigintToBlocks(occ, bb.blockCount);
      const openBlocks = andNotBlocks(bb.occAllMask, occBlocks);

      // Check if we can reuse cached witness
      // Cache is valid if it exists and has unused pieces
      // State will change as hints are placed - that's expected!
      const occMaskHex = occ.toString(16);
      const remainingKey = JSON.stringify(remaining);
      const cacheValid = witnessCache && witnessCache.usedIndices.size < witnessCache.witness.length;
      
      if (cacheValid && witnessCache) {
        console.log('♻️ [WitnessCache] Reusing cached witness (pieces used:', witnessCache.usedIndices.size, '/', witnessCache.witness.length, ')');
        
        // Find an unused piece from cached witness that covers the target AND doesn't collide
        for (let i = 0; i < witnessCache.witness.length; i++) {
          if (witnessCache.usedIndices.has(i)) continue; // Already used
          
          const row = witnessCache.witness[i];
          const coversTarget = row.cellsIdx.includes(targetIdx);
          
          if (coversTarget) {
            // Check collision with occMask
            const collidingIdx = row.cellsIdx.filter(idx => ((occ >> BigInt(idx)) & 1n) === 1n);
            const collides = collidingIdx.length > 0;
            
            console.log("🔎 [WITNESS] candidate cellsIdx", { 
              pieceId: row.pid, 
              ori: row.ori, 
              cellsIdx: row.cellsIdx 
            });
            console.log("🚫 [WITNESS] candidate collision check", {
              pieceId: row.pid,
              ori: row.ori,
              collidingIdx,
              collides,
            });
            
            // Only accept if covers target AND doesn't collide
            if (!collides) {
              // Mark as used
              witnessCache.usedIndices.add(i);
              
              const anchorCell: IJK = Array.isArray(row.t)
                ? { i: row.t[0], j: row.t[1], k: row.t[2] }
                : row.t;
              
              console.log('✅ [WitnessCache] Found VALID piece covering target:', {
                pieceId: row.pid,
                ori: row.ori,
                anchor: anchorCell,
                witnessIndex: i,
                usedCount: witnessCache.usedIndices.size,
                totalWitness: witnessCache.witness.length
              });
              
              return {
                solvable: true,
                hintedPieceId: row.pid,
                hintedOrientationId: `${row.pid}-${String(row.ori).padStart(2, '0')}`,
                hintedAnchorCell: anchorCell,
              };
            } else {
              console.log('⚠️ [WITNESS] Skipping candidate - collides with placed pieces');
            }
          }
        }
        
        // No valid unused piece covers target - cache miss, need fresh witness
        console.log('⚠️ [WitnessCache] No valid cached piece covers target - invalidating cache and recomputing');
        witnessCache = null;
        // Fall through to generate new witness below
      }
      
      // Generate new witness from DLX
      console.log('🔄 [WitnessCache] Generating new witness from DLX');
      const dlxResult = dlxExactCover({
        open: openBlocks,
        remaining,
        bb: bb as any,
        timeoutMs: DLX_CONFIG.TIMEOUT_MS,
        limit: 1, // Only need one solution for hint
        wantWitness: true,
      });

      console.log('🎯 [DLX Hint] Result:', {
        feasible: dlxResult.feasible,
        witnessCount: dlxResult.witness?.length ?? 0,
        elapsedMs: dlxResult.elapsedMs,
        reason: dlxResult.reason,
      });

      if (dlxResult.feasible && dlxResult.witness && dlxResult.witness.length > 0) {
        // Cache the witness
        witnessCache = {
          witness: dlxResult.witness,
          occMask: occMaskHex,
          remainingKey,
          usedIndices: new Set<number>(),
        };
        console.log('💾 [WitnessCache] Cached new witness with', dlxResult.witness.length, 'pieces');
        
        // Find piece that covers the target cell AND doesn't collide
        console.log('🎯 [WITNESS] Checking coverage for targetIdx:', targetIdx);
        console.log('🎯 [WITNESS] Sample witness row cellsIdx:', dlxResult.witness[0]?.cellsIdx?.slice(0, 4));
        
        let hintRow = null;
        for (let idx = 0; idx < dlxResult.witness.length; idx++) {
          const row = dlxResult.witness[idx];
          const coversTarget = row.cellsIdx.includes(targetIdx);
          
          if (coversTarget) {
            // Check collision with occMask
            const collidingIdx = row.cellsIdx.filter(cellIdx => ((occ >> BigInt(cellIdx)) & 1n) === 1n);
            const collides = collidingIdx.length > 0;
            
            console.log('🔎 [WITNESS] Fresh witness candidate:', { pieceId: row.pid, ori: row.ori, idx });
            console.log('🚫 [WITNESS] Fresh witness collision check:', { collides, collidingIdx });
            
            if (!collides) {
              witnessCache!.usedIndices.add(idx);
              console.log('✅ [WITNESS] Found VALID piece covering targetIdx:', { pieceId: row.pid, ori: row.ori, idx });
              hintRow = row;
              break;
            } else {
              console.log('⚠️ [WITNESS] Skipping fresh candidate - collides with placed pieces');
            }
          }
        }
        
        // If no valid piece covers target, return no hint found
        if (!hintRow) {
          console.error('❌ [WITNESS] No valid piece in fresh witness covers target without collision', {
            targetIdx,
            targetCell: target,
            witnessLength: dlxResult.witness.length,
          });
          return {
            solvable: false,
            reason: 'No valid placement covers target cell',
          };
        }

        // Convert anchor from array [i,j,k] to object {i,j,k}
        const anchorCell: IJK = Array.isArray(hintRow.t)
          ? { i: hintRow.t[0], j: hintRow.t[1], k: hintRow.t[2] }
          : hintRow.t;

        console.log('✅ [DLX Hint] Selected placement from new witness:', {
          pieceId: hintRow.pid,
          ori: hintRow.ori,
          anchor: anchorCell,
          coversTarget: hintRow.cellsIdx.includes(targetIdx),
          witnessSize: dlxResult.witness.length
        });

        return {
          solvable: true,
          hintedPieceId: hintRow.pid,
          hintedOrientationId: `${hintRow.pid}-${String(hintRow.ori).padStart(2, '0')}`,
          hintedAnchorCell: anchorCell,
        };
      }

      // DLX says no solution exists - determine reason
      let reason = 'Configuration Unsolvable';
      if (dlxResult.reason === 'timeout') {
        reason = 'No Solution Found Within Time Limit';
        console.log('❌ [DLX Hint] Timeout after', dlxResult.elapsedMs, 'ms');
      } else if (!dlxResult.feasible) {
        reason = 'Configuration Unsolvable';
        console.log('❌ [DLX Hint] No solution exists from this state');
        console.log('💡 [DLX Hint] This can happen if manual placements created a dead end.');
        console.log('💡 [DLX Hint] Try: 1) Undo some pieces, or 2) Check solvability before requesting hints');
      }
      console.log('❌ [DLX Hint] Reason:', reason);
      return { solvable: false, reason };
    } catch (err) {
      console.warn('⚠️ [DLX Hint] Failed, falling back to DFS:', err);
      // Fall through to DFS-based hint logic
    }
  }

  // ========== FALLBACK: DFS-based hint logic (for larger states) ==========
  // Enumerate all placements that cover targetIdx and don't overlap occ
  // Check if piecesDb is a Map or plain object
  const entries = piecesDb instanceof Map 
    ? Array.from(piecesDb.entries())
    : Object.entries(piecesDb);

  // Create state for testing candidates
  const state: PartialState = { occ, remaining };
  const now = Date.now();
  const hintDeadlineMs = now + 3000; // 3 second budget for hint search
  const maxDepth = 100;

  let candidatesChecked = 0;
  let candidatesValidGeometry = 0;
  let candidatesSolvable = 0;

  // Extra debug counters
  let prunedByMaskAtHint = 0;
  let dfsReturnedFalse = 0;
  let dfsTimeouts = 0; // inferred from dfsSolvable early returns near deadline

  let totalPiecesAvailable = 0;
  for (const pid of Object.keys(remaining)) {
    totalPiecesAvailable += Math.max(0, remaining[pid] ?? 0);
  }
  
  if (totalPiecesAvailable === 0) {
    console.log('❌ [HintEngine] Reason: Piece Inventory Exhausted');
    return { solvable: false, reason: 'Piece Inventory Exhausted' };
  }

  for (const [pid, oris] of entries) {
    if ((remaining[pid] ?? 0) <= 0) continue;

    for (const o of oris as any[]) {
      // In piecesDb, each Oriented has: { id: number, cells: [number,number,number][] }
      const oriIndex: number = o.id ?? 0;
      const offsets = o.cells || o.ijkOffsets;
      if (!offsets) continue;

      for (const anchor of offsets) {
        candidatesChecked++;
        
        // Handle both {i,j,k} and [i,j,k] formats
        const anchorI = typeof anchor === 'object' && 'i' in anchor ? anchor.i : anchor[0];
        const anchorJ = typeof anchor === 'object' && 'j' in anchor ? anchor.j : anchor[1];
        const anchorK = typeof anchor === 'object' && 'k' in anchor ? anchor.k : anchor[2];

        const t: [number, number, number] = [
          target[0] - anchorI,
          target[1] - anchorJ,
          target[2] - anchorK,
        ];

        // Convert offsets to [number, number, number][] format for placementMask
        const orientedOffsets: [number, number, number][] = offsets.map(
          (off: any) => {
            if (typeof off === 'object' && 'i' in off) {
              return [off.i, off.j, off.k];
            }
            return off;
          }
        );

        const mask = placementMask(pre, orientedOffsets, t, state.occ);
        if (mask === null) {
          prunedByMaskAtHint++;
          continue;
        }

        candidatesValidGeometry++;

        // STAGE 2: Conditional solvability verification
        // Simulate applying the move
        const testState: PartialState = {
          occ: state.occ | mask,
          remaining: { ...state.remaining }
        };
        testState.remaining[pid] = (testState.remaining[pid] ?? 0) - 1;

        // Calculate empty cells AFTER placing this test piece
        const emptyCountAfter = pre.N - popcount(testState.occ);
        const RUN_FULL_SOLVABILITY = emptyCountAfter <= DLX_CONFIG.HINT_THRESHOLD;

        // -----------------------------------------------------------
        // STAGE 2 — Solvability logic based on empty cell threshold
        // -----------------------------------------------------------

        // CASE 1 — FULL solvability (≤ HINT_THRESHOLD empty cells AFTER placing hint)
        if (RUN_FULL_SOLVABILITY) {
          const beforeDfs = Date.now();
          const canFinish = dfsSolvable(pre, piecesDb, testState, 0, maxDepth, hintDeadlineMs);
          const afterDfs = Date.now();

          if (canFinish) {
            candidatesSolvable++;

            const anchorCell: IJK = { i: t[0], j: t[1], k: t[2] };
            const orientationId = `${pid}-${String(oriIndex).padStart(2, '0')}`;

            console.log('💡 [HintEngine] Found VERIFIED hint placement:', {
              pieceId: pid,
              orientationIndex: oriIndex,
              orientationId,
              anchorCell,
              stats: {
                candidatesChecked,
                candidatesValidGeometry,
                candidatesSolvable,
                prunedByMaskAtHint,
                dfsReturnedFalse,
                dfsTimeouts,
              }
            });
            
            // DEBUG: Log the state that DFS verified as solvable
            console.log('✅ [DFS] Verified state AFTER placing this hint:', {
              emptyCountAfter,
              remainingAfter: testState.remaining,
              occMask: testState.occ.toString(16)
            });

            return {
              solvable: true,
              hintedPieceId: pid,
              hintedOrientationId: orientationId,
              hintedAnchorCell: anchorCell,
            };
          } else {
            dfsReturnedFalse++;
            if (Date.now() > hintDeadlineMs && afterDfs >= hintDeadlineMs) {
              dfsTimeouts++;
            }
            // geometrically valid but DFS says no solution from here
            continue;
          }
        }

        // CASE 2 — LIGHTWEIGHT solvability (> HINT_THRESHOLD empty cells)
        const liteOk = lightweightSolvabilityCheck(pre, state.occ, mask);

        if (!liteOk) {
          // Not a safe move even under lightweight rules
          continue;
        }

        // lightweight solvability accepted → return first such candidate immediately
        const anchorCell: IJK = { i: t[0], j: t[1], k: t[2] };
        const orientationId = `${pid}-${String(oriIndex).padStart(2, '0')}`;

        console.warn('💡 [HintEngine] Lightweight hint accepted (no DFS)', {
          emptyCountAfter,
          pieceId: pid,
          orientationIndex: oriIndex,
          anchorCell
        });

        return {
          solvable: true,
          hintedPieceId: pid,
          hintedOrientationId: orientationId,
          hintedAnchorCell: anchorCell,
        };
      }
    }
  }

  // Determine detailed reason why no hint was found
  let reason = 'No Remaining Valid Moves';
  if (dfsTimeouts > 0) {
    reason = 'No Solution Found Within Time Limit';
  } else if (candidatesValidGeometry === 0) {
    reason = 'No Remaining Valid Moves';
  } else if (candidatesSolvable === 0 && dfsReturnedFalse > 0) {
    reason = 'Configuration Unsolvable';
  }

  console.warn('💡 [HintEngine] No placement found covering targetCell', {
    targetCell,
    reason,
    stats: {
      candidatesChecked,
      candidatesValidGeometry,
      candidatesSolvable,
      prunedByMaskAtHint,
      dfsReturnedFalse,
      dfsTimeouts,
    }
  });
  return { solvable: false, reason };
}
