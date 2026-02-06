// src/engines/engineGPU/compiler.ts
// Compiles puzzle (container + pieces) into GPU-friendly bitmask format
// Based on Tom's Puzzle Processor: transforms (A, E) into embedding buckets

import type { IJK } from "../types";
import type { CompiledPuzzle, Embedding, EmbeddingBucket } from "./types";

// Reuse types from engine2
type Oriented = { id: number; cells: IJK[] };
type PieceDB = Map<string, Oriented[]>;

/**
 * Compile a puzzle into GPU-ready format
 * This is the key transformation from the Puzzle Processor paper:
 * - Enumerate all embeddings (valid placements)
 * - Partition by min(e) for efficient search
 * - Pack into bitmasks for GPU bitwise operations
 */
export function compilePuzzle(
  container: { cells: IJK[]; id?: string },
  pieces: PieceDB,
  pieceOrder?: string[],
  useStaticMRV: boolean = true  // Sort cells by difficulty (fewest placements first)
): CompiledPuzzle {
  const startTime = performance.now();
  
  // First pass: use lexicographic ordering to count placements per cell
  const tempCellIndexMap = new Map<string, number>();
  const sortedCells = [...container.cells].sort((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[2] - b[2];
  });
  
  sortedCells.forEach((cell, idx) => {
    tempCellIndexMap.set(ijkKey(cell), idx);
  });
  
  const numCells = sortedCells.length;
  const cellsLaneCount = Math.ceil(numCells / 64);
  
  // Build piece index mapping
  const orderedPieces = pieceOrder ?? [...pieces.keys()].sort();
  const pieceIndexMap = new Map<string, number>();
  orderedPieces.forEach((pid, idx) => {
    pieceIndexMap.set(pid, idx);
  });
  const numPieces = orderedPieces.length;
  
  // Count valid placements per cell (for MRV ordering)
  const placementCount = new Array(numCells).fill(0);
  
  for (const [pieceId, orientations] of pieces.entries()) {
    const pieceBit = pieceIndexMap.get(pieceId);
    if (pieceBit === undefined) continue;
    
    for (const ori of orientations) {
      for (const anchor of ori.cells) {
        for (let targetIdx = 0; targetIdx < numCells; targetIdx++) {
          const targetCell = sortedCells[targetIdx];
          const dx = targetCell[0] - anchor[0];
          const dy = targetCell[1] - anchor[1];
          const dz = targetCell[2] - anchor[2];
          
          // Check if all cells fit
          let valid = true;
          for (const c of ori.cells) {
            const tc: IJK = [c[0] + dx, c[1] + dy, c[2] + dz];
            if (!tempCellIndexMap.has(ijkKey(tc))) {
              valid = false;
              break;
            }
          }
          
          if (valid) {
            // Count this as a valid placement for the target cell
            placementCount[targetIdx]++;
          }
        }
      }
    }
  }
  
  // Create MRV-sorted cell order (fewest placements = hardest = lowest index)
  let finalCellOrder: IJK[];
  let cellIndexMap: Map<string, number>;
  let cellCoords: IJK[];
  
  if (useStaticMRV) {
    // Sort cells by placement count (ascending = hardest first)
    const cellsWithCounts = sortedCells.map((cell, idx) => ({
      cell,
      count: placementCount[idx],
      originalIdx: idx,
    }));
    
    cellsWithCounts.sort((a, b) => a.count - b.count);
    
    finalCellOrder = cellsWithCounts.map(c => c.cell);
    
    // Log MRV ordering
    const hardest5 = cellsWithCounts.slice(0, 5).map(c => `${ijkKey(c.cell)}(${c.count})`);
    const easiest5 = cellsWithCounts.slice(-5).map(c => `${ijkKey(c.cell)}(${c.count})`);
    console.log(`🎯 [Compiler] Static MRV: hardest cells: ${hardest5.join(', ')}, easiest: ${easiest5.join(', ')}`);
  } else {
    finalCellOrder = sortedCells;
  }
  
  // Build final cell index mapping
  cellIndexMap = new Map<string, number>();
  cellCoords = [];
  
  finalCellOrder.forEach((cell, idx) => {
    cellIndexMap.set(ijkKey(cell), idx);
    cellCoords.push(cell);
  });
  
  // Enumerate all embeddings (using MRV-sorted cell indices)
  const allEmbeddings: Embedding[] = [];
  
  for (const [pieceId, orientations] of pieces.entries()) {
    const pieceBit = pieceIndexMap.get(pieceId);
    if (pieceBit === undefined) continue;
    
    for (const ori of orientations) {
      // For each anchor cell in this orientation
      for (const anchor of ori.cells) {
        // For each target cell in container
        for (let targetIdx = 0; targetIdx < numCells; targetIdx++) {
          const targetCell = cellCoords[targetIdx];
          
          // Translation to move anchor → target
          const dx = targetCell[0] - anchor[0];
          const dy = targetCell[1] - anchor[1];
          const dz = targetCell[2] - anchor[2];
          
          // Translate all cells of this orientation
          const translatedCells: IJK[] = ori.cells.map(c => [
            c[0] + dx,
            c[1] + dy,
            c[2] + dz,
          ] as IJK);
          
          // Check if all translated cells are in container
          const cellIndices: number[] = [];
          let valid = true;
          
          for (const tc of translatedCells) {
            const idx = cellIndexMap.get(ijkKey(tc));
            if (idx === undefined) {
              valid = false;
              break;
            }
            cellIndices.push(idx);
          }
          
          if (!valid) continue;
          
          // Build bitmask
          const cellsMask = new BigUint64Array(cellsLaneCount);
          for (const idx of cellIndices) {
            const lane = Math.floor(idx / 64);
            const bit = idx % 64;
            cellsMask[lane] |= (1n << BigInt(bit));
          }
          
          // Find min cell index (for bucket partitioning)
          const minCellIndex = Math.min(...cellIndices);
          
          allEmbeddings.push({
            pieceId,
            orientationId: ori.id,
            translation: [dx, dy, dz],
            cellsMask,
            pieceBit,
            minCellIndex,
          });
        }
      }
    }
  }
  
  // De-duplicate embeddings (same piece+ori may produce identical placements via different anchors)
  const uniqueEmbeddings = deduplicateEmbeddings(allEmbeddings, cellsLaneCount);
  
  // Partition into buckets by minCellIndex
  const bucketMap = new Map<number, Embedding[]>();
  for (const emb of uniqueEmbeddings) {
    const bucket = bucketMap.get(emb.minCellIndex) ?? [];
    bucket.push(emb);
    bucketMap.set(emb.minCellIndex, bucket);
  }
  
  // Build bucket array with offsets
  const embeddingBuckets: EmbeddingBucket[] = [];
  let offset = 0;
  
  for (let cellIdx = 0; cellIdx < numCells; cellIdx++) {
    const embeddings = bucketMap.get(cellIdx) ?? [];
    embeddingBuckets.push({
      cellIndex: cellIdx,
      embeddings,
      offset,
      count: embeddings.length,
    });
    offset += embeddings.length;
  }
  
  const compileMs = performance.now() - startTime;
  
  console.log(`🔧 Compiled puzzle:`, {
    cells: numCells,
    pieces: numPieces,
    embeddings: uniqueEmbeddings.length,
    buckets: embeddingBuckets.filter(b => b.count > 0).length,
    compileMs: compileMs.toFixed(1),
  });
  
  return {
    numCells,
    numPieces,
    numAspects: numCells + numPieces,
    cellsLaneCount,
    cellIndexMap,
    cellCoords,
    pieceIndexMap,
    pieceIds: orderedPieces,
    embeddingBuckets,
    totalEmbeddings: uniqueEmbeddings.length,
  };
}

