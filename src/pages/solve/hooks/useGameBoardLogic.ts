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
    uid?: string;
  }) => void;
  onPieceRemoved?: (info: {
    pieceId: string;
    uid: string;
  }) => void;
  isHumanTurn?: boolean;
  hintInProgressRef?: React.MutableRefObject<boolean>; // Guard to prevent double-placement during hint animation
}

export function useGameBoardLogic(options: UseGameBoardLogicOptions = {}) {
  const { onPiecePlaced, onPieceRemoved, isHumanTurn = true, hintInProgressRef } = options;

  const {
    placed,
    placedCountByPieceId,
    placePiece,
    deletePieceByUid,
    undo,
    resetPlacedState,
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
        reason: 'user', // Manual drawing placement
      };

      placePiece(placedPiece);

      if (onPiecePlaced) {
        onPiecePlaced({ pieceId, orientationId, cells: drawnCells, uid });
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
    (info: { pieceId: string; orientationId: string; cells: IJK[] }, reason?: string) => {
      // 🛑 GUARD: Block placement during hint animation (prevents double-trigger)
      if (hintInProgressRef?.current && reason !== 'hintCommit') {
        console.warn('🛑 BLOCKED placement during hintInProgress', { reason, pieceId: info.pieceId });
        return '';
      }
      
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
        reason: reason === 'hintCommit' ? 'hint' : 'computer', // Tagged by caller
      };

      placePiece(placedPiece);
      return uid;
    },
    [placePiece, hintInProgressRef]
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
              const uid = placePieceProgrammatically(move, 'hintCommit');
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
      if (!isHumanTurn) return;

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
        if (type === 'single') {
          // Single-click on piece: clear drawing only, NO SELECTION in game mode
          if (drawingCells.length > 0) {
            clearDrawing();
          }
          return;
        }

        if (type === 'double' || type === 'long') {
          // Double-click/long-press on piece: draw on empty cell if under cursor AND in front
          const cell = getEmptyCellUnderCursor(data);
          
          if (cell) {
            // Empty cell exists under cursor and in front of piece → draw it
            drawCell(cell);
          }
          // If no cell under cursor or cell is behind piece → ignore (do nothing)

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

  // Helper function to get empty cell under cursor from SceneCanvas raycast data
  function getEmptyCellUnderCursor(pointerEventData: any): IJK | null {
    // SceneCanvas now provides emptyCellUnderCursor (only if cell is under cursor AND in front of piece)
    return pointerEventData?.emptyCellUnderCursor ?? null;
  }

  const placedArray = Array.from(placed.values());

  return {
    placedPieces: placedArray,
    placedMap: placed,              // 👈 NEW - for hint system
    placedCountByPieceId,           // 👈 NEW - for computer move filtering
    drawingCells,
    clearDrawing,               // 👈 NEW - for hint system
    selectedPieceUid: selectedUid,
    handleInteraction,
    placePieceProgrammatically,
    computerDrawingCells,
    isComputerAnimating,
    animateComputerMove,
    animateUserHintMove,        // 👈 NEW
    undoLastPlacement: undo,    // 👈 NEW - for solvability check undo
    resetBoard: resetPlacedState, // 👈 NEW - for play again
    deletePieceByUid,           // 👈 NEW - for invalid move reversion
  };
}
