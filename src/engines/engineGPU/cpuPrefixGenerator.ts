// src/engines/engineGPU/cpuPrefixGenerator.ts
// CPU-based prefix generator using engine2's MRV and candsByTarget
// This generates high-quality prefixes by using the CPU solver's proven search strategy

import type { IJK } from "../types";
import type { CompiledPuzzle, SearchPrefix } from "./types";
import { engine2Precompute, buildBitboards, type Blocks, type CandMask } from "../engine2";

export interface CPUPrefixConfig {
  targetDepth: number;      // K - number of pieces to place
  targetCount: number;      // Max prefixes to generate
  pieceOrder?: number[];    // Optional piece priority (index = pieceBit, value = priority)
  useMRV?: boolean;         // Use MRV cell selection (default true)
}

export interface CPUPrefixResult {
  prefixes: SearchPrefix[];
  depth: number;
  generationMs: number;
}

/**
 * Generate prefixes using CPU solver's MRV strategy
 * This creates high-quality starting points for GPU search
 */
export function generateCPUPrefixes(
  container: { cells: IJK[]; id?: string },
  pieces: Map<string, { id: number; cells: IJK[] }[]>,
  compiled: CompiledPuzzle,
  config: CPUPrefixConfig
): CPUPrefixResult {
  const startTime = performance.now();
  const { targetDepth, targetCount, pieceOrder, useMRV = true } = config;
  
  console.log(`🧠 [CPUPrefix] Starting CPU-based prefix generation...`);
  console.log(`🧠 [CPUPrefix] Config:`, { targetDepth, targetCount, useMRV, hasPieceOrder: !!pieceOrder });
  
  // Use engine2's precompute and bitboard builder
  const pre = engine2Precompute(container, pieces);
  const bb = buildBitboards(pre);
  
  console.log(`🧠 [CPUPrefix] Precomputed:`, { 
    cells: pre.N, 
    pieces: pieces.size,
    blockCount: bb.blockCount 
  });
  
  const prefixes: SearchPrefix[] = [];
  const laneCount = compiled.cellsLaneCount;
  
  // Build piece order map for sorting candidates
  const pieceOrderMap = new Map<string, number>();
  if (pieceOrder) {
    compiled.pieceIds.forEach((pid, bit) => {
      pieceOrderMap.set(pid, pieceOrder[bit] ?? 999);
    });
  }
  
  // Sort candidates by piece order if provided
  if (pieceOrder) {
    for (let t = 0; t < pre.N; t++) {
      bb.candsByTarget[t].sort((a, b) => {
        const orderA = pieceOrderMap.get(a.pid) ?? 999;
        const orderB = pieceOrderMap.get(b.pid) ?? 999;
        return orderA - orderB;
      });
    }
  }
  
  // State for DFS
  interface Frame {
    targetIdx: number;
    candIdx: number;
    placed?: CandMask;
  }
  
  const stack: Frame[] = [];
  let occBlocks: Blocks = zeroBlocks(bb.blockCount);
  const remaining: Record<string, number> = {};
  for (const pid of pieces.keys()) {
    remaining[pid] = 1;
  }
  
  // Bitboard helpers (inline for performance)
  function zeroBlocks(count: number): Blocks {
    return new BigUint64Array(count);
  }
  
  // cloneBlocks removed - unused
  
  function orBlocks(a: Blocks, b: Blocks): Blocks {
    const r = new BigUint64Array(a.length);
    for (let i = 0; i < a.length; i++) r[i] = a[i] | b[i];
    return r;
  }
  
  function isFits(occ: Blocks, mask: Blocks): boolean {
    for (let i = 0; i < occ.length; i++) {
      if ((occ[i] & mask[i]) !== 0n) return false;
    }
    return true;
  }
  
  function testBitInverse(occ: Blocks, idx: number): boolean {
    const bi = (idx / 64) | 0;
    const bit = BigInt(idx % 64);
    return (occ[bi] & (1n << bit)) === 0n;
  }
  
  // MRV: Select most constrained cell (fewest valid candidates)
  function selectMostConstrained(): number {
    let bestIdx = -1;
    let bestCount = Number.POSITIVE_INFINITY;
    
    for (let idx = 0; idx < pre.N; idx++) {
      if (!testBitInverse(occBlocks, idx)) continue;
      
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
        if (bestCount === 0) return idx;
      }
    }
    return bestIdx;
  }
  
  // Naive: Select first open cell
  function selectFirstOpen(): number {
    for (let idx = 0; idx < pre.N; idx++) {
      if (testBitInverse(occBlocks, idx)) return idx;
    }
    return -1;
  }
  
  // Convert current state to GPU prefix format
  function emitPrefix(): void {
    // Build cellsMask (open cells) in GPU format
    const cellsMask = new BigUint64Array(laneCount);
    for (let i = 0; i < laneCount; i++) {
      cellsMask[i] = ~occBlocks[i] & (i < bb.blockCount ? bb.occAllMask[i] : 0n);
    }
    
    // Build piecesMask (available pieces)
    let piecesMask = 0;
    for (const [pid, count] of Object.entries(remaining)) {
      if (count > 0) {
        const bit = compiled.pieceIndexMap.get(pid);
        if (bit !== undefined) {
          piecesMask |= (1 << bit);
        }
      }
    }
    
    // Build choices as global embedding indices
    // We need to map CPU placements to GPU embedding indices
    const choices: number[] = [];
    for (const frame of stack) {
      if (frame.placed) {
        // Find matching embedding in GPU compiled data
        const embIdx = findGPUEmbeddingIndex(frame.placed, compiled);
        if (embIdx >= 0) {
          choices.push(embIdx);
        }
      }
    }
    
    // Find next cell to cover for GPU continuation
    const nextCellIndex = useMRV ? selectMostConstrained() : selectFirstOpen();
    
    prefixes.push({
      cellsMask,
      piecesMask,
      depth: stack.filter(f => f.placed).length,
      nextCellIndex: nextCellIndex >= 0 ? nextCellIndex : 0,
      choices,
    });
  }
  
  // Find GPU embedding index for a CPU placement
  function findGPUEmbeddingIndex(cm: CandMask, compiled: CompiledPuzzle): number {
    const pieceBit = compiled.pieceIndexMap.get(cm.pid);
    if (pieceBit === undefined) return -1;
    
    // Find the minCellIndex of this placement
    const minCell = Math.min(...cm.cellsIdx);
    const bucket = compiled.embeddingBuckets[minCell];
    
    for (let i = 0; i < bucket.embeddings.length; i++) {
      const emb = bucket.embeddings[i];
      if (emb.pieceBit === pieceBit && emb.orientationId === cm.ori) {
        // Check if translation matches by comparing cell masks
        // The embedding's minCellIndex should match
        if (emb.minCellIndex === minCell) {
          return bucket.offset + i;
        }
      }
    }
    return -1;
  }
  
  // Collect valid candidates for a cell
  function getValidCandidates(cellIdx: number): CandMask[] {
    const cands = bb.candsByTarget[cellIdx];
    const valid: CandMask[] = [];
    for (const cm of cands) {
      if ((remaining[cm.pid] ?? 0) <= 0) continue;
      if (!isFits(occBlocks, cm.mask)) continue;
      valid.push(cm);
    }
    return valid;
  }
  
  // Random number generator (simple LCG for speed)
  let rngSeed = Date.now() ^ 0xDEADBEEF;
  function random(): number {
    rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0;
    return rngSeed / 0x100000000;
  }
  
  // Shuffle array in place
  function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  
  // Generate one independent prefix using random MRV sampling
  function generateOnePrefix(): boolean {
    // Reset state
    occBlocks = zeroBlocks(bb.blockCount);
    for (const pid of pieces.keys()) {
      remaining[pid] = 1;
    }
    stack.length = 0;
    
    // Place K pieces using MRV + random candidate selection
    for (let step = 0; step < targetDepth; step++) {
      // Select cell using MRV (or first-open)
      const cellIdx = useMRV ? selectMostConstrained() : selectFirstOpen();
      if (cellIdx < 0) return false; // No valid cell - dead end
      
      // Get all valid candidates for this cell
      const validCands = getValidCandidates(cellIdx);
      if (validCands.length === 0) return false; // Dead end
      
      // Randomly pick one candidate
      const cm = validCands[Math.floor(random() * validCands.length)];
      
      // Place it
      occBlocks = orBlocks(occBlocks, cm.mask);
      remaining[cm.pid]--;
      stack.push({ targetIdx: cellIdx, candIdx: 0, placed: cm });
    }
    
    // Successfully placed K pieces - emit prefix
    emitPrefix();
    return true;
  }
  
  // Main loop: generate independent prefixes
  let attempts = 0;
  const maxAttempts = targetCount * 10; // Allow some failures
  
  console.log(`🧠 [CPUPrefix] Generating ${targetCount} independent prefixes (random MRV sampling)...`);
  
  while (prefixes.length < targetCount && attempts < maxAttempts) {
    attempts++;
    generateOnePrefix();
  }
  
  const generationMs = performance.now() - startTime;
  const successRate = prefixes.length > 0 ? (prefixes.length / attempts * 100).toFixed(1) : '0';
  console.log(`🧠 [CPUPrefix] Generated ${prefixes.length} prefixes in ${generationMs.toFixed(1)}ms (${attempts} attempts, ${successRate}% success)`);
  
  return {
    prefixes,
    depth: targetDepth,
    generationMs,
  };
}
