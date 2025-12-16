// src/engines/engine2/searchSpace.ts
// Search-space / combinatorics stats for a container + piece inventory.
// Uses the same "generate all legal placements inside container" idea as engine2 precompute,
// but does NOT run DFS and does NOT apply overlap/connectivity pruning.

import type { IJK } from "../types";
import type { PieceDB } from "./index"; // or wherever PieceDB lives

export type InventoryMode = "unique" | "identical" | "unlimited";

/**
 * Flexible inventory input:
 * - If you already have per-piece counts, pass counts.
 * - Else, choose a mode:
 *    unique: default count=1 per allowed piece
 *    identical: only one pieceId repeated
 *    unlimited: duplicates allowed; for stats we provide bounds (not a single "exact" number)
 */
export type InventorySpec = {
  mode?: InventoryMode;

  // optional: restrict which piece IDs are allowed at all
  allow?: string[];

  // optional: explicit counts override mode defaults
  // example: { A: 1, B: 1, ... } or { A: 5 } etc
  counts?: Record<string, number>;

  // identical-mode convenience
  identicalPieceId?: string;

  // unlimited-mode convenience: if you want a fixed piece count (defaults to cells/4)
  totalPieces?: number;
};

export type SearchSpaceStats = {
  containerCells: number;
  cellsDivBy4: boolean;
  piecesNeeded: number;

  allow: string[];
  counts: Record<string, number>;        // normalized per-piece counts (>=0 ints)
  mode: InventoryMode;

  // placement universe (ignoring collisions)
  placementsByPiece: Record<string, number>; // number of distinct absolute placements in the container
  totalPlacements: number;
  placementsPerTarget: {
    min: number;
    max: number;
    avg: number;
  };

  // Upper bounds (ignoring overlap between pieces):
  // These are intentionally labeled as bounds/approximations.
  upperBounds: {
    // Fixed inventory (unique/identical/explicit counts):
    // arrangements <= (K! / Π count!) * Π placements(pid)^(count(pid))
    fixedInventoryNoOverlap: ApproxNumber;

    // Unlimited-mode "choose any piece each step" bounds:
    // looseUpper <= (Σ placements(pid))^K
    // tighterUpper <= (max placements(pid))^K
    unlimitedNoOverlap?: {
      sumPlacementsPowK: ApproxNumber;
      maxPlacementsPowK: ApproxNumber;
    };
  };

  warnings: string[];
};

export type ApproxNumber = {
  log10: number;          // log10(value)
  sci: string;            // like "3.14e+1234"
  note: string;           // what it represents
};

