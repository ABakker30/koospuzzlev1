// src/pages/solve/hooks/useGPUSolver.ts
// GPU Solver hook - similar interface to useEngine2Solver but uses GPU engine

import { useCallback, useRef, useState, useEffect } from 'react';
import {
  engineGPUSolve,
  engineGPUPrecompute,
  type EngineGPUSettings,
  type EngineGPURunHandle,
  type GPUStatus,
} from '../../../engines/engineGPU';
import { detectGPUCapability } from '../../../engines/engineGPU/gpuDetect';
import type { PieceDB } from '../../../engines/dfs2';
import type { StatusV2, Placement } from '../../../engines/types';

type UseGPUSolverOptions = {
  puzzle: any;
  loaded: boolean;
  piecesDb: PieceDB | null;
  engineSettings: EngineGPUSettings;
  onSolutionFound?: (solution: any[]) => Promise<void>;
  onResetSolution?: () => void;
  notify?: (message: string, type: 'success' | 'error' | 'info') => void;
  onRunStart?: (settings: EngineGPUSettings) => { runId: string };
  onRunDone?: (runId: string, summary: any) => void;
  onStatus?: (runId: string, status: StatusV2) => void;
  onSolution?: (runId: string) => void;
};

type UseGPUSolverResult = {
  isAutoSolving: boolean;
  autoSolveStatus: GPUStatus | null;
  autoSolutionsFound: number;
  handleAutoSolve: () => Promise<void>;
  handleStopAutoSolve: () => void;
  handleResumeAutoSolve: () => void;
  gpuAvailable: boolean;
  gpuReason?: string;
};

export const useGPUSolver = ({
  puzzle,
  loaded,
  piecesDb,
  engineSettings,
  onSolutionFound,
  onResetSolution,
  notify,
  onRunStart,
  onRunDone,
  onStatus,
  onSolution,
}: UseGPUSolverOptions): UseGPUSolverResult => {
  const [isAutoSolving, setIsAutoSolving] = useState(false);
  const [autoSolveStatus, setAutoSolveStatus] = useState<GPUStatus | null>(null);
  const [autoSolutionsFound, setAutoSolutionsFound] = useState(0);
  const [gpuAvailable, setGpuAvailable] = useState(false);
  const [gpuReason, setGpuReason] = useState<string | undefined>();

  const engineHandleRef = useRef<EngineGPURunHandle | null>(null);
  const savingInProgressRef = useRef(false);

  // Check GPU availability on mount
  useEffect(() => {
    detectGPUCapability().then((capability) => {
      setGpuAvailable(capability.supported);
      setGpuReason(capability.reason);
      if (capability.supported) {
        console.log('🎮 GPU solver available');
      } else {
        console.log('⚠️ GPU solver not available:', capability.reason);
      }
    });
  }, []);

  const handleAutoSolve = useCallback(async () => {
    if (!puzzle || !piecesDb || !loaded) {
      notify?.('Puzzle or pieces not loaded', 'info');
      return;
    }

    if (!gpuAvailable) {
      notify?.(`GPU not available: ${gpuReason}`, 'error');
      return;
    }

    if (engineHandleRef.current) {
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

    console.log('🎮 [useGPUSolver] Container cells:', containerCells.length);
    console.log('🎮 [useGPUSolver] Pieces DB size:', piecesDb.size);
    console.log('🎮 [useGPUSolver] Engine settings:', engineSettings);

    try {
      console.log('🎮 [useGPUSolver] Calling engineGPUPrecompute...');
      const pre = engineGPUPrecompute(
        { cells: containerCells, id: puzzle.id },
        piecesDb
      );
      console.log('🎮 [useGPUSolver] Precompute done, pieces:', pre.pieces.length);

      console.log('🎮 [useGPUSolver] Calling engineGPUSolve...');
      const handle = await engineGPUSolve(pre, engineSettings, {
        onStatus: (status: GPUStatus) => {
          setAutoSolveStatus(status);
          if (onStatus) {
            // Convert GPUStatus to StatusV2 for compatibility
            const statusV2: StatusV2 = {
              engine: 'gpu',
              phase: status.phase === 'done' ? 'done' : 'search',
              nodes: status.nodes,
              elapsedMs: status.elapsedMs,
              stack: [],
              depth: 0,
              bestDepth: 0,
              maxDepthHits: 0,
            };
            onStatus(currentRunId, statusV2);
          }
        },
        onDone: (summary) => {
          setIsAutoSolving(false);
          engineHandleRef.current = null;

          if (onRunDone) {
            onRunDone(currentRunId, {
              solutions: summary.solutions,
              nodes: summary.totalNodes,
              elapsedMs: summary.elapsedMs,
              reason: summary.reason,
              gpuInfo: summary.gpuInfo,
              timing: summary.timing,
            });
          }
        },
        onSolution: async (placements: Placement[]) => {
          console.log('🎮 GPU Solution found, pieces:', placements.length);
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
              await onSolutionFound(placements);
            }
            setAutoSolutionsFound(prev => prev + 1);
          } finally {
            savingInProgressRef.current = false;
          }
        },
      });

      engineHandleRef.current = handle;

    } catch (error: any) {
      console.error('❌ GPU Auto-solve failed:', error);
      if (notify) {
        notify(
          `GPU Auto-solve error: ${error?.message ?? String(error)}`,
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
    gpuAvailable,
    gpuReason,
    engineSettings,
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
      engineHandleRef.current.cancel();
      engineHandleRef.current = null;
    }
    setIsAutoSolving(false);
    setAutoSolveStatus(null);
    if (onResetSolution) {
      onResetSolution();
    }
  }, [onResetSolution]);

  const handleResumeAutoSolve = useCallback(() => {
    if (engineHandleRef.current) {
      console.log('🔄 Resuming GPU auto-solve...');
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
    gpuAvailable,
    gpuReason,
  };
};
