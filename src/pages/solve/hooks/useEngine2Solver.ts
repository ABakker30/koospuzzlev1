import { useCallback, useRef, useState } from 'react';
import {
  engine2Solve,
  engine2Precompute,
  type Engine2RunHandle,
  type Engine2Settings,
} from '../../../engines/engine2';
import type { PieceDB } from '../../../engines/dfs2';
import type { StatusV2 } from '../../../engines/types';

type NotifyType = 'info' | 'warning' | 'error' | 'success';

type UseEngine2SolverOptions = {
  puzzle: any | null;
  loaded: boolean;
  piecesDb: PieceDB | null;
  engineSettings: Engine2Settings;
  onSolutionFound: (placement: any[]) => Promise<void> | void;
  onResetSolution?: () => void;
  notify: (message: string, type: NotifyType) => void;
  onRunStart?: (settings: Engine2Settings) => void; // Task 2: Called when run starts
  onRunDone?: (summary: any) => void; // Task 3: Called when run ends
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
  onSolutionFound,
  onResetSolution,
  notify,
  onRunStart,
  onRunDone,
}: UseEngine2SolverOptions): UseEngine2SolverResult => {
  const [isAutoSolving, setIsAutoSolving] = useState(false);
  const [autoSolveStatus, setAutoSolveStatus] = useState<StatusV2 | null>(null);
  const [autoSolutionsFound, setAutoSolutionsFound] = useState(0);

  const engineHandleRef = useRef<Engine2RunHandle | null>(null);
  const savingInProgressRef = useRef(false);

  const handleAutoSolve = useCallback(async () => {
    if (!puzzle || !piecesDb || !loaded) {
      notify('Puzzle or pieces not loaded', 'warning');
      return;
    }

    if (engineHandleRef.current) {
      console.log('⚠️ Auto-solve already in progress');
      return;
    }

    console.log('🤖 Starting auto-solve with Engine 2');
    setIsAutoSolving(true);
    setAutoSolveStatus(null);
    setAutoSolutionsFound(0);
    savingInProgressRef.current = false;
    if (onResetSolution) {
      onResetSolution();
    }
    
    // Task 2: Notify run start for stats tracking
    if (onRunStart) {
      onRunStart(engineSettings);
    }

    const containerCells: [number, number, number][] = puzzle.geometry.map(
      (cell: any) => [cell.i, cell.j, cell.k]
    );

    try {
      console.log('🔧 Precomputing...');
      const pre = engine2Precompute(
        { cells: containerCells, id: puzzle.id },
        piecesDb
      );
      console.log('✅ Precompute complete');

      console.log('🔧 Starting solve...');
      const handle = engine2Solve(pre, engineSettings, {
        onStatus: (status: StatusV2) => {
          setAutoSolveStatus(status);
          console.log(
            `🤖 Auto-solve status: depth=${status.depth}, nodes=${status.nodes}, placed=${status.placed}`
          );
        },
        onDone: (summary: any) => {
          console.log('🏁 Auto-solve run completed:', summary);
          setIsAutoSolving(false);
          engineHandleRef.current = null;
          
          // Task 3: Notify run end for stats logging
          if (onRunDone) {
            onRunDone(summary);
          }
        },
        onSolution: async (placement: any[]) => {
          console.log('🎉 [APP] Solution found! onSolution callback triggered');
          console.log(
            `🔍 [APP-DEBUG] savingInProgressRef.current: ${savingInProgressRef.current}`
          );
          console.log(
            `🔍 [APP-DEBUG] Placement pieces:`,
            placement.map((p: any) => p.pieceId).join(',')
          );

          if (savingInProgressRef.current) {
            console.log(
              '⚠️ [APP] Save already in progress, ignoring duplicate callback'
            );
            return;
          }
          console.log('✅ [APP] Setting savingInProgressRef to true');
          savingInProgressRef.current = true;

          if (engineHandleRef.current) {
            engineHandleRef.current.pause();
          }
          setIsAutoSolving(false);

          try {
            await onSolutionFound(placement);
            setAutoSolutionsFound(prev => prev + 1);
          } finally {
            savingInProgressRef.current = false;
          }
        },
      });

      engineHandleRef.current = handle;
      handle.resume();
    } catch (error: any) {
      console.error('❌ Auto-solve failed:', error);
      notify(
        `Auto-solve error: ${error?.message ?? String(error)}`,
        'error'
      );
      setIsAutoSolving(false);
      setAutoSolveStatus(null);
      engineHandleRef.current = null;
    }
  }, [
    puzzle,
    piecesDb,
    loaded,
    engineSettings,
    notify,
    onSolutionFound,
    onResetSolution,
    onRunStart,
    onRunDone,
  ]);

  const handleStopAutoSolve = useCallback(() => {
    if (engineHandleRef.current) {
      engineHandleRef.current.pause();
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