export function computeSearchSpaceStats(
  container: { cells: IJK[]; id?: string },
  pieces: PieceDB,
  inventory: InventorySpec = {}
): SearchSpaceStats {
  const N = container.cells.length;
  const piecesNeeded = Math.floor(N / 4);
  const cellsDivBy4 = (N % 4) === 0;

  // ---- Map cell key -> index for fast containment check ----
  const bitIndex = new Map<string, number>();
  container.cells.forEach((c, idx) => bitIndex.set(key(c), idx));

  // ---- Normalize inventory ----
  const allow = normalizeAllowList(pieces, inventory.allow);
  const mode: InventoryMode = normalizeMode(inventory, allow);

  const counts = normalizeCounts({
    mode,
    allow,
    explicitCounts: inventory.counts,
    identicalPieceId: inventory.identicalPieceId,
    totalPieces: inventory.totalPieces ?? piecesNeeded,
  });

  // ---- Count distinct absolute placements per piece inside container ----
  // We mimic the engine2 placement generation:
  // for each piece orientation, for each anchor cell in orientation, for each target cell in container,
  // translate and check all 4 cells are inside container.
  //
  // Then we de-duplicate per piece per target by mask signature (like engine2 does per target),
  // BUT for "placementsByPiece", we need GLOBAL de-dup across all targets as well.
  // The easiest: maintain a Set signature per piece of "maskHex".
  const placementsByPiece: Record<string, number> = {};
  const placementsPerTargetCounts: number[] = Array.from({ length: N }, () => 0);

  // blockCount for bitmasking; we only need it to build mask signatures quickly.
  const blockCount = Math.ceil(N / 64);

  // For per-target de-dup: seen[targetIdx] = Set(sig)
  const seenByTarget: Array<Set<string>> = Array.from({ length: N }, () => new Set<string>());

  // For per-piece global de-dup: seenPiece[pid] = Set(maskHex)
  const seenByPiece: Record<string, Set<string>> = {};

  for (const pid of allow) {
    placementsByPiece[pid] = 0;
    seenByPiece[pid] = new Set<string>();
  }

  for (const pid of allow) {
    const oris = pieces.get(pid);
    if (!oris) continue;

    for (const o of oris) {
      for (const anchor of o.cells) {
        for (let targetIdx = 0; targetIdx < N; targetIdx++) {
          const tCell = container.cells[targetIdx];
          const dx = tCell[0] - anchor[0];
          const dy = tCell[1] - anchor[1];
          const dz = tCell[2] - anchor[2];

          // Build mask
          const mask = new BigUint64Array(blockCount);
          let ok = true;

          for (const c of o.cells) {
            const abs: IJK = [c[0] + dx, c[1] + dy, c[2] + dz];
            const idx = bitIndex.get(key(abs));
            if (idx === undefined) { ok = false; break; }
            setBit(mask, idx);
          }
          if (!ok) continue;

          const maskHex = blocksToHex(mask);
          const sigTarget = `${pid}:${o.id}:${maskHex}`;

          // Per-target de-dup (matches engine2 spirit; avoids anchor-collisions)
          if (seenByTarget[targetIdx].has(sigTarget)) continue;
          seenByTarget[targetIdx].add(sigTarget);

          // Count this target placement for "placements per target"
          placementsPerTargetCounts[targetIdx]++;

          // For global placements-per-piece, de-dup on mask alone (absolute placement)
          const set = seenByPiece[pid];
          if (!set.has(maskHex)) {
            set.add(maskHex);
            placementsByPiece[pid]++;
          }
        }
      }
    }
  }

  const totalPlacements = sum(Object.values(placementsByPiece));
  const minPT = placementsPerTargetCounts.length ? Math.min(...placementsPerTargetCounts) : 0;
  const maxPT = placementsPerTargetCounts.length ? Math.max(...placementsPerTargetCounts) : 0;
  const avgPT = placementsPerTargetCounts.length
    ? (placementsPerTargetCounts.reduce((a, b) => a + b, 0) / placementsPerTargetCounts.length)
    : 0;

  // ---- Build bounds (ignoring overlap between pieces) ----
  const warnings: string[] = [];

  if (!cellsDivBy4) {
    warnings.push(`Container has ${N} cells which is not divisible by 4; "piecesNeeded"=${piecesNeeded} is floor(N/4).`);
  }

  const K = inventory.totalPieces ?? piecesNeeded;

  // For fixed inventory bounds we want counts that sum to K (or at least be explicit)
  const sumCounts = sum(Object.values(counts));

  if (mode !== "unlimited" && sumCounts !== K) {
    warnings.push(`Fixed-inventory mode but counts sum to ${sumCounts} while totalPieces=${K}. Bounds use your counts as-is.`);
  }

  // Fixed-inventory no-overlap upper bound:
  // arrangements <= (K! / Π count!) * Π placements(pid)^(count(pid))
  // If placements(pid)=0 and count>0 => bound becomes 0 (correct: impossible).
  const fixedBound = computeFixedInventoryNoOverlapBound(counts, placementsByPiece, K);

  // Unlimited mode: you haven't fixed counts, so we provide two bounds:
  // (Σ placements)^K and (max placements)^K
  let unlimitedBounds: SearchSpaceStats["upperBounds"]["unlimitedNoOverlap"] | undefined;
  if (mode === "unlimited") {
    const sumPlacements = totalPlacements;
    const maxPlacements = Math.max(0, ...Object.values(placementsByPiece));
    unlimitedBounds = {
      sumPlacementsPowK: powApprox(sumPlacements, K, `(Σ placements)^K (very loose; ignores collisions & repeated-use constraints)`),
      maxPlacementsPowK: powApprox(maxPlacements, K, `(max placements)^K (tighter than sum; still ignores collisions)`),
    };
  }

  return {
    containerCells: N,
    cellsDivBy4,
    piecesNeeded,
    allow,
    counts,
    mode,
    placementsByPiece,
    totalPlacements,
    placementsPerTarget: { min: minPT, max: maxPT, avg: avgPT },
    upperBounds: {
      fixedInventoryNoOverlap: fixedBound,
      unlimitedNoOverlap: unlimitedBounds,
    },
    warnings,
  };
}

