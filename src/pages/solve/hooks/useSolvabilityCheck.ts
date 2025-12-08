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
  setSolvableStatus: (status: SolvableStatus) => void;
  setNotification: (msg: string) => void;
  setNotificationType: (type: 'info' | 'warning' | 'error' | 'success') => void;
};

export const useSolvabilityCheck = ({
  puzzle,
  cells,
  mode,
  placed,
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

      if (mode === 'oneOfEach') {
        const usedPieces = new Set(
          Array.from(placed.values()).map(p => p.pieceId)
        );
        const allPieceIds = [
          'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
          'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y',
        ];
        for (const pid of allPieceIds) {
          remaining.push({
            pieceId: pid,
            remaining: usedPieces.has(pid) ? 0 : 1,
          });
        }
      } else if (mode === 'unlimited') {
        const allPieceIds = [
          'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
          'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y',
        ];
        for (const pid of allPieceIds) {
          remaining.push({ pieceId: pid, remaining: 'infinite' });
        }
      }

      return remaining;
    };

    const remainingPieces = computeRemainingPieces();

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
    setSolvableStatus,
    setNotification,
    setNotificationType,
  ]);

  return {
    solvabilityChecksUsed,
    handleRequestSolvability,
  };
};
