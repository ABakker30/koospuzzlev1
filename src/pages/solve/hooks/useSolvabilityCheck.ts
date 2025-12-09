import { useState, useEffect, useCallback } from 'react';
import type { IJK } from '../../../types/shape';
import type { PlacedPiece } from '../types/manualSolve';
import type { DLXCheckInput } from '../../../engines/dlxSolver';
import { dlxCheckSolvable } from '../../../engines/dlxSolver';

type Mode = 'oneOfEach' | 'unlimited' | 'single';

type SolvableStatus = 'unknown' | 'checking' | 'solvable' | 'unsolvable';

type RemainingPieceInfo = {
  pieceId: string;
  remaining: number | 'infinite';
};

type UseSolvabilityCheckOptions = {
  puzzle: any;
  cells: IJK[];
  mode: Mode;
  placed: Map<string, PlacedPiece>;
  activePiece: string; // For single/identical pieces mode
  setSolvableStatus: (status: SolvableStatus) => void;
  setNotification: (msg: string) => void;
  setNotificationType: (type: 'info' | 'warning' | 'error' | 'success') => void;
};

export const useSolvabilityCheck = ({
  puzzle,
  cells,
  mode,
  placed,
  activePiece,
  setSolvableStatus,
  setNotification,
  setNotificationType,
}: UseSolvabilityCheckOptions) => {
  const [solvabilityChecksUsed, setSolvabilityChecksUsed] = useState(0);

  // Reset solvability status when board changes
  useEffect(() => {
    setSolvableStatus('unknown');
  }, [placed, setSolvableStatus]);

  const handleRequestSolvability = useCallback(async () => {
    if (!puzzle) return;

    // Helper to compute empty cells
    const ijkToKey = (cell: IJK) => `${cell.i},${cell.j},${cell.k}`;
    const occupied = new Set<string>();
    placed.forEach(piece => {
      piece.cells.forEach(c => occupied.add(ijkToKey(c)));
    });
    const emptyCells = cells.filter(c => !occupied.has(ijkToKey(c)));

    // Helper to build remaining pieces
    const computeRemainingPieces = (): RemainingPieceInfo[] => {
      const remaining: RemainingPieceInfo[] = [];
      const allPieceIds = [
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
        'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y',
      ];

      if (mode === 'oneOfEach') {
        const usedPieces = new Set(
          Array.from(placed.values()).map(p => p.pieceId)
        );
        for (const pid of allPieceIds) {
          remaining.push({
            pieceId: pid,
            remaining: usedPieces.has(pid) ? 0 : 1,
          });
        }
      } else if (mode === 'unlimited') {
        for (const pid of allPieceIds) {
          remaining.push({ pieceId: pid, remaining: 'infinite' });
        }
      } else if (mode === 'single') {
        // Identical pieces mode: only one piece type allowed (infinitely)
        let singleId: string | null = null;

        // Determine the single piece type
        const placedValues = Array.from(placed.values());
        if (placedValues.length > 0) {
          // Use the first placed piece type
          singleId = placedValues[0].pieceId;

          // Validate: check if user placed multiple different piece types (invalid state)
          const distinctIds = new Set(placedValues.map(p => p.pieceId));
          if (distinctIds.size > 1) {
            console.warn('⚠️ Single mode violation: multiple piece types placed');
            // State is unsolvable by definition - return all zeros
            for (const pid of allPieceIds) {
              remaining.push({ pieceId: pid, remaining: 0 });
            }
            return remaining;
          }
        } else if (activePiece) {
          // No pieces placed yet, use the active piece selection
          singleId = activePiece;
        }

        // If we still don't know the single type, can't do meaningful check
        if (!singleId) {
          console.warn('⚠️ Single mode: no piece type determined yet');
          return [];
        }

        // Build inventory: infinite for the single type, 0 for all others
        for (const pid of allPieceIds) {
          remaining.push({
            pieceId: pid,
            remaining: pid === singleId ? 'infinite' : 0,
          });
        }
      }

      return remaining;
    };

    const remainingPieces = computeRemainingPieces();

    // Handle edge cases for single mode
    if (mode === 'single' && remainingPieces.length === 0) {
      setNotification('In identical pieces mode, place the first piece to define the shape before checking solvability.');
      setNotificationType('info');
      return;
    }

    // Check if state is unsolvable due to mode violation
    if (mode === 'single') {
      const placedValues = Array.from(placed.values());
      if (placedValues.length > 0) {
        const distinctIds = new Set(placedValues.map(p => p.pieceId));
        if (distinctIds.size > 1) {
          setSolvableStatus('unsolvable');
          setNotification('❌ Position uses multiple piece types - unsolvable in identical pieces mode.');
          setNotificationType('warning');
          return;
        }
      }
    }

    // Track usage
    setSolvabilityChecksUsed(prev => prev + 1);

    // Determine if we're running a full check (≤30 empty cells)
    const emptyCount = emptyCells.length;
    const runFullCheck = emptyCount <= 30;

    // Only show "checking" modal for full DFS checks (lightweight checks are instant)
    if (runFullCheck) {
      setSolvableStatus('checking');
    }

    const dlxInput: DLXCheckInput = {
      containerCells: cells,
      placedPieces: Array.from(placed.values()),
      emptyCells,
      remainingPieces,
      mode,
    };

    try {
      // Add 5-second timeout wrapper
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Solvability check timed out after 5 seconds')), 5000);
      });

      const result = await Promise.race([
        dlxCheckSolvable(dlxInput),
        timeoutPromise
      ]);
      console.log('🧠 DLX/hintEngine solvable result:', result);

      // Handle lightweight mode (>30 empty cells)
      if (result.mode === 'lightweight') {
        if (result.definiteFailure) {
          setSolvableStatus('unsolvable');
          setNotification('❌ Unsolvable Configuration\n\nA lightweight check found a definitive obstruction (e.g., mod-4 violation or disconnected region) that makes this puzzle impossible to complete.');
          setNotificationType('warning');
        } else {
          setSolvableStatus('solvable');
          setNotification(`✅ Still Potentially Solvable\n\nWith ${result.emptyCount} empty cells, only lightweight feasibility checks were performed. No contradictions found—this puzzle still has the potential to be solved.\n\nFull solvability verification will activate once you reach 30 or fewer empty cells.`);
          setNotificationType('info');
        }
      }
      // Handle full mode (≤30 empty cells)
      else if (result.mode === 'full') {
        if (result.solvable) {
          setSolvableStatus('solvable');
          setNotification(`✅ Puzzle Solvable\n\nWith ${result.emptyCount} empty cells remaining, a full-depth solvability check was performed. This puzzle can be completed!`);
          setNotificationType('success');
        } else {
          setSolvableStatus('unsolvable');
          setNotification(`❌ Puzzle Not Solvable\n\nA full solvability check (DFS verification) indicates that the current configuration cannot lead to a valid solution.`);
          setNotificationType('warning');
        }
      }
    } catch (err) {
      console.error('❌ Solvability check failed:', err);
      setSolvableStatus('unknown');
      
      // Check if it's a timeout error
      const isTimeout = err instanceof Error && err.message.includes('timed out');
      
      if (isTimeout) {
        setNotification('⏱️ Solvability check timed out after 5 seconds. The puzzle configuration may be too complex to verify quickly.');
        setNotificationType('warning');
      } else {
        setNotification('❌ Solvability check failed');
        setNotificationType('error');
      }
    }
  }, [
    puzzle,
    cells,
    mode,
    placed,
    activePiece,
    setSolvableStatus,
    setNotification,
    setNotificationType,
  ]);

  return {
    solvabilityChecksUsed,
    handleRequestSolvability,
  };
};