// ----------------- Inventory normalization -----------------

function normalizeAllowList(pieces: PieceDB, allow?: string[]): string[] {
  const all = [...pieces.keys()].sort();
  if (!allow || allow.length === 0) return all;
  const set = new Set(allow);
  return all.filter((p) => set.has(p));
}

function normalizeMode(inv: InventorySpec, allow: string[]): InventoryMode {
  if (inv.counts && Object.keys(inv.counts).length > 0) return inv.mode ?? "unique";
  if (inv.mode) return inv.mode;
  if (inv.identicalPieceId) return "identical";
  // default
  return "unique";
}

function normalizeCounts(args: {
  mode: InventoryMode;
  allow: string[];
  explicitCounts?: Record<string, number>;
  identicalPieceId?: string;
  totalPieces: number;
}): Record<string, number> {
  const { mode, allow, explicitCounts, identicalPieceId, totalPieces } = args;

  // explicit counts win (clamped)
  if (explicitCounts && Object.keys(explicitCounts).length > 0) {
    const out: Record<string, number> = {};
    for (const pid of allow) out[pid] = 0;
    for (const [pid, c] of Object.entries(explicitCounts)) {
      if (!allow.includes(pid)) continue;
      out[pid] = Math.max(0, Math.floor(c));
    }
    return out;
  }

  // mode defaults
  const out: Record<string, number> = {};
  for (const pid of allow) out[pid] = 0;

  if (mode === "unique") {
    for (const pid of allow) out[pid] = 1;
    return out;
  }

  if (mode === "identical") {
    const pid = identicalPieceId ?? allow[0];
    if (pid && allow.includes(pid)) out[pid] = Math.max(0, Math.floor(totalPieces));
    return out;
  }

  // unlimited:
  // We don't know actual per-piece usage, but we still return something sane for storage:
  // keep counts at 0 (meaning "not fixed"), and let bounds use K with placements totals.
  return out;
}

// ----------------- Math helpers (log-space) -----------------

function computeFixedInventoryNoOverlapBound(
  counts: Record<string, number>,
  placementsByPiece: Record<string, number>,
  K: number
): ApproxNumber {
  // log10 = log10(K!) - Σ log10(count!) + Σ count*log10(placements)
  let log10v = log10Factorial(K);
  for (const c of Object.values(counts)) log10v -= log10Factorial(c);

  for (const [pid, c] of Object.entries(counts)) {
    if (c <= 0) continue;
    const p = placementsByPiece[pid] ?? 0;
    if (p <= 0) {
      return { log10: Number.NEGATIVE_INFINITY, sci: "0", note: `0 (piece ${pid} has 0 placements but count=${c})` };
    }
    log10v += c * Math.log10(p);
  }

  return toApprox(log10v, `(K! / Π count!) * Π placements(pid)^(count(pid))  [ignores overlap]`);
}

function powApprox(base: number, exp: number, note: string): ApproxNumber {
  if (exp <= 0) return { log10: 0, sci: "1", note };
  if (base <= 0) return { log10: Number.NEGATIVE_INFINITY, sci: "0", note };
  const log10v = exp * Math.log10(base);
  return toApprox(log10v, note);
}

function toApprox(log10v: number, note: string): ApproxNumber {
  if (!Number.isFinite(log10v)) return { log10: log10v, sci: "0", note };
  const e = Math.floor(log10v);
  const m = Math.pow(10, log10v - e);
  // keep it readable
  const mant = m.toFixed(3);
  return { log10: log10v, sci: `${mant}e${e >= 0 ? "+" : ""}${e}`, note };
}

// log10(n!) exact by summation (fast enough for your typical K sizes).
// If you ever go huge, you can replace with Stirling.
function log10Factorial(n: number): number {
  if (n <= 1) return 0;
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log10(i);
  return s;
}

// ----------------- Bitmask utilities (minimal) -----------------

function key(c: IJK): string { return `${c[0]},${c[1]},${c[2]}`; }

function setBit(b: BigUint64Array, idx: number) {
  const bi = (idx / 64) | 0;
  const bit = BigInt(idx % 64);
  b[bi] |= (1n << bit);
}

function blocksToHex(b: BigUint64Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16) + "|";
  return s;
}

function sum(xs: number[]): number { return xs.reduce((a, b) => a + b, 0); }
