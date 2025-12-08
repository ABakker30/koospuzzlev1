import { useState, useEffect, useCallback } from 'react';
import type { IJK } from '../../../types/shape';
import type { PlacedPiece } from '../types/manualSolve';
import type { DLXCheckInput } from '../../../engines/dlxSolver';
import { dlxGetHint } from '../../../engines/dlxSolver';
import { GoldOrientationService } from '../../../services/GoldOrientationService';

type Mode = 'oneOfEach' | 'unlimited' | 'single';

type RemainingPieceInfo = {
  pieceId: string;
  remaining: number | 'infinite';
};

type UseHintSystemOptions = {
  puzzle: any;
  cells: IJK[];
  mode: Mode;
  placed: Map<string, PlacedPiece>;
  orientationService: GoldOrientationService | null;
  placePiece: (piece: PlacedPiece) => void;
  setNotification: (msg: string) => void;
  setNotificationType: (type: 'info' | 'warning' | 'error' | 'success') => void;
};

export const useHintSystem = ({
  puzzle,
  cells,
  mode,
  placed,
  orientationService,
  placePiece,
  setNotification,
  setNotificationType,
}: UseHintSystemOptions) => {
  const [hintCells, setHintCells] = useState<IJK[] | null>(null);
  const [pendingHintPiece, setPendingHintPiece] = useState<PlacedPiece | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);

  // Auto-place hint after 500ms preview
  useEffect(() => {
    if (!hintCells || !pendingHintPiece) return;

    const timer = setTimeout(() => {
      placePiece(pendingHintPiece);
      setHintCells(null);
      setPendingHintPiece(null);
    }, 500);

    return () => clearTimeout(timer);
  }, [hintCells, pendingHintPiece, placePiece]);

  const handleRequestHint = useCallback(async (drawingCells: IJK[]) => {
    if (!puzzle) return;

    // User must have double-clicked a cell to start drawing
    if (drawingCells.length === 0) {
      setNotification(
        'Double-click a cell first, then request a hint for that cell.'
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
    const targetCell = drawingCells[0];

    // Track usage for scoring/ranking
    setHintsUsed(prev => prev + 1);

    const emptyCells = cells.filter(containerCell => {
      const ijkToKey = (c: IJK) => `${c.i},${c.j},${c.k}`;
      const cellKey = ijkToKey(containerCell);
      for (const [, piece] of placed) {
        if (piece.cells.some(pc => ijkToKey(pc) === cellKey)) {
          return false;
        }
      }
      return true;
    });

    const dlxInput: DLXCheckInput = {
      containerCells: cells,
      placedPieces: Array.from(placed.values()),
      emptyCells,
      remainingPieces,
      mode,
    };

    try {
      const result = await dlxGetHint(dlxInput, targetCell);
      console.log('💡 DLX hint result:', result);

      if (!result || !result.solvable || !result.hintedPieceId || !result.hintedAnchorCell) {
        setNotification('No hint available for this position.');
        setNotificationType('info');
        return;
      }

      const pieceId = result.hintedPieceId;
      // Orientation may be missing; we'll use fallback logic.
      const orientationId = result.hintedOrientationId ?? '';
      const anchor = result.hintedAnchorCell;

      const orientations = orientationService?.getOrientations(pieceId);
      if (!orientations || orientations.length === 0) {
        console.warn(`⚠️ No orientations found for hinted piece ${pieceId}`);
        setNotification('Internal hint error (no orientations).');
        setNotificationType('error');
        return;
      }

      let orientation = orientations.find(
        (o: any) => o.orientationId === orientationId
      );

      if (!orientation) {
        console.warn(
          `⚠️ Orientation ${orientationId} not found for hinted piece ${pieceId}, falling back to first orientation` 
        );
        orientation = orientations[0];
        if (!orientation) {
          setNotification('Internal hint error (orientation mismatch).');
          setNotificationType('error');
          return;
        }
      }

      // Compute world-space cells for the hinted piece
      const cellsForHint: IJK[] = orientation.ijkOffsets.map((offset: any) => ({
        i: anchor.i + offset.i,
        j: anchor.j + offset.j,
        k: anchor.k + offset.k,
      }));

      const uid = `hint-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;

      const hintedPiece: PlacedPiece = {
        pieceId,
        orientationId,
        anchorSphereIndex: 0,
        cells: cellsForHint,
        uid,
        placedAt: Date.now(),
      };

      // Show golden preview & schedule auto-place via effect
      setHintCells(cellsForHint);
      setPendingHintPiece(hintedPiece);
    } catch (err) {
      console.error('❌ DLX hint failed:', err);
      setNotification('Hint request failed');
      setNotificationType('error');
    }
  }, [
    puzzle,
    cells,
    mode,
    placed,
    orientationService,
    setNotification,
    setNotificationType,
    placePiece,
  ]);

  return {
    hintCells,
    pendingHintPiece,
    hintsUsed,
    handleRequestHint,
  };
};
