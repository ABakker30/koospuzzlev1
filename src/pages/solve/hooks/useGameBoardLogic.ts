import { useCallback, useState } from 'react';
import type { IJK } from '../../../types/shape';
import type { PlacedPiece } from '../types/manualSolve';
import { usePlacedPiecesWithUndo } from './usePlacedPiecesWithUndo';
import { useOrientationService } from './useOrientationService';
import { useManualDrawing } from './useManualDrawing';
import { findFirstMatchingPiece } from '../utils/manualSolveMatch';
import { DEFAULT_PIECE_LIST } from '../utils/manualSolveHelpers';

type InteractionTarget = 'cell' | 'piece' | 'background' | 'ghost';
type InteractionType = 'single' | 'double' | 'long';

interface UseGameBoardLogicOptions {
  onPiecePlaced?: (info: {
    pieceId: string;
    orientationId: string;
    cells: IJK[];
  }) => void;
  onPieceRemoved?: (info: {
    pieceId: string;
    uid: string;
  }) => void;
  isHumanTurn?: boolean;
}

export function useGameBoardLogic(options: UseGameBoardLogicOptions = {}) {
  const { onPiecePlaced, onPieceRemoved, isHumanTurn = true } = options;

  const {
    placed,
    placedCountByPieceId,
    placePiece,
    deletePieceByUid,
  } = usePlacedPiecesWithUndo();

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [computerDrawingCells, setComputerDrawingCells] = useState<IJK[]>([]);
  const [isComputerAnimating, setIsComputerAnimating] = useState(false);

  const {
    service: orientationService,
    loading: orientationsLoading,
    error: orientationsError,
  } = useOrientationService();

  const pieces = DEFAULT_PIECE_LIST; // one-of-each set A–Y

  // --- Piece identification & placement ---

  const identifyAndPlacePiece = useCallback(
    (drawnCells: IJK[]) => {
      if (orientationsError) {
        console.error('🎨 Failed to load orientations:', orientationsError);
        return;
      }

      if (orientationsLoading || !orientationService) {
        console.log('ℹ️ Orientation service still loading, try again...');
        return;
      }

      const match = findFirstMatchingPiece(drawnCells, pieces, orientationService);

      if (!match) {
        console.log('⚠️ Shape not recognized - must be a valid Koos piece');
        return;
      }

      const { pieceId, orientationId } = match;

      // Respect one-of-each rule for now
      const currentCount = placedCountByPieceId[pieceId] ?? 0;
      if (currentCount >= 1) {
        console.log(`ℹ️ Piece "${pieceId}" is already placed in One-of-Each mode`);
        return;
      }

      const uid = `pp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const placedPiece: PlacedPiece = {
        pieceId,
        orientationId,
        anchorSphereIndex: 0,
        cells: drawnCells,
        uid,
        placedAt: Date.now(),
      };

      placePiece(placedPiece);

      if (onPiecePlaced) {
        onPiecePlaced({ pieceId, orientationId, cells: drawnCells });
      }
    },
    [
      orientationsError,
      orientationsLoading,
      orientationService,
      pieces,
      placedCountByPieceId,
      placePiece,
      onPiecePlaced,
    ]
  );

  // --- Drawing state ---

  const {
    drawingCells,
    drawCell,
    clearDrawing,
  } = useManualDrawing({
    placed,
    onPieceDrawn: identifyAndPlacePiece,
  });

  // Allow programmatic placement (for computer moves)
  const placePieceProgrammatically = useCallback(
    (info: { pieceId: string; orientationId: string; cells: IJK[] }) => {
      const uid = `pp-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const placedPiece: PlacedPiece = {
        pieceId: info.pieceId,
        orientationId: info.orientationId,
        anchorSphereIndex: 0,
        cells: info.cells,
        uid,
        placedAt: Date.now(),
      };

      placePiece(placedPiece);
      return uid;
    },
    [placePiece]
  );

  /**
   * Animate a computer move by "drawing" cells one-by-one, then
   * actually placing the piece and calling onDone with placement info.
   */
  const animateComputerMove = useCallback(
    (
      move: { pieceId: string; orientationId: string; cells: IJK[] },
      onDone: (info: { pieceId: string; orientationId: string; cells: IJK[]; uid: string }) => void
    ) => {
      if (!move.cells || move.cells.length === 0) return;

      // Clear any user drawing/selection before computer draws
      clearDrawing();
      setSelectedUid(null);
      setComputerDrawingCells([]);
      setIsComputerAnimating(true);

      // Use a sorted copy for deterministic order (optional)
      const cells = [...move.cells];

      const stepMs = 180;
      cells.forEach((cell, index) => {
        setTimeout(() => {
          setComputerDrawingCells(prev => [...prev, cell]);

          // After last cell: small pause, then place & finish
          if (index === cells.length - 1) {
            setTimeout(() => {
              const uid = placePieceProgrammatically(move);
              setComputerDrawingCells([]);
              setIsComputerAnimating(false);

              onDone({
                pieceId: move.pieceId,
                orientationId: move.orientationId,
                cells: move.cells,
                uid,
              });
            }, 180);
          }
        }, stepMs * index);
      });
    },
    [clearDrawing, setSelectedUid, placePieceProgrammatically]
  );

  /**
   * Animate a user hint move: draw the hinted cells, then place the piece
   * and route it through the same onPiecePlaced pipeline.
   */
  const animateUserHintMove = useCallback(
    (
      move: { pieceId: string; orientationId: string; cells: IJK[] },
      onDone: (info: { pieceId: string; orientationId: string; cells: IJK[]; uid: string }) => void
    ) => {
      if (!move.cells || move.cells.length === 0) return;

      // Clear existing drawing / selection
      clearDrawing();
      setSelectedUid(null);

      // We'll animate via drawingCells (the same visual as manual drawing)
      const cells = [...move.cells];
      const stepMs = 150;

      cells.forEach((cell, index) => {
        setTimeout(() => {
          // reuse drawCell so it updates drawingCells correctly
          drawCell(cell);

          if (index === cells.length - 1) {
            // After last cell: small pause, then convert into a placed piece
            setTimeout(() => {
              const uid = placePieceProgrammatically(move);
              clearDrawing();

              onDone({
                pieceId: move.pieceId,
                orientationId: move.orientationId,
                cells: move.cells,
                uid,
              });
            }, 150);
          }
        }, stepMs * index);
      });
    },
    [clearDrawing, drawCell, setSelectedUid, placePieceProgrammatically]
  );

  // --- Interaction handler for SceneCanvas ---

  const handleInteraction = useCallback(
    (target: InteractionTarget, type: InteractionType, data?: any) => {
      if (!isHumanTurn) {
        // Ignore board interactions when it's not the human's turn
        return;
      }

      // --- DESELECT GUARD: mirror Manual Solve behavior ---
      if (selectedUid) {
        // Only reacts to click-like actions
        if (type === 'single' || type === 'double') {
          // If we clicked on the *same* selected piece, keep it
          if (target === 'piece' && data === selectedUid) {
            // no-op
          } else {
            // Any other click clears selection
            setSelectedUid(null);
          }
        }
      }
      // ----------------------------------------------------

      if (target === 'cell') {
        const clickedCell = data as IJK;

        if (type === 'single') {
          // Single-click on a cell cancels drawing (selection is already handled)
          if (drawingCells.length > 0) {
            clearDrawing();
          }
        } else if (type === 'double') {
          // Double-click to draw
          drawCell(clickedCell);
        }
        return;
      }

      if (target === 'background') {
        if (type === 'single') {
          clearDrawing();
        }
        return;
      }

      if (target === 'piece') {
        const uid = data as string;

        if (type === 'single') {
          // Clear drawing first, then (de)select
          if (drawingCells.length > 0) {
            clearDrawing();
          }
          // Deselect guard above already cleared if needed;
          // here we just toggle when clicking this piece.
          setSelectedUid(prev => (prev === uid ? null : uid));
          return;
        }

        if (type === 'double' || type === 'long') {
          // Delete only if this piece is currently selected
          if (uid !== selectedUid) {
            return;
          }
          const removed = deletePieceByUid(uid);
          if (!removed) return;

          setSelectedUid(null);

          if (onPieceRemoved) {
            onPieceRemoved({
              pieceId: removed.pieceId,
              uid,
            });
          }
          return;
        }
      }

      // ghost / other targets are ignored for now
    },
    [
      isHumanTurn,
      drawingCells,
      clearDrawing,
      drawCell,
      deletePieceByUid,
      onPieceRemoved,
      selectedUid,
    ]
  );

  const placedArray = Array.from(placed.values());

  return {
    placedPieces: placedArray,
    placedMap: placed,              // 👈 NEW - for hint system
    drawingCells,
    clearDrawing,               // 👈 NEW - for hint system
    selectedPieceUid: selectedUid,
    handleInteraction,
    placePieceProgrammatically,
    computerDrawingCells,
    isComputerAnimating,
    animateComputerMove,
    animateUserHintMove,        // 👈 NEW
  };
}
