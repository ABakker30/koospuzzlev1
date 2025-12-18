import { useState, useCallback, useRef } from 'react';
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
  
  // 🧱 DEBUG: Placement gate counter to detect double-placement
  const placeSeqRef = useRef(0);

  const placePiece = useCallback((piece: PlacedPiece) => {
    placeSeqRef.current += 1;
    const seq = placeSeqRef.current;
    
    console.log(`🧱 PLACE #${seq}`, {
      reason: piece.reason || 'unknown',
      uid: piece.uid,
      pieceId: piece.pieceId,
      orientationId: piece.orientationId,
      cellCount: piece.cells.length,
      timestamp: piece.placedAt,
    });
    
    // 🚨 UID COLLISION CHECK
    if (placed.has(piece.uid)) {
      console.error(`❌ UID COLLISION #${seq}`, {
        uid: piece.uid,
        pieceId: piece.pieceId,
        existingPiece: placed.get(piece.uid),
      });
      return; // Abort - don't place duplicate
    }
    
    // 🚨 OVERLAP DETECTION
    // NOTE: This uses `placed` from callback closure. If React hasn't re-rendered yet,
    // this might miss recent placements. However, the functional setState below ensures
    // atomic updates, so overlaps would show up in rendering (duplicate meshes).
    const key = (c: { i: number; j: number; k: number }) => `${c.i},${c.j},${c.k}`;
    const occupied = new Set<string>();
    
    for (const p of placed.values()) {
      for (const c of p.cells) {
        occupied.add(key(c));
      }
    }
    
    const newKeys = piece.cells.map(key);
    const overlappingKeys = newKeys.filter(k => occupied.has(k));
    
    console.log("🧱 [PLACE-DEBUG] incoming placement cells", {
      reason: piece.reason || 'unknown',
      pieceId: piece.pieceId,
      orientationId: piece.orientationId,
      uid: piece.uid,
      newKeys,
    });
    
    if (overlappingKeys.length > 0) {
      const occupiedBy = Array.from(placed.values()).map(p => ({
        uid: p.uid,
        pieceId: p.pieceId,
        keys: p.cells.map(key),
      }));
      
      console.error("❌ OVERLAP DETECTED - aborting commit", {
        reason: piece.reason || 'unknown',
        pieceId: piece.pieceId,
        orientationId: piece.orientationId,
        uid: piece.uid,
        newKeys: piece.cells.map(key),
        overlappingKeys,
        occupiedBy,
      });
      return; // ABORT - don't place overlapping piece
    }
    
    console.log(`✅ PLACE #${seq} passed all checks, committing...`);
    
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
    
    console.log(`✅ PLACE #${seq} committed successfully`, {
      reason: piece.reason || 'unknown',
      totalPlaced: placed.size + 1,
      pieceId: piece.pieceId,
    });
  }, [placed]);

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
    setUndoStack(prevUndo => {
      if (prevUndo.length === 0) return prevUndo;

      const nextUndo = prevUndo.slice();
      const action = nextUndo[nextUndo.length - 1];

      if (action.type === 'place') {
        const piece = action.piece;

        // Undo placing: remove piece from placed
        setPlaced(prevPlaced => {
          const next = new Map(prevPlaced);
          next.delete(piece.uid);
          return next;
        });

        setPlacedCountByPieceId(prevCounts => ({
          ...prevCounts,
          [piece.pieceId]: Math.max(
            0,
            (prevCounts[piece.pieceId] || 0) - 1
          ),
        }));
      } else {
        const piece = action.piece;

        // Undo deleting: re-add piece
        setPlaced(prevPlaced => {
          const next = new Map(prevPlaced);
          next.set(piece.uid, piece);
          return next;
        });

        setPlacedCountByPieceId(prevCounts => ({
          ...prevCounts,
          [piece.pieceId]: (prevCounts[piece.pieceId] || 0) + 1,
        }));
      }

      // Push this action onto redo stack
      setRedoStack(prevRedo => [...prevRedo, action]);

      // Return undo stack without the last action
      return nextUndo.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack(prevRedo => {
      if (prevRedo.length === 0) return prevRedo;

      const nextRedo = prevRedo.slice();
      const action = nextRedo[nextRedo.length - 1];

      if (action.type === 'place') {
        const piece = action.piece;

        // Redo placing: re-add piece
        setPlaced(prevPlaced => {
          const next = new Map(prevPlaced);
          next.set(piece.uid, piece);
          return next;
        });

        setPlacedCountByPieceId(prevCounts => ({
          ...prevCounts,
          [piece.pieceId]: (prevCounts[piece.pieceId] || 0) + 1,
        }));
      } else {
        const piece = action.piece;

        // Redo deleting: remove piece again
        setPlaced(prevPlaced => {
          const next = new Map(prevPlaced);
          next.delete(piece.uid);
          return next;
        });

        setPlacedCountByPieceId(prevCounts => ({
          ...prevCounts,
          [piece.pieceId]: Math.max(
            0,
            (prevCounts[piece.pieceId] || 0) - 1
          ),
        }));
      }

      // Push this action back onto undo stack
      setUndoStack(prevUndo => [...prevUndo, action]);

      // Return redo stack without the last action
      return nextRedo.slice(0, -1);
    });
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
