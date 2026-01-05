// src/engines/dlxWorkerClient.ts
// Main thread client for DLX Web Worker
// Handles timeout, cancellation, and request/response mapping

import type { DLXCheckInput, DLXCheckOptions, EnhancedDLXCheckResult } from './dlxSolver';

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

type PendingRequest = {
  resolve: (result: EnhancedDLXCheckResult) => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
};

// Singleton worker instance
let worker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<string, PendingRequest>();
let latestRequestId: string | null = null;

function getWorker(): Worker {
  if (!worker) {
    // Create worker using Vite's module worker pattern
    worker = new Worker(
      new URL('../workers/dlxWorker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      console.log('📥 [Worker Client] Received message:', response);
      const pending = pendingRequests.get(response.requestId);

      if (!pending) {
        console.warn(`⚠️ [Worker Client] No pending request for ${response.requestId}`);
        // Request was cancelled or timed out
        return;
      }

      // Clear timeout
      if (pending.timeoutHandle) {
        clearTimeout(pending.timeoutHandle);
      }

      // Remove from pending
      pendingRequests.delete(response.requestId);

      // Handle response
      if (response.error) {
        console.log(`❌ [Worker Client] Error response for ${response.requestId}`);
        pending.reject(new Error(response.error));
      } else if (response.result) {
        console.log(`✅ [Worker Client] Success response for ${response.requestId}`);
        // Map worker result to EnhancedDLXCheckResult
        const result: EnhancedDLXCheckResult = mapWorkerResult(response.result);
        pending.resolve(result);
      } else {
        console.log(`⚠️ [Worker Client] Invalid response for ${response.requestId}`);
        pending.reject(new Error('Invalid worker response'));
      }
    });

    worker.addEventListener('error', (event) => {
      console.error('❌ [Worker Client] Worker error:', event);
      // Reject all pending requests
      for (const [requestId, pending] of pendingRequests.entries()) {
        if (pending.timeoutHandle) {
          clearTimeout(pending.timeoutHandle);
        }
        pending.reject(new Error(`Worker error: ${event.message}`));
        pendingRequests.delete(requestId);
      }
    });

    console.log('✅ [Worker Client] Worker created');
  }

  return worker;
}

function mapWorkerResult(workerResult: NonNullable<WorkerResponse['result']>): EnhancedDLXCheckResult {
  const { solvable, mode, emptyCount, solutionCount, definiteFailure, estimatedSearchSpace, validNextMoveCount } = workerResult;

  // Map to SolverState (unknown is only for timeouts, handled separately)
  let state: 'green' | 'orange' | 'red';
  let reason: string;

  if (mode === 'lightweight') {
    if (definiteFailure) {
      state = 'red';
      reason = 'Definite failure detected (lightweight check)';
    } else {
      state = 'orange';
      reason = 'Solvability unknown (lightweight mode)';
    }
  } else {
    // Full mode
    if (solvable) {
      state = 'green';
      reason = 'At least one solution exists';
    } else {
      state = 'red';
      reason = 'No solutions remain (DLX proof)';
    }
  }

  // DEBUG: Log the mapping
  console.log('🗺️ [mapWorkerResult] Mapping:', {
    inputSolvable: solvable,
    inputMode: mode,
    inputDefiniteFailure: definiteFailure,
    outputState: state,
    reason,
  });

  return {
    state,
    emptyCellCount: emptyCount,
    checkedDepth: mode === 'lightweight' ? 'existence' : 'existence',
    timedOut: false,
    solutionCount,
    estimatedSearchSpace,
    validNextMoveCount,
    reason,
  };
}

/**
 * Check solvability using Web Worker
 * Returns immediately on timeout with orange state
 */
export async function dlxWorkerCheck(
  input: DLXCheckInput,
  options: DLXCheckOptions = {}
): Promise<EnhancedDLXCheckResult> {
  const { timeoutMs = 5000, emptyThreshold = 90 } = options;
  const requestId = `req-${nextRequestId++}`;

  // Cancel previous latest request to avoid stale work
  if (latestRequestId && pendingRequests.has(latestRequestId)) {
    console.log(`🛑 [Worker Client] Cancelling previous request ${latestRequestId}`);
    dlxWorkerCancel(latestRequestId);
  }
  latestRequestId = requestId;

  return new Promise((resolve, reject) => {
    const w = getWorker();

    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      // Remove from pending
      const pending = pendingRequests.get(requestId);
      if (pending) {
        pendingRequests.delete(requestId);

        // Send cancel to worker
        const cancelMsg: WorkerRequest = { type: 'cancel', requestId };
        w.postMessage(cancelMsg);

        // Resolve with timeout result - use 'unknown' state per spec
        console.warn(`⏱️ [Worker Client] Request ${requestId} timed out after ${timeoutMs}ms`);
        resolve({
          state: 'unknown',
          emptyCellCount: input.emptyCells.length,
          checkedDepth: 'none',
          timedOut: true,
          reason: `Solvability check timed out after ${timeoutMs}ms`,
        });
      }
    }, timeoutMs);

    // Store pending request
    pendingRequests.set(requestId, {
      resolve,
      reject,
      timeoutHandle,
    });

    // Send request to worker
    const msg: WorkerRequest = {
      type: 'check',
      requestId,
      input,
      timeoutMs,
      emptyThreshold,
    };
    w.postMessage(msg);

    console.log(`📤 [Worker Client] Sent request ${requestId}`);
  });
}

/**
 * Cancel a specific request
 */
export function dlxWorkerCancel(requestId: string): void {
  const pending = pendingRequests.get(requestId);
  if (pending) {
    if (pending.timeoutHandle) {
      clearTimeout(pending.timeoutHandle);
    }
    
    // Reject the promise so it completes
    pending.reject(new Error('Request cancelled'));
    pendingRequests.delete(requestId);

    // Send cancel to worker
    if (worker) {
      const msg: WorkerRequest = { type: 'cancel', requestId };
      worker.postMessage(msg);
    }
  }
}

/**
 * Dispose worker and clean up all pending requests
 */
export function dlxWorkerDispose(): void {
  if (worker) {
    worker.terminate();
    worker = null;
    console.log('🗑️ [Worker Client] Worker terminated');
  }

  // Clear all pending requests
  for (const [requestId, pending] of pendingRequests.entries()) {
    if (pending.timeoutHandle) {
      clearTimeout(pending.timeoutHandle);
    }
    pending.reject(new Error('Worker disposed'));
  }
  pendingRequests.clear();
  latestRequestId = null;
}
