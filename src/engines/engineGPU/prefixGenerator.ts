// src/engines/engineGPU/prefixGenerator.ts
// CPU-side prefix generation: enumerate k-level search tree prefixes
// Each prefix becomes a starting state for a GPU thread

import type { CompiledPuzzle, SearchPrefix } from "./types";

export interface PrefixGeneratorConfig {
  targetDepth?: number;           // Fixed k (if set, overrides targetCount)
  targetCount?: number;           // Target prefix count (default: 2_000_000)
  maxDepth?: number;              // Maximum depth to explore (default: 10)
  onProgress?: (depth: number, prefixCount: number) => void;
}

export interface PrefixGeneratorResult {
  prefixes: SearchPrefix[];
  depth: number;
  generationMs: number;
}

/**
 * Generate search prefixes by DFS enumeration to depth k
 * 
 * The key insight from the Puzzle Processor paper:
 * - Each prefix is a partial assignment (first k piece placements)
 * - Each prefix defines a unique starting q mask
 * - GPU threads run the same tail solver from different prefixes
 */
export function generatePrefixes(
  compiled: CompiledPuzzle,
  config: PrefixGeneratorConfig = {}
): PrefixGeneratorResult {
  const startTime = performance.now();
  
  console.log('🔄 [PrefixGen] Starting prefix generation...');
  console.log('🔄 [PrefixGen] Config:', { 
    targetDepth: config.targetDepth, 
    targetCount: config.targetCount,
    maxDepth: config.maxDepth 
  });
  console.log('🔄 [PrefixGen] Compiled puzzle:', {
    numCells: compiled.numCells,
    numPieces: compiled.numPieces,
    cellsLaneCount: compiled.cellsLaneCount,
    buckets: compiled.embeddingBuckets?.length ?? 0,
  });
  
  const targetCount = config.targetCount ?? 2_000_000;
  const maxDepth = config.maxDepth ?? 10;
  
  // If fixed depth specified, use it
  if (config.targetDepth !== undefined) {
    console.log(`🔄 [PrefixGen] Using fixed depth: ${config.targetDepth}`);
    const prefixes = enumeratePrefixesAtDepth(compiled, config.targetDepth);
    return {
      prefixes,
      depth: config.targetDepth,
      generationMs: performance.now() - startTime,
    };
  }
  
  // Otherwise, find depth that produces ~targetCount prefixes
  let depth = 1;
  let prefixes: SearchPrefix[] = [];
  
  while (depth <= maxDepth) {
    const newPrefixes = enumeratePrefixesAtDepth(compiled, depth);
    config.onProgress?.(depth, newPrefixes.length);
    
    console.log(`📊 Prefix depth ${depth}: ${newPrefixes.length} prefixes`);
    
    if (newPrefixes.length >= targetCount || newPrefixes.length === 0) {
      prefixes = newPrefixes;
      break;
    }
    
    // If we're close enough (within 50%), use this depth
    if (newPrefixes.length >= targetCount * 0.5) {
      prefixes = newPrefixes;
      break;
    }
    
    prefixes = newPrefixes;
    depth++;
  }
  
  const generationMs = performance.now() - startTime;
  
  console.log(`✅ Generated ${prefixes.length} prefixes at depth ${depth} in ${generationMs.toFixed(1)}ms`);
  
  return { prefixes, depth, generationMs };
}

/**
 * Enumerate all valid prefixes at exactly depth k
 */
