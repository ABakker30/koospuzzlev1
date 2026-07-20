import { useCallback, useRef, useState } from 'react';
import {
  engine2Solve,
  engine2Precompute,
  type Engine2RunHandle,
  type Engine2Settings,
} from '../../../engines/engine2';
import { WorkerPool, type AggregatedStatus } from '../../../engines/engine2/WorkerPool';
import type { PieceDB } from '../../../engines/dfs2';
import type { StatusV2, Placement } from '../../../engines/types';

type UseEngine2SolverOptions = {
  puzzle: any;
  loaded: boolean;
  piecesDb: PieceDB | null;
  engineSettings: Engine2Settings;
  pieceInventory?: Record<string, number>; // Per-piece inventory counts (for multi-set puzzles)
  onSolutionFound?: (solution: any[]) => Promise<void>;
  onResetSolution?: () => void;
  notify?: (message: string, type: 'success' | 'error' | 'info') => void;
  onRunStart?: (settings: Engine2Settings) => { runId: string };
  onRunDone?: (runId: string, summary: any) => void;
  onStatus?: (runId: string, status: StatusV2) => void;
  onSolution?: (runId: string) => void;
  pendingSeedRef?: React.MutableRefObject<number | null>;
  pendingSettingsOverrideRef?: React.MutableRefObject<Partial<Engine2Settings> | null>;
};

type UseEngine2SolverResult = {
  isAutoSolving: boolean;
  autoSolveStatus: StatusV2 | null;
  autoSolutionsFound: number;
  handleAutoSolve: () => Promise<void>;
  handleStopAutoSolve: () => void;
  handleResumeAutoSolve: () => void;
};