/**
 * IJK coordinate to string key
 */
function ijkKey(c: IJK): string {
  return `${c[0]},${c[1]},${c[2]}`;
}

/**
 * De-duplicate embeddings with identical bitmasks
 */
function deduplicateEmbeddings(
  embeddings: Embedding[],
  laneCount: number
): Embedding[] {
  const seen = new Set<string>();
  const unique: Embedding[] = [];
  
  for (const emb of embeddings) {
    // Create signature: pieceId + orientation + mask
    let maskStr = '';
    for (let i = 0; i < laneCount; i++) {
      maskStr += emb.cellsMask[i].toString(16) + '|';
    }
    const sig = `${emb.pieceId}:${emb.orientationId}:${maskStr}`;
    
    if (!seen.has(sig)) {
      seen.add(sig);
      unique.push(emb);
    }
  }
  
  return unique;
}

/**
 * Pack embeddings into GPU buffer format
 * Layout per embedding (32 bytes, matching WGSL Embedding struct):
 *   [cells_mask_0_lo: u32, cells_mask_0_hi: u32, cells_mask_1_lo: u32, cells_mask_1_hi: u32,
 *    piece_bit: u32, min_cell: u32, _pad0: u32, _pad1: u32]
 */
export function packEmbeddingsForGPU(
  compiled: CompiledPuzzle
): { buffer: ArrayBuffer; bytesPerEmbedding: number } {
  const bytesPerEmbedding = 32; // 8 x u32
  
  // Flatten all embeddings
  const allEmbeddings: Embedding[] = [];
  for (const bucket of compiled.embeddingBuckets) {
    allEmbeddings.push(...bucket.embeddings);
  }
  
  const buffer = new ArrayBuffer(allEmbeddings.length * bytesPerEmbedding);
  const view = new DataView(buffer);
  
  let byteOffset = 0;
  for (const emb of allEmbeddings) {
    // Split 64-bit masks into lo/hi 32-bit parts
    const mask0 = emb.cellsMask[0];
    const mask1 = emb.cellsMask[1] ?? 0n;
    
    // cells_mask_0_lo (bits 0-31)
    view.setUint32(byteOffset, Number(mask0 & 0xFFFFFFFFn), true);
    byteOffset += 4;
    // cells_mask_0_hi (bits 32-63)
    view.setUint32(byteOffset, Number((mask0 >> 32n) & 0xFFFFFFFFn), true);
    byteOffset += 4;
    // cells_mask_1_lo (bits 64-95)
    view.setUint32(byteOffset, Number(mask1 & 0xFFFFFFFFn), true);
    byteOffset += 4;
    // cells_mask_1_hi (bits 96-127)
    view.setUint32(byteOffset, Number((mask1 >> 32n) & 0xFFFFFFFFn), true);
    byteOffset += 4;
    
    // piece_bit (u32)
    view.setUint32(byteOffset, emb.pieceBit, true);
    byteOffset += 4;
    
    // min_cell (u32)
    view.setUint32(byteOffset, emb.minCellIndex, true);
    byteOffset += 4;
    
    // _pad0, _pad1 (u32 x2)
    view.setUint32(byteOffset, 0, true);
    byteOffset += 4;
    view.setUint32(byteOffset, 0, true);
    byteOffset += 4;
  }
  
  return { buffer, bytesPerEmbedding };
}

