import { useState, useCallback } from 'react';
import type { PlacedPiece, Action } from '../types/manualSolve';

type PlacedCountByPieceId = Record<string, number>;

export const usePlacedPiecesWithUndo = () => {
  const [placed, setPlaced] = useState<Map<string, PlacedPiece>>(
    () => new Map()
  );
  const [placedCountByPieceId, setPlacedCountByPieceId] =
    useState<PlacedCountByPieceId>({});
  const [undoStack, setUndoStack] = useState<Action[]>([]);
  const [redoStack, setRedoStack] = useState<Action[]>([]);

  const placePiece = useCallback((piece: PlacedPiece) => {
    // Add piece to placed map
    setPlaced(prev => {
      const next = new Map(prev);
      next.set(piece.uid, piece);
      return next;
    });

    // Push action onto undo stack
    setUndoStack(prev => [...prev, { type: 'place', piece }]);

    // Clear redo stack (new branch)
    setRedoStack(() => []);

    // Increment count for this pieceId
    setPlacedCountByPieceId(prev => ({
      ...prev,
      [piece.pieceId]: (prev[piece.pieceId] || 0) + 1,
    }));
  }, []);

  const deletePieceByUid = useCallback(
    (uid: string): PlacedPiece | null => {
      const piece = placed.get(uid);
      if (!piece) return null;

      // Remove from placed map
      setPlaced(prev => {
        const next = new Map(prev);
        next.delete(uid);
        return next;
      });

      // Push action onto undo stack
      setUndoStack(prev => [...prev, { type: 'delete', piece }]);

      // Clear redo stack (new branch)
      setRedoStack(() => []);

      // Decrement count for this pieceId
      setPlacedCountByPieceId(prev => ({
        ...prev,
        [piece.pieceId]: Math.max(0, (prev[piece.pieceId] || 0) - 1),
      }));

      return piece;
    },
    [placed]
  );

  const undo = useCallback(() => {
    let action: Action | null = null;

    // Pop from undo stack
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      action = next.pop() || null;
      return next;
    });

    if (!action) return;

    if (action.type === 'place') {
      const piece = action.piece;

      // Undo placing: remove piece
      setPlaced(prev => {
        const next = new Map(prev);
        next.delete(piece.uid);
        return next;
      });

      setPlacedCountByPieceId(prev => ({
        ...prev,
        [piece.pieceId]: Math.max(0, (prev[piece.pieceId] || 0) - 1),
      }));
    } else {
      const piece = action.piece;

      // Undo deleting: re-add piece
      setPlaced(prev => {
        const next = new Map(prev);
        next.set(piece.uid, piece);
        return next;
      });

      setPlacedCountByPieceId(prev => ({
        ...prev,
        [piece.pieceId]: (prev[piece.pieceId] || 0) + 1,
      }));
    }

    // Push onto redo stack
    setRedoStack(prev => [...prev, action!]);
  }, []);

  const redo = useCallback(() => {
    let action: Action | null = null;

    // Pop from redo stack
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      action = next.pop() || null;
      return next;
    });

    if (!action) return;

    if (action.type === 'place') {
      const piece = action.piece;

      // Redo placing: re-add piece
      setPlaced(prev => {
        const next = new Map(prev);
        next.set(piece.uid, piece);
        return next;
      });

      setPlacedCountByPieceId(prev => ({
        ...prev,
        [piece.pieceId]: (prev[piece.pieceId] || 0) + 1,
      }));
    } else {
      const piece = action.piece;

      // Redo deleting: remove piece again
      setPlaced(prev => {
        const next = new Map(prev);
        next.delete(piece.uid);
        return next;
      });

      setPlacedCountByPieceId(prev => ({
        ...prev,
        [piece.pieceId]: Math.max(0, (prev[piece.pieceId] || 0) - 1),
      }));
    }

    // Push back onto undo stack
    setUndoStack(prev => [...prev, action!]);
  }, []);

  const resetPlacedState = useCallback(() => {
    setPlaced(new Map());
    setUndoStack([]);
    setRedoStack([]);
    setPlacedCountByPieceId({});
  }, []);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  return {
    placed,
    placedCountByPieceId,
    canUndo,
    canRedo,
    placePiece,
    deletePieceByUid,
    undo,
    redo,
    resetPlacedState,
  };
};
