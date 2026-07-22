// Choose Pieces solvability gate — can the chosen piece types (unlimited
// repeats) tile this container?
//
// Three stages, ordered by cost, matching the gate's asymmetry: refusing a
// player requires PROOF of impossibility; letting them play only needs a
// witness (or honest uncertainty).
//
//   1. parity math   (~µs)  — sound impossibility proofs, no search.
//                             cell-count % 4, and the FCC 2-coloring count:
//                             every piece placement shifts the color balance
//                             by a value in that piece's achievable set; if no
//                             combination of N placements can hit the
//                             container's imbalance, no tiling exists.
//   2. witness+proof (~3s)  — engine2 DFS with the restricted inventory in a
//                             SOUND configuration: tie-randomization off (its
//                             wraparound fix restored completeness, but the
//                             gate runs deterministic anyway), only the
//                             provably-sound mod-4 island prune active, no
//                             tail. A found solution is a real "yes"; and
//                             because the search is complete, "exhausted with
//                             none found" is a real impossibility proof
//                             ("no" → refuse). Measured: verdicts land in
//                             0.03–0.6s on typical shapes.
//   3. DLX backstop  (~4s)  — exact cover, only for TIMEOUTS on containers
//                             ≤ 48 empty cells (measured cutoff: DLX proofs
//                             are sub-second there and blow up beyond it).
//
// Anything still undecided returns 'unknown' — the caller allows play with a
// warning (policy: refuse only on proof). In practice that's mostly hollow
// shells and other genuinely hard containers.

import type { IJK } from '../../types/shape';
import { loadAllPieces } from '../../engines/piecesLoader';
import { engine2Precompute, engine2Solve, type PieceDB } from '../../engines/engine2';

export type ChosenSetVerdict = 'yes' | 'no' | 'unknown';

export type ChosenSetResult = {
  verdict: ChosenSetVerdict;
  /** Which stage decided (for logging/diagnostics). */
  decidedBy: 'parity' | 'witness' | 'exhaustion' | 'dlx' | 'budget';
  reason?: string;
};

// Engine piece DB, loaded once per session.
let piecesDbPromise: Promise<PieceDB> | null = null;
function getPiecesDb(): Promise<PieceDB> {
  if (!piecesDbPromise) piecesDbPromise = loadAllPieces();
  return piecesDbPromise;
}

// ---------------------------------------------------------------------------
// Stage 1 — parity feasibility (exported for tests)
// ---------------------------------------------------------------------------

/**
 * FCC 2-coloring feasibility. Color(c) = (i+j+k) mod 2. A piece orientation
 * covering a cells of color-0 contributes 2a-4 to (count0 - count1);
 * translating by an odd vector flips every cell's color, so each
 * orientation's contribution is achievable with either sign. A tiling by N
 * placements of the chosen types exists only if the container's imbalance is
 * the sum of N contributions, each drawn from the union of the chosen types'
 * achievable sets. Exact reachability via a tiny DP.
 *
 * Returns true when parity-FEASIBLE (may still be unsolvable), false when
 * parity PROVES impossibility.
 */
export function chosenSetParityFeasible(
  cells: IJK[],
  chosenPieceIds: string[],
  piecesDb: PieceDB
): boolean {
  if (cells.length === 0 || cells.length % 4 !== 0) return false;
  const n = cells.length / 4;

  let c0 = 0;
  for (const c of cells) if (((c.i + c.j + c.k) % 2 + 2) % 2 === 0) c0++;
  const target = c0 - (cells.length - c0); // imbalance D

  // Union of achievable per-placement contributions across chosen types.
  const contributions = new Set<number>();
  for (const pid of chosenPieceIds) {
    const oris = piecesDb.get(pid);
    if (!oris) continue;
    for (const o of oris) {
      let a = 0;
      for (const cell of o.cells) if ((((cell[0] + cell[1] + cell[2]) % 2) + 2) % 2 === 0) a++;
      const d = 2 * a - 4;
      contributions.add(d);
      contributions.add(-d); // odd translation flips colors
    }
  }
  if (contributions.size === 0) return false; // no usable pieces at all

  // DP: sums reachable with k placements (offset by 4n to stay non-negative).
  const span = 8 * n + 1;
  let reach = new Uint8Array(span);
  reach[4 * n] = 1; // sum 0
  for (let k = 0; k < n; k++) {
    const next = new Uint8Array(span);
    for (let s = 0; s < span; s++) {
      if (!reach[s]) continue;
      for (const d of contributions) {
        const t = s + d;
        if (t >= 0 && t < span) next[t] = 1;
      }
    }
    reach = next;
  }
  const idx = target + 4 * n;
  return idx >= 0 && idx < span && reach[idx] === 1;
}

// ---------------------------------------------------------------------------
// Stage 2 — witness hunt (exported for tests)
// ---------------------------------------------------------------------------

export type HuntOutcome = {
  found: boolean;
  /** True when the (complete, soundly-pruned) search exhausted the space —
   *  with found=false this is a real impossibility proof. */
  complete: boolean;
};

