// src/engines/engineGPU/index.ts
// GPU Puzzle Solver - Main entry point
// Based on the Puzzle Processor architecture with WebGPU acceleration

import type { IJK } from "../types";
import type {
  EngineGPUSettings,
  EngineGPUEvents,
  EngineGPURunHandle,
  GPUStatus,
  GPUSummary,
  CompiledPuzzle,
  SearchPrefix,
  GPUCapability,
} from "./types";

import { detectGPUCapability, canHandlePuzzle } from "./gpuDetect";
import { compilePuzzle, packEmbeddingsForGPU, packBucketsForGPU, estimateGPUMemory } from "./compiler";
import { generatePrefixes, sortPrefixesForGPU } from "./prefixGenerator";

// Shader is loaded dynamically via loadShader()

// Re-export types
export type { EngineGPUSettings, EngineGPUEvents, EngineGPURunHandle, GPUStatus, GPUSummary };

// Re-export from engine2 for compatibility
export type Oriented = { id: number; cells: IJK[] };
export type PieceDB = Map<string, Oriented[]>;

// ============================================================================
// Precompute (same interface as engine2)
// ============================================================================

export interface GPUPrecomputed {
  container: { cells: IJK[]; id?: string };
  pieces: PieceDB;
  compiled?: CompiledPuzzle;
}

/**
 * Precompute puzzle data for GPU solver
 * This mirrors engine2Precompute but adds GPU-specific compilation
 */
export function engineGPUPrecompute(
  container: { cells: IJK[]; id?: string },
  pieces: PieceDB
): GPUPrecomputed {
  return { container, pieces };
}

// ============================================================================
// Main Solver
// ============================================================================

/**
 * Run GPU puzzle solver
 * Falls back to CPU (engine2) if GPU unavailable
 */