export const useEngine2Solver = ({
  puzzle,
  loaded,
  piecesDb,
  engineSettings,
  pieceInventory,
  onSolutionFound,
  onResetSolution,
  notify,
  onRunStart,
  onRunDone,
  onStatus,
  onSolution,
  pendingSeedRef,
  pendingSettingsOverrideRef,
}: UseEngine2SolverOptions): UseEngine2SolverResult => {
  const [isAutoSolving, setIsAutoSolving] = useState(false);
  const [autoSolveStatus, setAutoSolveStatus] = useState<StatusV2 | null>(null);
  const [autoSolutionsFound, setAutoSolutionsFound] = useState(0);

  const engineHandleRef = useRef<Engine2RunHandle | null>(null);
  const workerPoolRef = useRef<WorkerPool | null>(null);
  const savingInProgressRef = useRef(false);

  const handleAutoSolve = useCallback(async () => {
    if (!puzzle || !piecesDb || !loaded) {
      notify?.('Puzzle or pieces not loaded', 'info');
      return;
    }

    if (engineHandleRef.current || workerPoolRef.current) {
      return;
    }

    setIsAutoSolving(true);
    setAutoSolveStatus(null);
    setAutoSolutionsFound(0);
    savingInProgressRef.current = false;
    if (onResetSolution) {
      onResetSolution();
    }

    const runContext = onRunStart ? onRunStart(engineSettings) : { runId: '' };
    const currentRunId = runContext.runId;

    const containerCells: [number, number, number][] = puzzle.geometry.map(
      (cell: any) => [cell.i, cell.j, cell.k]
    );

    try {
      const pre = engine2Precompute(
        { cells: containerCells, id: puzzle.id },
        piecesDb
      );

      const settingsToUse = (() => {
        let settings = { ...engineSettings };
        
        // Apply piece inventory for multi-set puzzles
        if (pieceInventory) {
          settings = {
            ...settings,
            pieces: {
              ...settings.pieces,
              inventory: pieceInventory,
            },
          };
        }
        
        if (pendingSettingsOverrideRef?.current) {
          settings = { ...settings, ...pendingSettingsOverrideRef.current };
        }
        if (pendingSeedRef?.current) {
          settings = { ...settings, seed: pendingSeedRef.current };
        }
        return settings;
      })();

      if (pendingSeedRef) pendingSeedRef.current = null;
      if (pendingSettingsOverrideRef) pendingSettingsOverrideRef.current = null;

      // Check if parallel mode is enabled
      if (settingsToUse.parallel?.enable) {
        // Parallel mode: use WorkerPool
        const workerCount = settingsToUse.parallel.workerCount ?? navigator.hardwareConcurrency ?? 4;

        // Memory budget: each worker allocates its OWN transposition table, so a
        // flat per-worker size multiplies by core count (8 × 64MB = 512MB) and
        // OOMs the tab. Bound the AGGREGATE TT to a fixed budget, split across
        // workers, so total memory stays put no matter how many cores.
        const TOTAL_TT_BUDGET = 128 * 1024 * 1024; // 128 MB across ALL workers
        const baseTtBytes = settingsToUse.tt?.bytes ?? 64 * 1024 * 1024;
        const perWorkerTtBytes = Math.max(
          8 * 1024 * 1024,                                   // floor: 8MB/worker
          Math.min(baseTtBytes, Math.floor(TOTAL_TT_BUDGET / Math.max(1, workerCount)))
        );
        const workerSettings: Engine2Settings = {
          ...settingsToUse,
          tt: { ...settingsToUse.tt, enable: settingsToUse.tt?.enable ?? true, bytes: perWorkerTtBytes },
        };
        console.log(`🚀 Parallel solve: ${workerCount} workers, TT ${(perWorkerTtBytes / 1048576) | 0}MB each (~${((perWorkerTtBytes * workerCount) / 1048576) | 0}MB total)`);

        const pool = new WorkerPool(
          workerCount,
          containerCells,
          piecesDb,
          workerSettings,
          {
            onStatus: (aggregated: AggregatedStatus) => {
              // Convert aggregated status to StatusV2 format
              const status: StatusV2 = {
                nodes: aggregated.totalNodes,
                depth: aggregated.maxDepthReached, // Show max depth reached as current depth
                bestDepth: aggregated.maxDepthReached,
                maxDepthHits: aggregated.totalMaxDepthHits,
                solutions: 0,
                elapsedMs: aggregated.totalElapsedMs,
                nodesPerSec: aggregated.nodesPerSec,
                // Add worker info to status
                workers: aggregated.activeWorkers,
                totalWorkers: aggregated.workers,
              } as StatusV2 & { workers: number; totalWorkers: number };
              
              setAutoSolveStatus(status);
              if (onStatus) {
                onStatus(currentRunId, status);
              }
            },
            onSolution: async (placements: Placement[], workerId: number) => {
              console.log(`🎯 Worker ${workerId} found solution with ${placements.length} pieces`);
              if (onSolution) {
                onSolution(currentRunId);
              }
              savingInProgressRef.current = true;

              // Pool auto-cancels other workers when solution found
              setIsAutoSolving(false);

              try {
                if (onSolutionFound) {
                  await onSolutionFound(placements);
                }
                setAutoSolutionsFound(prev => prev + 1);
              } finally {
                savingInProgressRef.current = false;
                workerPoolRef.current?.terminate();
                workerPoolRef.current = null;
              }
            },
            onDone: (summary) => {
              setIsAutoSolving(false);
              workerPoolRef.current?.terminate();
              workerPoolRef.current = null;

              if (onRunDone) {
                onRunDone(currentRunId, {
                  solutions: summary.solutions,
                  nodes: summary.totalNodes,
                  elapsedMs: summary.totalElapsedMs,
                  reason: summary.reason,
                });
              }
            },
          }
        );

        workerPoolRef.current = pool;
        await pool.start();
      } else {
        // Single-threaded mode: use engine2Solve directly
        const handle = engine2Solve(pre, settingsToUse, {
          onStatus: (status: StatusV2) => {
            setAutoSolveStatus(status);
            if (onStatus) {
              onStatus(currentRunId, status);
            }
          },
          onDone: (summary: any) => {
            setIsAutoSolving(false);
            engineHandleRef.current = null;

            if (onRunDone) {
              onRunDone(currentRunId, summary);
            }
          },
          onSolution: async (placement: any[]) => {
            console.log('🎯 Solution callback triggered, pieces:', placement.length);
            if (onSolution) {
              onSolution(currentRunId);
            }
            savingInProgressRef.current = true;

            if (engineHandleRef.current) {
              engineHandleRef.current.pause();
            }
            setIsAutoSolving(false);

            try {
              if (onSolutionFound) {
                await onSolutionFound(placement);
              }
              setAutoSolutionsFound(prev => prev + 1);
            } finally {
              savingInProgressRef.current = false;
            }
          },
        });

        engineHandleRef.current = handle;
        handle.resume();
      }
    } catch (error: any) {
      console.error('❌ Auto-solve failed:', error);
      if (notify) {
        notify(
          `Auto-solve error: ${error?.message ?? String(error)}`,
          'error'
        );
      }
      setIsAutoSolving(false);
      setAutoSolveStatus(null);
      engineHandleRef.current = null;
    }
  }, [
    puzzle,
    piecesDb,
    loaded,
    engineSettings,
    pieceInventory,
    notify,
    onSolutionFound,
    onResetSolution,
    onRunStart,
    onRunDone,
    onStatus,
    onSolution,
  ]);

  const handleStopAutoSolve = useCallback(() => {
    if (engineHandleRef.current) {
      // CANCEL, not pause. A paused engine keeps its heartbeat setTimeout
      // spinning forever (so resume can work) and pins its whole closure —
      // the 64MB transposition table, precompute, and search state. Nulling
      // the ref after pause() orphans that: it can never be stopped, and the
      // next Start allocates a fresh engine on top of it. cancel() stops the
      // loop and releases the closure for GC, leaving a clean slate.
      engineHandleRef.current.cancel();
      engineHandleRef.current = null;
    }
    if (workerPoolRef.current) {
      workerPoolRef.current.cancel();
      workerPoolRef.current.terminate();
      workerPoolRef.current = null;
    }
    setIsAutoSolving(false);
    setAutoSolveStatus(null);
    if (onResetSolution) {
      onResetSolution();
    }
  }, [onResetSolution]);

  const handleResumeAutoSolve = useCallback(() => {
    if (engineHandleRef.current) {
      console.log('🔄 Resuming auto-solve to find next solution...');
      setIsAutoSolving(true);
      if (onResetSolution) {
        onResetSolution();
      }
      engineHandleRef.current.resume();
    } else {
      void handleAutoSolve();
    }
  }, [handleAutoSolve, onResetSolution]);

  return {
    isAutoSolving,
    autoSolveStatus,
    autoSolutionsFound,
    handleAutoSolve,
    handleStopAutoSolve,
    handleResumeAutoSolve,
  };
};