/** engine2 DFS over the restricted inventory in a SOUND configuration:
 *  deterministic order, only the mod-4 island prune, no tail. Found solution
 *  = real yes; exhaustion without a find = real no. Timeout = neither. */
export function chosenSetWitnessHunt(
  cells: IJK[],
  chosenPieceIds: string[],
  piecesDb: PieceDB,
  timeoutMs: number
): Promise<HuntOutcome> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (o: HuntOutcome) => {
      if (!done) {
        done = true;
        resolve(o);
      }
    };
    try {
      const tuples = cells.map((c) => [c.i, c.j, c.k] as [number, number, number]);
      const pre = engine2Precompute({ cells: tuples as any, id: 'chosen-set-gate' }, piecesDb);
      // One piece type can be placed at most N/4 times — also keeps counts
      // inside the engine's Zobrist inventory table (sound TT hashing).
      const maxCopies = Math.ceil(cells.length / 4);
      const inventory: Record<string, number> = {};
      for (const pid of chosenPieceIds) inventory[pid] = maxCopies;
      engine2Solve(
        pre,
        {
          maxSolutions: 1,
          timeoutMs,
          pauseOnSolution: false,
          randomizeTies: false,
          pieces: { allow: [...chosenPieceIds], inventory },
          // Soundness: only the mod-4 island prune (provably safe for 4-cell
          // pieces). color-residue/connectivity/neighbor-touch heuristics and
          // the DLX tail are off so exhaustion is a trustworthy proof — and
          // measured, this config is also FASTER at finding witnesses.
          pruning: { connectivity: false, multipleOf4: true, colorResidue: false, neighborTouch: false },
          tt: { enable: true, bytes: 16 * 1024 * 1024 },
          tailSwitch: { enable: false },
        },
        {
          onSolution: () => finish({ found: true, complete: false }),
          onDone: (s: any) => finish({ found: false, complete: s?.reason === 'complete' }),
        }
      );
      // Safety net: engine2 is cooperative but never leave the gate hanging.
      setTimeout(() => finish({ found: false, complete: false }), timeoutMs + 2000);
    } catch (err) {
      console.warn('⚠️ [ChosenSet] witness hunt failed:', err);
      finish({ found: false, complete: false });
    }
  });
}

// ---------------------------------------------------------------------------
// Stage 3 + composition
// ---------------------------------------------------------------------------

/** Measured cutoff: DLX empty-board proofs are sub-second up to ~40-48 cells
 *  and blow up beyond — above this the DLX backstop is skipped entirely. */
const DLX_MAX_CELLS = 48;

export async function checkChosenSetSolvable(
  containerCells: IJK[],
  chosenPieceIds: string[],
  opts: { witnessMs?: number; dlxMs?: number } = {}
): Promise<ChosenSetResult> {
  const { witnessMs = 3000, dlxMs = 4000 } = opts;
  if (chosenPieceIds.length === 0) {
    return { verdict: 'no', decidedBy: 'parity', reason: 'no pieces chosen' };
  }

  // Stage 1 — sound math, instant.
  try {
    const db = await getPiecesDb();
    if (!chosenSetParityFeasible(containerCells, chosenPieceIds, db)) {
      return { verdict: 'no', decidedBy: 'parity', reason: 'parity/counting proof' };
    }

    // Stage 2 — complete, soundly-pruned search: both verdicts trustworthy.
    const hunt = await chosenSetWitnessHunt(containerCells, chosenPieceIds, db, witnessMs);
    if (hunt.found) return { verdict: 'yes', decidedBy: 'witness' };
    if (hunt.complete) return { verdict: 'no', decidedBy: 'exhaustion', reason: 'complete search, no cover' };
  } catch (err) {
    console.warn('⚠️ [ChosenSet] parity/witness stages failed:', err);
  }

  // Stage 3 — DLX backstop for hunt TIMEOUTS on small containers only.
  if (containerCells.length <= DLX_MAX_CELLS) {
    try {
      const { dlxCheckSolvableEnhanced } = await import('../../engines/dlxSolver');
      const chosen = new Set(chosenPieceIds);
      const result = await dlxCheckSolvableEnhanced(
        {
          containerCells,
          placedPieces: [],
          emptyCells: containerCells,
          remainingPieces: 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('').map((pieceId) => ({
            pieceId,
            remaining: chosen.has(pieceId) ? ('infinite' as const) : 0,
          })),
          mode: 'customSet',
        },
        // The default emptyThreshold (90) exists for MID-game checks — the
        // gate is exactly the "empty board" question, so lift it (size is
        // already bounded by DLX_MAX_CELLS above).
        { timeoutMs: dlxMs, emptyThreshold: 100000 }
      );
      if (result.state === 'green') return { verdict: 'yes', decidedBy: 'dlx' };
      if (result.state === 'red') return { verdict: 'no', decidedBy: 'dlx', reason: 'exact-cover exhaustion' };
    } catch (err) {
      console.warn('⚠️ [ChosenSet] DLX stage failed:', err);
    }
  }

  return { verdict: 'unknown', decidedBy: 'budget', reason: 'search budget exhausted' };
}
