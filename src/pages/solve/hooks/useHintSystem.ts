import { useState, useEffect, useCallback } from 'react';
import type { IJK } from '../../../types/shape';
import type { PlacedPiece } from '../types/manualSolve';
import type { DLXCheckInput } from '../../../engines/dlxSolver';
import { dlxGetHint } from '../../../engines/dlxSolver';
import { GoldOrientationService } from '../../../services/GoldOrientationService';

type Mode = 'oneOfEach' | 'unlimited' | 'single' | 'customSet';
type Inventory = Record<string, number>;

type RemainingPieceInfo = {
  pieceId: string;
  remaining: number | 'infinite';
};

type UseHintSystemOptions = {
  puzzle: any;
  cells: IJK[];
  mode: Mode;
  placed: Map<string, PlacedPiece>;
  activePiece: string; // For single/identical pieces mode
  customInventory?: Inventory; // For customSet mode
  placedCountByPieceId?: Record<string, number>; // For customSet mode
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
  activePiece,
  customInventory = {},
  placedCountByPieceId = {},
  orientationService,
  placePiece,
  setNotification,
  setNotificationType,
}: UseHintSystemOptions) => {
  const [hintCells, setHintCells] = useState<IJK[] | null>(null);
  const [pendingHintPiece, setPendingHintPiece] = useState<PlacedPiece | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);

  // Auto-place hint after 1s preview (matches hint fade-in animation duration)
  useEffect(() => {
    if (!hintCells || !pendingHintPiece) return;

    const timer = setTimeout(() => {
      placePiece(pendingHintPiece);
      setHintCells(null);
      setPendingHintPiece(null);
    }, 1000);

    return () => clearTimeout(timer);
  }, [hintCells, pendingHintPiece, placePiece]);

  const handleRequestHint = useCallback(async (drawingCells: IJK[]) => {
    console.log('💡 [HINT-SYSTEM] handleRequestHint called', {
      hasPuzzle: !!puzzle,
      drawingCellsLength: drawingCells.length,
      mode,
      placedCount: placed.size,
      hasOrientationService: !!orientationService
    });

    if (!puzzle) {
      console.log('⚠️ [HINT-SYSTEM] No puzzle, returning');
      return;
    }

    // User must have double-clicked a cell to start drawing
    if (drawingCells.length === 0) {
      console.log('⚠️ [HINT-SYSTEM] No drawing cells');
      setNotification(
        'Double-click a cell first, then request a hint for that cell.'
      );
      setNotificationType('info');
      return;
    }

    console.log('✅ [HINT-SYSTEM] Starting hint solver...');

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
            console.warn('⚠️ Single mode violation in hint: multiple piece types placed');
            // State is unsolvable - return all zeros
            for (const pid of allPieceIds) {
              remaining.push({ pieceId: pid, remaining: 0 });
            }
            return remaining;
          }
        } else if (activePiece) {
          // No pieces placed yet, use the active piece selection
          singleId = activePiece;
        }

        // If we still don't know the single type, can't provide a hint
        if (!singleId) {
          console.warn('⚠️ Single mode hint: no piece type determined yet');
          return [];
        }

        // Build inventory: infinite for the single type, 0 for all others
        for (const pid of allPieceIds) {
          remaining.push({
            pieceId: pid,
            remaining: pid === singleId ? 'infinite' : 0,
          });
        }
      } else if (mode === 'customSet') {
        // Custom set mode: use inventory - placed count
        for (const pid of allPieceIds) {
          const available = customInventory[pid] ?? 0;
          const placed = placedCountByPieceId[pid] ?? 0;
          const remainingCount = Math.max(0, available - placed);
          remaining.push({
            pieceId: pid,
            remaining: remainingCount,
          });
        }
      }

      return remaining;
    };

    const remainingPieces = computeRemainingPieces();
    const targetCell = drawingCells[0];
    
    // 🟪 PROBE A: Log targetCell entering hint system
    const tk = `${targetCell.i},${targetCell.j},${targetCell.k}`;
    console.log('🟪 [HINT-SYSTEM] targetCell entering dlxGetHint', { targetCell, tk });
    
    // 🧱 PROBE B: Verify target is in container universe
    const inContainer = cells.some(c => `${c.i},${c.j},${c.k}` === tk);
    console.log('🧱 [HINT-SYSTEM] target in container?', { 
      tk, 
      inContainer, 
      containerN: cells.length,
      sampleContainerCells: cells.slice(0, 3).map(c => `${c.i},${c.j},${c.k}`)
    });

    // Debug logging for customSet mode
    if (mode === 'customSet') {
      const piecesWithInventory = remainingPieces.map(p => ({
        pieceId: p.pieceId,
        remaining: p.remaining,
        available: customInventory[p.pieceId] ?? 0,
        placed: placedCountByPieceId[p.pieceId] ?? 0
      }));
      
      console.log('🔍 [HINT-SYSTEM] CustomSet Mode - ALL PIECES:', piecesWithInventory);
      console.log('🔍 [HINT-SYSTEM] Pieces with inventory > 0:', 
        piecesWithInventory.filter(p => typeof p.remaining === 'number' && p.remaining > 0)
      );
      console.log('🔍 [HINT-SYSTEM] Total available count:', 
        remainingPieces.reduce((sum, p) => sum + (typeof p.remaining === 'number' ? p.remaining : 999), 0)
      );
    }

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
      console.log('🔍 [HINT-SYSTEM] Calling dlxGetHint with:', {
        targetCell,
        targetKey: tk,
        mode,
        emptyCount: emptyCells.length,
        placedCount: placed.size,
        remainingPiecesCount: remainingPieces.length,
        piecesWithCount: remainingPieces.filter(p => typeof p.remaining === 'number' && p.remaining > 0).map(p => `${p.pieceId}:${p.remaining}`)
      });
      const result = await dlxGetHint(dlxInput, targetCell);
      console.log('💡 [HINT-SYSTEM] DLX hint result:', result);

      if (!result || !result.solvable || !result.hintedPieceId || !result.hintedAnchorCell) {
        console.log('❌ [HINT-SYSTEM] No valid hint found', {
          hasResult: !!result,
          solvable: result?.solvable,
          hasPieceId: !!result?.hintedPieceId,
          hasAnchor: !!result?.hintedAnchorCell
        });
        setNotification('No hint available for this position.');
        setNotificationType('info');
        // CRITICAL: Clear hint cells so the effect knows solver finished
        setHintCells([]);
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
      const key = (c: IJK) => `${c.i},${c.j},${c.k}`;
      const occ = new Set(Array.from(placed.values()).flatMap(p => p.cells.map(key)));
      const hintKeys = cellsForHint.map(key);
      const overlapsNow = hintKeys.filter(k => occ.has(k));
      
      console.log('✅ [HINT-SYSTEM] Setting hint cells', {
        cellCount: cellsForHint.length,
        pieceId,
        orientationId,
        cells: cellsForHint
      });
      console.log("🧩 [HINT-SYSTEM] cellsKeys", {
        pieceId,
        orientationId,
        targetKey: `${targetCell.i},${targetCell.j},${targetCell.k}`,
        cellsKeys: hintKeys,
      });
      console.log("🧩 [HINT-SYSTEM] overlap check at generation", {
        targetKey: `${targetCell.i},${targetCell.j},${targetCell.k}`,
        hintKeys,
        overlapCount: overlapsNow.length,
        overlapsNow,
      });
      setHintCells(cellsForHint);
      setPendingHintPiece(hintedPiece);
    } catch (err) {
      console.error('❌ [HINT-SYSTEM] DLX hint failed:', err);
      setNotification('Hint request failed');
      setNotificationType('error');
      // CRITICAL: Clear hint cells so the effect knows solver finished with error
      setHintCells([]);
    }
  }, [
    puzzle,
    cells,
    mode,
    placed,
    customInventory,
    placedCountByPieceId,
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
