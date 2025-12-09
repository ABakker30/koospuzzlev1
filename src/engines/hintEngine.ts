// src/engines/hintEngine.ts
// Lightweight "hint / solvability" engine entry point.
// This will eventually reuse engine2's precompute + placement logic for partial boards.

import type { IJK } from '../types/shape';
import type { DLXCheckInput } from './dlxSolver';
import type { PieceDB } from './dfs2';
import { engine2Precompute } from './engine2';
import { loadAllPieces } from './piecesLoader';

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

function popcount(x: bigint): number {
  let n = 0;
  while (x) {
    x &= x - 1n;
    n++;
  }
  return n;
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

  for (const p of placedPieces) {
    for (const cell of p.cells) {
      const idx = pre.bitIndex.get(keyIJK(cell));
      if (idx != null) {
        occ |= 1n << BigInt(idx);
      }
    }
  }

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
};

export type HintEngineHintResult = {
  solvable: boolean;
  hintedPieceId?: string;
  hintedOrientationId?: string;
  hintedAnchorCell?: IJK;
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
  const containerCells = input.containerCells.map(
    c => [c.i, c.j, c.k] as [number, number, number]
  );
  const pre = engine2Precompute({ cells: containerCells, id: input.mode }, piecesDb);

  const occ = buildOccMaskFromPlaced(pre, input.placedPieces);
  const remaining = buildRemainingInventory(input.remainingPieces);

  const emptyCount = pre.N - popcount(occ);
  const RUN_FULL_SOLVABILITY = emptyCount <= 30;

  console.log('🧩 [HintEngine] partial state for solvability:', {
    N: pre.N,
    mode: input.mode,
    remaining,
    emptyCount,
    checkMode: RUN_FULL_SOLVABILITY ? 'full' : 'lightweight',
  });

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

  // In full mode:
  //   solvable → we can confidently say it's solvable
  //   !solvable → we say "not solvable" for UI purposes
  return {
    solvable,
    mode: 'full',
    emptyCount,
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
  if (targetIdx == null) {
    console.warn('💡 [HintEngine] targetCell is not in container:', targetCell);
    return { solvable: false };
  }

  const target = pre.cells[targetIdx]; // [i,j,k] cell in container

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

  // Compute empty cell count and decide whether to run full solvability checks
  const emptyCount = pre.N - popcount(occ);
  const RUN_FULL_SOLVABILITY = emptyCount <= 30;
  console.log('💡 [HintEngine] empty cell count:', emptyCount, '| Run full solvability:', RUN_FULL_SOLVABILITY);

  let candidatesChecked = 0;
  let candidatesValidGeometry = 0;
  let candidatesSolvable = 0;

  // Extra debug counters
  let prunedByMaskAtHint = 0;
  let dfsReturnedFalse = 0;
  let dfsTimeouts = 0; // inferred from dfsSolvable early returns near deadline

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

        // -----------------------------------------------------------
        // STAGE 2 — Solvability logic based on empty cell threshold
        // -----------------------------------------------------------

        // CASE 1 — FULL solvability (≤ 30 empty cells)
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

        // CASE 2 — LIGHTWEIGHT solvability (> 30 empty cells)
        const liteOk = lightweightSolvabilityCheck(pre, state.occ, mask);

        if (!liteOk) {
          // Not a safe move even under lightweight rules
          continue;
        }

        // lightweight solvability accepted → return first such candidate immediately
        const anchorCell: IJK = { i: t[0], j: t[1], k: t[2] };
        const orientationId = `${pid}-${String(oriIndex).padStart(2, '0')}`;

        console.warn('💡 [HintEngine] Lightweight hint accepted (no DFS)', {
          emptyCount,
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

  console.warn('💡 [HintEngine] No placement found covering targetCell', {
    targetCell,
    stats: {
      candidatesChecked,
      candidatesValidGeometry,
      candidatesSolvable,
      prunedByMaskAtHint,
      dfsReturnedFalse,
      dfsTimeouts,
    }
  });
  return { solvable: false };
}