export async function engineGPUSolve(
  pre: GPUPrecomputed,
  settings: EngineGPUSettings,
  events?: EngineGPUEvents
): Promise<EngineGPURunHandle> {
  const startTime = performance.now();
  
  // Cap thread budget to prevent GPU timeout
  // Higher budget = faster progress, but may cause GPU timeout on slow devices
  const maxBudget = 100000;
  const requestedBudget = settings.threadBudget ?? 100;
  const cappedBudget = Math.min(requestedBudget, maxBudget);
  if (requestedBudget > maxBudget) {
    console.warn(`⚠️ [GPU] Thread budget ${requestedBudget} capped to ${maxBudget}`);
  }
  
  const cfg: Required<EngineGPUSettings> = {
    prefixDepth: settings.prefixDepth ?? 4, // Default depth 4, user can override in settings
    targetPrefixCount: settings.targetPrefixCount ?? 100_000, // Reduced to 100K to fit GPU buffer limits
    threadBudget: cappedBudget, // Capped to prevent GPU timeout
    workgroupSize: settings.workgroupSize ?? 256,
    maxSolutions: settings.maxSolutions ?? 0,
    timeoutMs: settings.timeoutMs ?? 0,
    statusIntervalMs: settings.statusIntervalMs ?? 250,
    fallbackToCPU: settings.fallbackToCPU ?? true,
    view: settings.view ?? {
      worldFromIJK: [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],
      sphereRadiusWorld: 1.0,
    },
  };
  
  // Control state
  let canceled = false;
  let paused = false;
  
  // Statistics
  let solutions = 0;
  let totalNodes = 0;
  let totalFitTests = 0;
  let phase: GPUStatus['phase'] = 'compiling';
  let restartCount = 0; // Track restart rounds (like CPU's 2-second restarts)
  
  // Timing
  let compileMs = 0;
  let prefixGenMs = 0;
  let gpuMs = 0;
  let kernelLaunches = 0;
  
  // GPU resources
  let gpuCapability: GPUCapability | null = null;
  let device: any = null; // GPUDevice when available
  let compiled: CompiledPuzzle | null = null;
  let prefixes: SearchPrefix[] = [];
  
  // Status emission
  const emitStatus = () => {
    events?.onStatus?.({
      nodes: totalNodes,
      solutions,
      elapsedMs: performance.now() - startTime,
      phase,
      prefixesGenerated: prefixes.length,
      prefixesRemaining: prefixes.length, // TODO: track actual remaining
      gpuThreadsActive: 0, // TODO: track
      fitTestsPerSecond: totalFitTests / Math.max(1, (performance.now() - startTime) / 1000),
      restartCount, // Track restart rounds like CPU
    });
  };
  
  // Done emission
  const emitDone = (reason: GPUSummary['reason']) => {
    events?.onDone?.({
      solutions,
      totalNodes,
      totalFitTests,
      elapsedMs: performance.now() - startTime,
      reason,
      timing: {
        compileMs,
        prefixGenMs,
        gpuMs,
        prefixCount: prefixes.length,
        kernelLaunches,
      },
      gpuInfo: {
        adapter: 'WebGPU',
        supported: gpuCapability?.supported ?? false,
        fallbackUsed: !gpuCapability?.supported,
      },
    });
  };
  
  // Main async execution
  const run = async () => {
    try {
      console.log('🎮 [GPU] Starting GPU solver run...');
      
      // Phase 1: Detect GPU capability
      phase = 'compiling';
      console.log('🎮 [GPU] Phase 1: Detecting GPU capability...');
      emitStatus();
      
      gpuCapability = await detectGPUCapability();
      console.log('🎮 [GPU] GPU capability result:', gpuCapability.supported ? 'supported' : gpuCapability.reason);
      
      if (!gpuCapability.supported) {
        console.warn('⚠️ GPU not available:', gpuCapability.reason);
        if (cfg.fallbackToCPU) {
          console.log('📱 Falling back to CPU solver (engine2)');
          // TODO: Actually call engine2 here
          emitDone('gpu_error');
          return;
        }
        emitDone('gpu_error');
        return;
      }
      
      device = gpuCapability.device!;
      console.log('🎮 [GPU] Got GPU device');
      
      // Phase 2: Compile puzzle
      console.log('🎮 [GPU] Phase 2: Compiling puzzle...');
      const compileStart = performance.now();
      compiled = compilePuzzle(pre.container, pre.pieces);
      compileMs = performance.now() - compileStart;
      
      // Check if GPU can handle this puzzle
      const memEstimate = estimateGPUMemory(compiled, cfg.targetPrefixCount);
      console.log(`💾 Estimated GPU memory: ${memEstimate.totalMB.toFixed(1)} MB`);
      
      const canHandle = canHandlePuzzle(
        compiled.numCells,
        compiled.totalEmbeddings,
        cfg.targetPrefixCount
      );
      
      if (!canHandle.canHandle) {
        console.warn('⚠️ GPU cannot handle puzzle:', canHandle.reason);
        if (cfg.fallbackToCPU) {
          emitDone('gpu_error');
          return;
        }
        emitDone('gpu_error');
        return;
      }
      
      if (canceled) { console.log('🎮 [GPU] Canceled after compile'); emitDone('canceled'); return; }
      
      // Phase 3: Generate prefixes
      console.log('🎮 [GPU] Phase 3: Generating prefixes...');
      phase = 'generating_prefixes';
      emitStatus();
      
      const prefixStart = performance.now();
      const prefixResult = generatePrefixes(compiled, {
        targetDepth: cfg.prefixDepth || undefined,
        targetCount: cfg.targetPrefixCount,
        onProgress: (depth, count) => {
          console.log(`  Depth ${depth}: ${count} prefixes`);
        },
      });
      
      prefixes = sortPrefixesForGPU(prefixResult.prefixes, compiled.cellsLaneCount);
      prefixGenMs = performance.now() - prefixStart;
      
      console.log(`📦 Generated ${prefixes.length} prefixes at depth ${prefixResult.depth}`);
      
      if (prefixes.length === 0) {
        console.warn('⚠️ No valid prefixes generated');
        emitDone('complete');
        return;
      }
      
      if (canceled) { console.log('🎮 [GPU] Canceled after prefix gen'); emitDone('canceled'); return; }
      
      // Phase 4: GPU execution
      console.log('🎮 [GPU] Phase 4: Starting GPU search...');
      phase = 'gpu_search';
      emitStatus();
      
      const gpuStart = performance.now();
      
      // Create GPU buffers
      console.log('🎮 [GPU] Creating GPU buffers...');
      const embeddingData = packEmbeddingsForGPU(compiled);
      const bucketData = packBucketsForGPU(compiled);
      console.log('🎮 [GPU] Embedding data:', embeddingData.buffer.byteLength, 'bytes');
      console.log('🎮 [GPU] Bucket data:', bucketData.byteLength, 'bytes');
      
      // WebGPU buffer usage flags
      const STORAGE = 0x80; // GPUBufferUsage.STORAGE
      const COPY_DST = 0x08; // GPUBufferUsage.COPY_DST
      const COPY_SRC = 0x04; // GPUBufferUsage.COPY_SRC
      const MAP_READ = 0x01; // GPUBufferUsage.MAP_READ
      
      // Create GPU buffers
      console.log('🎮 [GPU] Creating embedding buffer...');
      const embeddingBuffer = device.createBuffer({
        size: embeddingData.buffer.byteLength,
        usage: STORAGE | COPY_DST,
      });
      device.queue.writeBuffer(embeddingBuffer, 0, embeddingData.buffer);
      
      console.log('🎮 [GPU] Creating bucket buffer...');
      const bucketBuffer = device.createBuffer({
        size: bucketData.byteLength,
        usage: STORAGE | COPY_DST,
      });
      device.queue.writeBuffer(bucketBuffer, 0, bucketData);
      
      // Checkpoint buffer (read-write, initialized from prefixes)
      const checkpointSize = 256; // Bytes per checkpoint (padded)
      console.log('🎮 [GPU] Creating checkpoint buffer:', prefixes.length * checkpointSize, 'bytes');
      const checkpointBuffer = device.createBuffer({
        size: prefixes.length * checkpointSize,
        usage: STORAGE | COPY_DST | COPY_SRC,
      });
      
      // Initialize checkpoints from prefixes
      console.log('🎮 [GPU] Initializing checkpoints from prefixes...');
      const checkpointInit = createCheckpointBuffer(prefixes, compiled.cellsLaneCount, checkpointSize);
      device.queue.writeBuffer(checkpointBuffer, 0, checkpointInit);
      
      // Solutions buffer
      const maxSolutionSlots = Math.min(1000, cfg.maxSolutions || 1000);
      const solutionSize = 128; // Bytes per solution: valid(4) + depth(4) + pad(8) + choices[25](100) + pad(12)
      console.log('🎮 [GPU] Creating solution buffer:', maxSolutionSlots * solutionSize, 'bytes');
      const solutionBuffer = device.createBuffer({
        size: maxSolutionSlots * solutionSize,
        usage: STORAGE | COPY_SRC,
      });
      
      // Solution read buffer for reading back solutions
      const solutionReadBuffer = device.createBuffer({
        size: maxSolutionSlots * solutionSize,
        usage: MAP_READ | COPY_DST,
      });
      
      // Stats buffer - must be zero-initialized
      console.log('🎮 [GPU] Creating stats buffer...');
      const statsBuffer = device.createBuffer({
        size: 32, // 6 x u32 atomics (24 bytes, padded to 32)
        usage: STORAGE | COPY_SRC | COPY_DST, // COPY_DST for zero init
        mappedAtCreation: true, // Create mapped to initialize
      });
      // Zero initialize the stats buffer
      new Uint32Array(statsBuffer.getMappedRange()).fill(0);
      statsBuffer.unmap();
      
      // Load shader
      console.log('🎮 [GPU] Loading shader...');
      const shaderCode = await loadShader();
      console.log('🎮 [GPU] Shader loaded, length:', shaderCode.length);
      console.log('🎮 [GPU] Creating shader module...');
      
      let shaderModule;
      try {
        shaderModule = device.createShaderModule({
          code: shaderCode,
        });
        
        // Check for compilation errors (async)
        const compilationInfo = await shaderModule.getCompilationInfo();
        if (compilationInfo.messages.length > 0) {
          console.log('🎮 [GPU] Shader compilation messages:');
          for (const msg of compilationInfo.messages) {
            const level = msg.type === 'error' ? '❌' : msg.type === 'warning' ? '⚠️' : 'ℹ️';
            console.log(`  ${level} [${msg.type}] Line ${msg.lineNum}: ${msg.message}`);
          }
          
          const hasErrors = compilationInfo.messages.some((m: any) => m.type === 'error');
          if (hasErrors) {
            console.error('❌ [GPU] Shader compilation failed with errors');
            emitDone('gpu_error');
            return;
          }
        }
        console.log('🎮 [GPU] Shader module created successfully');
      } catch (shaderError) {
        console.error('❌ [GPU] Shader creation failed:', shaderError);
        emitDone('gpu_error');
        return;
      }
      
      // Create pipeline
      console.log('🎮 [GPU] Creating compute pipeline with constants:', {
        CELLS_LANE_COUNT: compiled.cellsLaneCount,
        NUM_CELLS: compiled.numCells,
        NUM_PIECES: compiled.numPieces,
        MAX_DEPTH: 25,
        BUDGET: cfg.threadBudget,
      });
      
      let pipeline;
      try {
        pipeline = device.createComputePipeline({
          layout: 'auto',
          compute: {
            module: shaderModule,
            entryPoint: 'main',
            constants: {
              CELLS_LANE_COUNT: compiled.cellsLaneCount,
              NUM_CELLS: compiled.numCells,
              NUM_PIECES: compiled.numPieces,
              MAX_DEPTH: 25,
              BUDGET: cfg.threadBudget,
            },
          },
        });
        console.log('🎮 [GPU] Pipeline created successfully');
      } catch (pipelineError) {
        console.error('❌ [GPU] Pipeline creation failed:', pipelineError);
        emitDone('gpu_error');
        return;
      }
      
      // Create bind group
      console.log('🎮 [GPU] Creating bind group...');
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: embeddingBuffer } },
          { binding: 1, resource: { buffer: bucketBuffer } },
          { binding: 2, resource: { buffer: checkpointBuffer } },
          { binding: 3, resource: { buffer: solutionBuffer } },
          { binding: 4, resource: { buffer: statsBuffer } },
        ],
      });
      console.log('🎮 [GPU] Bind group created');
      
      // Staging buffer for reading results
      const statsReadBuffer = device.createBuffer({
        size: 32,
        usage: MAP_READ | COPY_DST,
      });
      
      // Multi-round GPU search with restarts (like CPU's 2-second restarts)
      // Each round generates new random prefixes and searches from scratch
      let shouldStop = false;
      const maxRounds = 1000; // Safety limit
      
      // Accumulated totals across all rounds
      let accumulatedSolutions = 0;
      let accumulatedNodes = 0;
      let accumulatedFitTests = 0;
      
      console.log('🎮 [GPU] Starting multi-round search (restarts on exhaust, like CPU)...');
      
      // Outer loop: restart rounds
      while (!shouldStop && !canceled && restartCount < maxRounds) {
        // Check timeout before starting new round
        if (cfg.timeoutMs > 0 && performance.now() - startTime > cfg.timeoutMs) {
          console.log('🎮 [GPU] Timeout reached');
          shouldStop = true;
          break;
        }
        
        // For restarts after first round, regenerate prefixes with new seed
        if (restartCount > 0) {
          console.log(`🔄 [GPU] Round ${restartCount + 1}: Regenerating prefixes with new random seed...`);
          
          // Generate new prefixes (randomization is built into prefixGenerator)
          const newPrefixResult = generatePrefixes(compiled, {
            targetDepth: cfg.prefixDepth || undefined,
            targetCount: cfg.targetPrefixCount,
          });
          prefixes = sortPrefixesForGPU(newPrefixResult.prefixes, compiled.cellsLaneCount);
          
          if (prefixes.length === 0) {
            console.warn('⚠️ [GPU] No valid prefixes generated in round', restartCount + 1);
            break;
          }
          
          // Reinitialize checkpoint buffer with new prefixes
          const newCheckpointInit = createCheckpointBuffer(prefixes, compiled.cellsLaneCount, checkpointSize);
          device.queue.writeBuffer(checkpointBuffer, 0, newCheckpointInit);
          
          // Reset stats buffer for new round
          const zeroStats = new Uint32Array(8).fill(0);
          device.queue.writeBuffer(statsBuffer, 0, zeroStats);
          
          console.log(`📦 [GPU] Round ${restartCount + 1}: Generated ${prefixes.length} new prefixes`);
        }
        
        // Execute kernel loop for this round
        let activeThreads = prefixes.length;
        const workgroupCount = Math.ceil(activeThreads / cfg.workgroupSize);
        
        if (restartCount === 0) {
          console.log('🎮 [GPU] Starting kernel loop:', { activeThreads, workgroupCount, workgroupSize: cfg.workgroupSize });
        }
        
        let loopCount = 0;
        let lastNodes = 0;
        let stallCount = 0;
        const maxStallIterations = 10;
        const maxIterations = 10000;
        
        // Inner loop: kernel iterations for this round
        while (activeThreads > 0 && !canceled && !shouldStop) {
          loopCount++;
          if (loopCount === 1 || loopCount % 10 === 0) {
            console.log(`🎮 [GPU] Round ${restartCount + 1}, iteration ${loopCount}, active threads: ${activeThreads}`);
          }
          
          if (loopCount > maxIterations) {
            console.log('🎮 [GPU] Max iterations reached in round');
            break;
          }
          
          if (paused) {
            await new Promise(resolve => setTimeout(resolve, 100));
            continue;
          }
          
          // Check timeout
          if (cfg.timeoutMs > 0 && performance.now() - startTime > cfg.timeoutMs) {
            console.log('🎮 [GPU] Timeout reached');
            shouldStop = true;
            break;
          }
          
          // Execute compute pass
          const commandEncoder = device.createCommandEncoder();
          const passEncoder = commandEncoder.beginComputePass();
          passEncoder.setPipeline(pipeline);
          passEncoder.setBindGroup(0, bindGroup);
          passEncoder.dispatchWorkgroups(workgroupCount);
          passEncoder.end();
          
          // Copy stats for reading
          commandEncoder.copyBufferToBuffer(statsBuffer, 0, statsReadBuffer, 0, 32);
          
          device.queue.submit([commandEncoder.finish()]);
          kernelLaunches++;
          
          // Read stats
          const GPU_MAP_MODE_READ = 0x0001;
          
          try {
            await device.queue.onSubmittedWorkDone();
            await statsReadBuffer.mapAsync(GPU_MAP_MODE_READ);
          } catch (mapError) {
            console.error('❌ [GPU] mapAsync failed:', mapError);
            emitDone('gpu_error');
            return;
          }
          
          const statsData = new Uint32Array(statsReadBuffer.getMappedRange().slice(0));
          statsReadBuffer.unmap();
          
          const roundSolutions = statsData[0];
          const roundFitTests = statsData[1];
          const roundNodes = statsData[2];
          const exhausted = statsData[3];
          const budgetPaused = statsData[4];
          const maxDepth = statsData[5];
          
          // Log periodically
          if (loopCount === 1 || loopCount % 5 === 0) {
            console.log(`🎮 [GPU] R${restartCount + 1}: solutions=${roundSolutions}, nodes=${roundNodes}, maxDepth=${maxDepth}, exhausted=${exhausted}/${prefixes.length}`);
          }
          
          // Stall detection
          if (roundNodes === lastNodes) {
            stallCount++;
            if (stallCount >= maxStallIterations) {
              console.log(`🎮 [GPU] Stall detected, ending round`);
              break;
            }
          } else {
            stallCount = 0;
            lastNodes = roundNodes;
          }
          
          activeThreads = prefixes.length - exhausted;
          
          // Update running totals for status emission (accumulated + current round)
          solutions = accumulatedSolutions + roundSolutions;
          totalNodes = accumulatedNodes + roundNodes;
          totalFitTests = accumulatedFitTests + roundFitTests;
          
          emitStatus();
          
          // Check solution limit (total across all rounds)
          if (cfg.maxSolutions > 0 && solutions >= cfg.maxSolutions) {
            console.log(`🎮 [GPU] Solution limit reached (${solutions} total)`);
            shouldStop = true;
            break;
          }
          
          // If all threads exhausted, end this round (will restart with new prefixes)
          if (exhausted >= prefixes.length) {
            // Accumulate this round's final stats
            accumulatedSolutions += roundSolutions;
            accumulatedNodes += roundNodes;
            accumulatedFitTests += roundFitTests;
            console.log(`🎮 [GPU] Round ${restartCount + 1} exhausted, nodes=${roundNodes}, total=${accumulatedNodes}`);
            break; // Break inner loop to start new round
          }
          
          await new Promise(resolve => setTimeout(resolve, 1));
        }
        
        // Increment restart count
        restartCount++;
        
        // Update final totals
        solutions = accumulatedSolutions;
        totalNodes = accumulatedNodes;
        totalFitTests = accumulatedFitTests;
        
        // If we found solutions and hit limit, stop
        if (cfg.maxSolutions > 0 && solutions >= cfg.maxSolutions) {
          shouldStop = true;
        }
        
        console.log(`📊 [GPU] After round ${restartCount}: total solutions=${solutions}, total nodes=${totalNodes}, restarts=${restartCount}`);
      }
      
      gpuMs = performance.now() - gpuStart;
      
      // Read solutions from GPU if any were found
      if (solutions > 0 && events?.onSolution) {
        console.log(`🎮 [GPU] Reading ${solutions} solutions from GPU...`);
        
        // Build flat embedding list for lookup (in bucket order to match GPU indices)
        const flatEmbeddings: Array<{ pieceId: string; ori: number; t: IJK }> = [];
        for (const bucket of compiled.embeddingBuckets) {
          for (const emb of bucket.embeddings) {
            flatEmbeddings.push({
              pieceId: emb.pieceId,
              ori: emb.orientationId,
              t: emb.translation,
            });
          }
        }
        
        // Copy solution buffer to read buffer
        const copyEncoder = device.createCommandEncoder();
        const solutionsToRead = Math.min(solutions, maxSolutionSlots);
        copyEncoder.copyBufferToBuffer(
          solutionBuffer, 0,
          solutionReadBuffer, 0,
          solutionsToRead * solutionSize
        );
        device.queue.submit([copyEncoder.finish()]);
        
        // Wait and map
        await device.queue.onSubmittedWorkDone();
        await solutionReadBuffer.mapAsync(MAP_READ);
        
        const solutionData = new Uint32Array(solutionReadBuffer.getMappedRange());
        
        // Parse each solution
        let emittedCount = 0;
        let skippedInvalid = 0;
        for (let i = 0; i < solutionsToRead; i++) {
          const offset = i * (solutionSize / 4); // u32 offset
          const valid = solutionData[offset + 0];
          const depth = solutionData[offset + 1];
          // offset+2 and offset+3 are padding
          
          // Debug first few solutions
          if (i < 5) {
            const firstChoice = solutionData[offset + 4];
            console.log(`🎮 [GPU] Solution ${i}: valid=${valid}, depth=${depth}, firstChoice=${firstChoice}, offset=${offset}`);
          }
          
          if (valid !== 1) {
            skippedInvalid++;
            continue;
          }
          
          // Extract embedding indices from choices array (starts at offset+4)
          // Note: depth may be 0 due to WGSL alignment issues, so read all 25 and filter valid ones
          const placements: Array<{ pieceId: string; ori: number; t: IJK }> = [];
          
          for (let d = 0; d < 25; d++) {
            const embIdx = solutionData[offset + 4 + d];
            // Valid embedding indices are >= 0 and < flatEmbeddings.length
            // Note: embIdx 0 is valid (first embedding), we filter by checking < length
            if (embIdx < flatEmbeddings.length) {
              placements.push(flatEmbeddings[embIdx]);
            }
          }
          
          if (placements.length > 0) {
            events.onSolution(placements);
            emittedCount++;
          } else if (i < 5) {
            console.log(`🎮 [GPU] Solution ${i}: valid but 0 placements!`);
          }
        }
        
        solutionReadBuffer.unmap();
        console.log(`🎮 [GPU] Emitted ${emittedCount} solutions (skipped ${skippedInvalid} invalid)`);
      }
      
      // Cleanup
      embeddingBuffer.destroy();
      bucketBuffer.destroy();
      checkpointBuffer.destroy();
      solutionBuffer.destroy();
      solutionReadBuffer.destroy();
      statsBuffer.destroy();
      statsReadBuffer.destroy();
      
      phase = 'done';
      // Determine stop reason
      let stopReason: 'complete' | 'canceled' | 'limit' | 'timeout' = 'complete';
      if (canceled) stopReason = 'canceled';
      else if (cfg.maxSolutions > 0 && solutions >= cfg.maxSolutions) stopReason = 'limit';
      emitDone(stopReason);
      
    } catch (error) {
      console.error('GPU solver error:', error);
      emitDone('gpu_error');
    }
  };
  
  // Start execution
  run();
  
  // Return handle
  return {
    pause: () => { paused = true; },
    resume: () => { paused = false; },
    cancel: () => { canceled = true; },
    getStats: () => ({
      nodes: totalNodes,
      solutions,
      elapsedMs: performance.now() - startTime,
      phase,
      prefixesGenerated: prefixes.length,
      fitTestsPerSecond: totalFitTests / Math.max(1, (performance.now() - startTime) / 1000),
    }),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create checkpoint buffer from prefixes
 * Layout matches WGSL Checkpoint struct (using lo/hi u32 for 64-bit masks):
 *   cells_mask_0_lo: u32, cells_mask_0_hi: u32, cells_mask_1_lo: u32, cells_mask_1_hi: u32,
 *   pieces_mask: u32, depth: u32, status: u32, fit_tests: u32,
 *   nodes: u32, _pad0: u32, _pad1: u32, _pad2: u32,
 *   iter: array<u32, 25>, choice: array<u32, 25>
 * Total: 12*4 + 25*4 + 25*4 = 48 + 100 + 100 = 248 bytes (padded to 256)
 */
function createCheckpointBuffer(
  prefixes: SearchPrefix[],
  _laneCount: number,
  bytesPerCheckpoint: number
): ArrayBuffer {
  const buffer = new ArrayBuffer(prefixes.length * bytesPerCheckpoint);
  const view = new DataView(buffer);
  
  for (let i = 0; i < prefixes.length; i++) {
    const prefix = prefixes[i];
    const offset = i * bytesPerCheckpoint;
    
    const mask0 = prefix.cellsMask[0] ?? 0n;
    const mask1 = prefix.cellsMask[1] ?? 0n;
    
    // Debug first checkpoint
    if (i === 0) {
      console.log(`🎮 [GPU] Checkpoint 0: mask0=${mask0.toString(16)}, mask1=${mask1.toString(16)}, depth=${prefix.depth}, pieces=${prefix.piecesMask.toString(2)}`);
    }
    
    // cells_mask_0_lo (offset 0)
    view.setUint32(offset + 0, Number(mask0 & 0xFFFFFFFFn), true);
    // cells_mask_0_hi (offset 4)
    view.setUint32(offset + 4, Number((mask0 >> 32n) & 0xFFFFFFFFn), true);
    // cells_mask_1_lo (offset 8)
    view.setUint32(offset + 8, Number(mask1 & 0xFFFFFFFFn), true);
    // cells_mask_1_hi (offset 12)
    view.setUint32(offset + 12, Number((mask1 >> 32n) & 0xFFFFFFFFn), true);
    // pieces_mask (offset 16)
    view.setUint32(offset + 16, prefix.piecesMask, true);
    // depth (offset 20)
    view.setUint32(offset + 20, prefix.depth, true);
    // status = 0 (RUNNING) (offset 24)
    view.setUint32(offset + 24, 0, true);
    // fit_tests = 0 (offset 28)
    view.setUint32(offset + 28, 0, true);
    // nodes = 0 (offset 32)
    view.setUint32(offset + 32, 0, true);
    // _pad0, _pad1, _pad2 = 0 (offsets 36, 40, 44)
    view.setUint32(offset + 36, 0, true);
    view.setUint32(offset + 40, 0, true);
    view.setUint32(offset + 44, 0, true);
    // iter array starts at offset 48 (25 x u32 = 100 bytes)
    // choice array starts at offset 148 (25 x u32 = 100 bytes)
    // Write the prefix's choices to the choice array
    if (prefix.choices) {
      for (let d = 0; d < prefix.choices.length && d < 25; d++) {
        view.setUint32(offset + 148 + d * 4, prefix.choices[d], true);
      }
    }
  }
  
  return buffer;
}

/**
 * Load shader code
 */
async function loadShader(): Promise<string> {
  // Full GPU puzzle solver with DFS and checkpoint support
  return `
override CELLS_LANE_COUNT: u32 = 2u;
override NUM_CELLS: u32 = 100u;
override NUM_PIECES: u32 = 25u;
override MAX_DEPTH: u32 = 25u;
override BUDGET: u32 = 100u;

struct Embedding {
  cells_mask_0_lo: u32,
  cells_mask_0_hi: u32,
  cells_mask_1_lo: u32,
  cells_mask_1_hi: u32,
  piece_bit: u32,
  min_cell: u32,
  _pad0: u32,
  _pad1: u32,
}

struct Bucket {
  offset: u32,
  count: u32,
}

struct Checkpoint {
  cells_mask_0_lo: u32,
  cells_mask_0_hi: u32,
  cells_mask_1_lo: u32,
  cells_mask_1_hi: u32,
  pieces_mask: u32,
  depth: u32,
  status: u32,
  fit_tests: u32,
  nodes: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  iter: array<u32, 25>,
  choice: array<u32, 25>,
  _pad3: u32,  // Extra padding to make struct exactly 256 bytes
  _pad4: u32,  // (12*4 + 25*4 + 25*4 + 2*4 = 256)
}

struct Solution {
  valid: u32,
  depth: u32,
  _pad0: u32,
  _pad1: u32,
  choices: array<u32, 25>,
  _pad2: u32,  // Padding to make struct exactly 128 bytes
  _pad3: u32,  // (4+4+4+4+100+4+4+4 = 128)
  _pad4: u32,
}

struct Stats {
  solutions_found: atomic<u32>,
  total_fit_tests: atomic<u32>,
  total_nodes: atomic<u32>,
  threads_exhausted: atomic<u32>,
  threads_budget: atomic<u32>,
  max_depth_reached: atomic<u32>,
}

@group(0) @binding(0) var<storage, read> embeddings: array<Embedding>;
@group(0) @binding(1) var<storage, read> buckets: array<Bucket>;
@group(0) @binding(2) var<storage, read_write> checkpoints: array<Checkpoint>;
@group(0) @binding(3) var<storage, read_write> solutions: array<Solution>;
@group(0) @binding(4) var<storage, read_write> stats: Stats;

// Find first set bit (returns cell index or -1)
fn find_first_set_bit(m0_lo: u32, m0_hi: u32, m1_lo: u32, m1_hi: u32) -> i32 {
  if (m0_lo != 0u) { return i32(firstTrailingBit(m0_lo)); }
  if (m0_hi != 0u) { return 32 + i32(firstTrailingBit(m0_hi)); }
  if (m1_lo != 0u) { return 64 + i32(firstTrailingBit(m1_lo)); }
  if (m1_hi != 0u) { return 96 + i32(firstTrailingBit(m1_hi)); }
  return -1;
}

// Check if embedding fits: all embedding cells are available
fn embedding_fits(c0_lo: u32, c0_hi: u32, c1_lo: u32, c1_hi: u32,
                  e0_lo: u32, e0_hi: u32, e1_lo: u32, e1_hi: u32) -> bool {
  return ((c0_lo & e0_lo) == e0_lo) && ((c0_hi & e0_hi) == e0_hi) &&
         ((c1_lo & e1_lo) == e1_lo) && ((c1_hi & e1_hi) == e1_hi);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let tid = global_id.x;
  if (tid >= arrayLength(&checkpoints)) { return; }
  
  var cp = checkpoints[tid];
  // Process RUNNING (0) or BUDGET_PAUSED (3) threads, skip EXHAUSTED (1)
  if (cp.status == 1u) { return; }
  
  // Reset status to RUNNING for budget-paused threads
  if (cp.status == 3u) {
    cp.status = 0u;
  }
  
  // Load state from checkpoint
  var c0_lo = cp.cells_mask_0_lo;
  var c0_hi = cp.cells_mask_0_hi;
  var c1_lo = cp.cells_mask_1_lo;
  var c1_hi = cp.cells_mask_1_hi;
  var pieces = cp.pieces_mask;
  var depth = cp.depth;
  let initial_depth = depth; // Remember starting depth - don't backtrack past this
  var fit_tests = 0u; // Start fresh each dispatch
  var nodes = 0u;     // Start fresh each dispatch  
  var budget = BUDGET;
  
  var iter_stack: array<u32, 25>;
  var choice_stack: array<u32, 25>;
  for (var i = 0u; i < MAX_DEPTH; i = i + 1u) {
    iter_stack[i] = cp.iter[i];
    choice_stack[i] = cp.choice[i];
  }
  
  // DFS loop
  loop {
    // Budget exhausted - save state and pause
    if (budget == 0u) {
      cp.cells_mask_0_lo = c0_lo;
      cp.cells_mask_0_hi = c0_hi;
      cp.cells_mask_1_lo = c1_lo;
      cp.cells_mask_1_hi = c1_hi;
      cp.pieces_mask = pieces;
      cp.depth = depth;
      cp.status = 3u; // BUDGET_PAUSED
      cp.fit_tests = fit_tests;
      cp.nodes = nodes;
      for (var i = 0u; i < MAX_DEPTH; i = i + 1u) {
        cp.iter[i] = iter_stack[i];
        cp.choice[i] = choice_stack[i];
      }
      checkpoints[tid] = cp;
      atomicAdd(&stats.threads_budget, 1u);
      atomicAdd(&stats.total_fit_tests, fit_tests);
      atomicAdd(&stats.total_nodes, nodes);
      return;
    }
    
    // Find first unfilled cell
    let cell_idx = find_first_set_bit(c0_lo, c0_hi, c1_lo, c1_hi);
    
    // All cells filled = solution found!
    if (cell_idx < 0) {
      let sol_idx = atomicAdd(&stats.solutions_found, 1u);
      if (sol_idx < arrayLength(&solutions)) {
        var sol: Solution;
        sol.valid = 1u;
        sol.depth = depth;
        for (var i = 0u; i < MAX_DEPTH; i = i + 1u) {
          sol.choices[i] = choice_stack[i];
        }
        solutions[sol_idx] = sol;
      }
      
      // Backtrack after finding solution - but not past initial depth
      if (depth <= initial_depth) {
        cp.status = 1u; // EXHAUSTED
        cp.fit_tests = fit_tests;
        cp.nodes = nodes;
        checkpoints[tid] = cp;
        atomicAdd(&stats.threads_exhausted, 1u);
        atomicAdd(&stats.total_fit_tests, fit_tests);
        atomicAdd(&stats.total_nodes, nodes);
        return;
      }
      
      depth = depth - 1u;
      let lc = choice_stack[depth];
      let le = embeddings[lc];
      c0_lo = c0_lo ^ le.cells_mask_0_lo;
      c0_hi = c0_hi ^ le.cells_mask_0_hi;
      c1_lo = c1_lo ^ le.cells_mask_1_lo;
      c1_hi = c1_hi ^ le.cells_mask_1_hi;
      pieces = pieces ^ (1u << le.piece_bit);
      iter_stack[depth] = iter_stack[depth] + 1u;
      continue;
    }
    
    // Get bucket for this cell
    let bucket = buckets[u32(cell_idx)];
    var iter = iter_stack[depth];
    var found = false;
    
    // Try embeddings in bucket - WITH budget check to prevent infinite loop
    while (iter < bucket.count && budget > 0u) {
      budget = budget - 1u;
      fit_tests = fit_tests + 1u;
      
      let emb_idx = bucket.offset + iter;
      let emb = embeddings[emb_idx];
      
      // Check if piece still available
      if ((pieces & (1u << emb.piece_bit)) == 0u) {
        iter = iter + 1u;
        continue;
      }
      
      // Check if embedding fits
      if (!embedding_fits(c0_lo, c0_hi, c1_lo, c1_hi,
                          emb.cells_mask_0_lo, emb.cells_mask_0_hi,
                          emb.cells_mask_1_lo, emb.cells_mask_1_hi)) {
        iter = iter + 1u;
        continue;
      }
      
      // Place piece
      c0_lo = c0_lo ^ emb.cells_mask_0_lo;
      c0_hi = c0_hi ^ emb.cells_mask_0_hi;
      c1_lo = c1_lo ^ emb.cells_mask_1_lo;
      c1_hi = c1_hi ^ emb.cells_mask_1_hi;
      pieces = pieces ^ (1u << emb.piece_bit);
      
      choice_stack[depth] = emb_idx;
      iter_stack[depth] = iter;
      depth = depth + 1u;
      nodes = nodes + 1u;
      iter_stack[depth] = 0u;
      atomicMax(&stats.max_depth_reached, depth);
      found = true;
      break;
    }
    
    // If budget exhausted mid-search, save iter and let outer loop handle it
    if (!found && budget == 0u) {
      iter_stack[depth] = iter;
      continue;
    }
    
    // No valid embedding found - backtrack (but not past initial depth)
    if (!found) {
      if (depth <= initial_depth) {
        cp.status = 1u; // EXHAUSTED
        cp.fit_tests = fit_tests;
        cp.nodes = nodes;
        checkpoints[tid] = cp;
        atomicAdd(&stats.threads_exhausted, 1u);
        atomicAdd(&stats.total_fit_tests, fit_tests);
        atomicAdd(&stats.total_nodes, nodes);
        return;
      }
      
      depth = depth - 1u;
      let lc = choice_stack[depth];
      let le = embeddings[lc];
      c0_lo = c0_lo ^ le.cells_mask_0_lo;
      c0_hi = c0_hi ^ le.cells_mask_0_hi;
      c1_lo = c1_lo ^ le.cells_mask_1_lo;
      c1_hi = c1_hi ^ le.cells_mask_1_hi;
      pieces = pieces ^ (1u << le.piece_bit);
      iter_stack[depth] = iter_stack[depth] + 1u;
    }
  }
}
`;
}