function enumeratePrefixesAtDepth(
  compiled: CompiledPuzzle,
  depth: number
): SearchPrefix[] {
  console.log(`🔄 [PrefixEnum] Enumerating prefixes at depth ${depth}...`);
  const prefixes: SearchPrefix[] = [];
  const laneCount = compiled.cellsLaneCount;
  
  // Initial state: all cells and pieces available
  const initialCellsMask = new BigUint64Array(laneCount);
  for (let i = 0; i < compiled.numCells; i++) {
    const lane = Math.floor(i / 64);
    const bit = i % 64;
    initialCellsMask[lane] |= (1n << BigInt(bit));
  }
  
  const initialPiecesMask = (1 << compiled.numPieces) - 1; // All pieces available
  console.log(`🔄 [PrefixEnum] Initial state: ${compiled.numCells} cells, piecesMask=${initialPiecesMask.toString(2)}`);
  
  // DFS enumeration
  const stack: PrefixState[] = [{
    cellsMask: initialCellsMask,
    piecesMask: initialPiecesMask,
    depth: 0,
    choices: [],
  }];
  
  let iterations = 0;
  const maxIterations = 5_000_000; // Safety limit
  const maxPrefixes = 100_000; // Increased for better search coverage
  let lastLog = performance.now();
  
  while (stack.length > 0) {
    iterations++;
    
    // Progress logging every second
    if (performance.now() - lastLog > 1000) {
      console.log(`🔄 [PrefixEnum] Progress: ${iterations} iterations, ${prefixes.length} prefixes, stack=${stack.length}`);
      lastLog = performance.now();
    }
    
    // Safety limit - iterations
    if (iterations > maxIterations) {
      console.warn(`⚠️ [PrefixEnum] Hit iteration limit (${maxIterations}), returning ${prefixes.length} prefixes`);
      break;
    }
    
    // Safety limit - prefix count (to fit in GPU memory)
    if (prefixes.length >= maxPrefixes) {
      console.log(`✅ [PrefixEnum] Reached prefix cap (${maxPrefixes}), stopping enumeration`);
      break;
    }
    const state = stack.pop()!;
    
    // If we've reached target depth, emit this as a prefix
    if (state.depth === depth) {
      const nextCell = findFirstOpenCell(state.cellsMask, laneCount, compiled.numCells);
      if (nextCell >= 0) {
        prefixes.push({
          cellsMask: state.cellsMask.slice() as BigUint64Array,
          piecesMask: state.piecesMask,
          depth: state.depth,
          nextCellIndex: nextCell,
          choices: [...state.choices],
        });
      }
      continue;
    }
    
    // Find next cell to cover (lowest index open cell)
    const targetCell = findFirstOpenCell(state.cellsMask, laneCount, compiled.numCells);
    if (targetCell < 0) {
      // All cells covered - this is a solution at depth < k (rare but possible)
      continue;
    }
    
    // Get embeddings for this cell
    const bucket = compiled.embeddingBuckets[targetCell];
    
    // Shuffle embedding indices for diversity (instead of always DFS order)
    const indices = Array.from({ length: bucket.embeddings.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    // Try each valid embedding in random order
    for (const embIdx of indices) {
      const emb = bucket.embeddings[embIdx];
      
      // Check if piece is available
      if ((state.piecesMask & (1 << emb.pieceBit)) === 0) {
        continue;
      }
      
      // Check if all cells are available (embedding fits)
      if (!embeddingFits(state.cellsMask, emb.cellsMask, laneCount)) {
        continue;
      }
      
      // Apply embedding: XOR masks
      const newCellsMask = xorMasks(state.cellsMask, emb.cellsMask, laneCount);
      const newPiecesMask = state.piecesMask ^ (1 << emb.pieceBit);
      
      // Store GLOBAL embedding index (bucket.offset + local index)
      const globalEmbIdx = bucket.offset + embIdx;
      
      stack.push({
        cellsMask: newCellsMask,
        piecesMask: newPiecesMask,
        depth: state.depth + 1,
        choices: [...state.choices, globalEmbIdx],
      });
    }
  }
  
  return prefixes;
}

interface PrefixState {
  cellsMask: BigUint64Array;
  piecesMask: number;
  depth: number;
  choices: number[];
}

/**
 * Find the first open (available) cell index
 * Returns -1 if all cells are covered
 */
function findFirstOpenCell(
  cellsMask: BigUint64Array,
  laneCount: number,
  numCells: number
): number {
  for (let lane = 0; lane < laneCount; lane++) {
    if (cellsMask[lane] !== 0n) {
      // Find lowest set bit
      const word = cellsMask[lane];
      const lowBit = word & (-word);
      const bitPos = countTrailingZeros64(lowBit);
      const cellIndex = lane * 64 + bitPos;
      
      if (cellIndex < numCells) {
        return cellIndex;
      }
    }
  }
  return -1;
}

/**
 * Check if embedding fits (all cells available)
 * fits = (cellsMask & embMask) == embMask
 */
function embeddingFits(
  cellsMask: BigUint64Array,
  embMask: BigUint64Array,
  laneCount: number
): boolean {
  for (let i = 0; i < laneCount; i++) {
    if ((cellsMask[i] & embMask[i]) !== embMask[i]) {
      return false;
    }
  }
  return true;
}

/**
 * XOR two masks (apply/undo embedding)
 */
function xorMasks(
  a: BigUint64Array,
  b: BigUint64Array,
  laneCount: number
): BigUint64Array {
  const result = new BigUint64Array(laneCount);
  for (let i = 0; i < laneCount; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

/**
 * Count trailing zeros in a 64-bit bigint
 */
function countTrailingZeros64(x: bigint): number {
  if (x === 0n) return 64;
  let n = 0;
  while ((x & 1n) === 0n) {
    x >>= 1n;
    n++;
  }
  return n;
}

/**
 * Pack prefixes into GPU buffer format
 * Layout per prefix (variable based on lane count):
 *   [cellsMask lanes: u64[], piecesMask: u32, nextCell: u16, depth: u8, pad: u8]
 */
export function packPrefixesForGPU(
  prefixes: SearchPrefix[],
  laneCount: number
): { buffer: ArrayBuffer; bytesPerPrefix: number } {
  // Calculate bytes per prefix (aligned to 8)
  const dataBytes = laneCount * 8 + 4 + 2 + 1 + 1;
  const bytesPerPrefix = Math.ceil(dataBytes / 8) * 8;
  
  const buffer = new ArrayBuffer(prefixes.length * bytesPerPrefix);
  const view = new DataView(buffer);
  
  let byteOffset = 0;
  for (const prefix of prefixes) {
    const startOffset = byteOffset;
    
    // Write cell mask lanes
    for (let lane = 0; lane < laneCount; lane++) {
      view.setBigUint64(byteOffset, prefix.cellsMask[lane], true);
      byteOffset += 8;
    }
    
    // Write pieces mask (u32)
    view.setUint32(byteOffset, prefix.piecesMask, true);
    byteOffset += 4;
    
    // Write next cell index (u16)
    view.setUint16(byteOffset, prefix.nextCellIndex, true);
    byteOffset += 2;
    
    // Write depth (u8)
    view.setUint8(byteOffset, prefix.depth);
    byteOffset += 1;
    
    // Padding
    byteOffset = startOffset + bytesPerPrefix;
  }
  
  return { buffer, bytesPerPrefix };
}

/**
 * Sort prefixes for better GPU coherence
 * Group by (nextCellIndex, popcount) for similar branch patterns
 */
export function sortPrefixesForGPU(prefixes: SearchPrefix[], laneCount: number): SearchPrefix[] {
  return [...prefixes].sort((a, b) => {
    // Primary: next cell index (same Ea bucket)
    if (a.nextCellIndex !== b.nextCellIndex) {
      return a.nextCellIndex - b.nextCellIndex;
    }
    
    // Secondary: remaining cells count (similar workload)
    const popA = popcountMask(a.cellsMask, laneCount);
    const popB = popcountMask(b.cellsMask, laneCount);
    return popA - popB;
  });
}

/**
 * Count set bits in mask (remaining cells)
 */
function popcountMask(mask: BigUint64Array, laneCount: number): number {
  let count = 0;
  for (let i = 0; i < laneCount; i++) {
    let x = mask[i];
    while (x !== 0n) {
      x &= (x - 1n);
      count++;
    }
  }
  return count;
}
