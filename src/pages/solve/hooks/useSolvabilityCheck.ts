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

    // Threshold: only check if fewer than 30 empty cells
    if (emptyCells.length >= 30) {
      setNotification(
        'Solvability check is only available when fewer than 30 empty cells remain.'
      );
      setNotificationType('info');
      return;
    }

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

    setSolvableStatus('checking');

    const dlxInput: DLXCheckInput = {
      containerCells: cells,
      placedPieces: Array.from(placed.values()),
      emptyCells,
      remainingPieces,
      mode,
    };

    try {
      const result = await dlxCheckSolvable(dlxInput);
      console.log('🧠 DLX/hintEngine solvable result:', result);

      if (result.solvable) {
        setSolvableStatus('solvable');
        setNotification('✅ This position is solvable!');
        setNotificationType('success');
      } else {
        setSolvableStatus('unsolvable');
        setNotification('❌ This position cannot be solved.');
        setNotificationType('warning');
      }
    } catch (err) {
      console.error('❌ Solvability check failed:', err);
      setSolvableStatus('unknown');
      setNotification('Solvability check failed');
      setNotificationType('error');
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