/**
 * Pack bucket offsets into GPU buffer format
 * Layout: [offset: u32, count: u32] per cell
 */
export function packBucketsForGPU(compiled: CompiledPuzzle): Uint32Array {
  const buffer = new Uint32Array(compiled.numCells * 2);
  
  for (let i = 0; i < compiled.numCells; i++) {
    const bucket = compiled.embeddingBuckets[i];
    buffer[i * 2] = bucket.offset;
    buffer[i * 2 + 1] = bucket.count;
  }
  
  return buffer;
}

/**
 * Estimate memory requirements for GPU execution
 */
export function estimateGPUMemory(
  compiled: CompiledPuzzle,
  targetPrefixes: number
): { embeddingBytes: number; bucketBytes: number; checkpointBytes: number; totalMB: number } {
  const bytesPerEmbedding = compiled.cellsLaneCount * 8 + 8;
  const embeddingBytes = compiled.totalEmbeddings * bytesPerEmbedding;
  const bucketBytes = compiled.numCells * 8;
  const checkpointBytes = targetPrefixes * 128;
  const totalBytes = embeddingBytes + bucketBytes + checkpointBytes;
  
  return {
    embeddingBytes,
    bucketBytes,
    checkpointBytes,
    totalMB: totalBytes / (1024 * 1024),
  };
}
