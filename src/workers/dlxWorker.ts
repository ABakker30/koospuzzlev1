// src/workers/dlxWorker.ts
// Web Worker for DLX solvability checks and stats computation
// Runs expensive computation off the main thread

import type { DLXCheckInput } from '../engines/dlxSolver';

// Worker-safe imports - avoid complex engine imports for now
let loadHintEnginePiecesDb: any;
let checkSolvableFromPartial: any;
let computeStatsFromPartial: any;
let engineLoaded = false;

// Dynamic import to avoid bundler issues
async function loadEngineFunctions() {
  if (engineLoaded) return;
  console.log('🔧 [Worker] Loading engine functions...');
  const module = await import('../engines/hintEngine');
  loadHintEnginePiecesDb = module.loadHintEnginePiecesDb;
  checkSolvableFromPartial = module.checkSolvableFromPartial;
  computeStatsFromPartial = module.computeStatsFromPartial;
  engineLoaded = true;
  console.log('✅ [Worker] Engine functions loaded');
}

// Message types
type WorkerRequest = {
  type: 'check';
  requestId: string;
  input: DLXCheckInput;
  timeoutMs: number;
  emptyThreshold: number;
} | {
  type: 'cancel';
  requestId: string;
};

type WorkerResponse = {
  requestId: string;
  result?: {
    solvable: boolean;
    mode: 'full' | 'lightweight';
    emptyCount: number;
    solutionCount?: number;
    definiteFailure?: boolean;
    estimatedSearchSpace?: string;
    validNextMoveCount?: number;
  };
  error?: string;
};

// Cached pieces database (load once)
let piecesDb: any | null = null;
const activeCancels = new Set<string>();

// Stable sorting for determinism
function sortInputStable(input: DLXCheckInput): DLXCheckInput {
  return {
    ...input,
    emptyCells: [...input.emptyCells].sort((a, b) => 
      a.i !== b.i ? a.i - b.i : a.j !== b.j ? a.j - b.j : a.k - b.k
    ),
    remainingPieces: [...input.remainingPieces].sort(),
    placedPieces: [...input.placedPieces].sort((a, b) => 
      (a.uid || a.pieceId || '').localeCompare(b.uid || b.pieceId || '')
    ),
  };
}

async function handleCheck(requestId: string, input: DLXCheckInput, timeoutMs: number, emptyThreshold: number) {
  try {
    // Load engine functions first
    await loadEngineFunctions();
    
    // Load pieces DB once
    if (!piecesDb) {
      console.log('🔧 [Worker] Loading pieces database...');
      piecesDb = await loadHintEnginePiecesDb();
      console.log('✅ [Worker] Pieces database loaded');
    }

    // Check if cancelled
    if (activeCancels.has(requestId)) {
      activeCancels.delete(requestId);
      return; // Silent exit
    }

    // Sort for determinism
    const sortedInput = sortInputStable(input);

    // Run solvability check
    console.log(`🔍 [Worker ${requestId}] Starting solvability check...`);
    const startTime = performance.now();
    
    const solvableResult = await checkSolvableFromPartial(sortedInput, piecesDb);
    
    // Check if cancelled after check
    if (activeCancels.has(requestId)) {
      activeCancels.delete(requestId);
      return;
    }

    // Compute accurate stats (only if not cancelled)
    let stats: { estimatedSearchSpace?: string; validNextMoveCount?: number } = {};
    
    if (solvableResult.mode === 'full' && solvableResult.solvable) {
      console.log(`📊 [Worker ${requestId}] Computing stats...`);
      stats = await computeStatsFromPartial(sortedInput, piecesDb);
      
      // Check cancellation again
      if (activeCancels.has(requestId)) {
        activeCancels.delete(requestId);
        return;
      }
    }

    const computeTimeMs = performance.now() - startTime;
    console.log(`✅ [Worker ${requestId}] Complete in ${computeTimeMs.toFixed(0)}ms`);

    // Send result
    const response: WorkerResponse = {
      requestId,
      result: {
        ...solvableResult,
        ...stats,
      },
    };

    console.log(`📤 [Worker ${requestId}] Sending response:`, response);
    self.postMessage(response);
  } catch (error) {
    console.error(`❌ [Worker ${requestId}] Error:`, error);
    const response: WorkerResponse = {
      requestId,
      error: String(error),
    };
    self.postMessage(response);
  }
}

function handleCancel(requestId: string) {
  console.log(`🛑 [Worker] Cancelling request ${requestId}`);
  activeCancels.add(requestId);
}

// Message handler
self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  if (msg.type === 'check') {
    handleCheck(msg.requestId, msg.input, msg.timeoutMs, msg.emptyThreshold);
  } else if (msg.type === 'cancel') {
    handleCancel(msg.requestId);
  }
});

console.log('🚀 [Worker] DLX Worker initialized');
