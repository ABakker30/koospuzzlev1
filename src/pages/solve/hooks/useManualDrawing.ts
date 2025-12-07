import { useState, useCallback } from 'react';
import type { IJK } from '../../../types/shape';
import type { PlacedPiece } from '../types/manualSolve';
import { ijkToKey } from '../../../services/FitFinder';
import { areFCCAdjacent } from '../utils/manualSolveCells';

type UseManualDrawingOptions = {
  placed: Map<string, PlacedPiece>;
  onPieceDrawn: (cells: IJK[]) => void;
};

export const useManualDrawing = ({
  placed,
  onPieceDrawn,
}: UseManualDrawingOptions) => {
  const [drawingCells, setDrawingCells] = useState<IJK[]>([]);

  const clearDrawing = useCallback(() => {
    setDrawingCells([]);
  }, []);

  const drawCell = useCallback(
    (cell: IJK) => {
      // Check if cell already occupied by a placed piece
      const cellKey = ijkToKey(cell);
      for (const [, piece] of placed) {
        if (piece.cells.some(c => ijkToKey(c) === cellKey)) {
          return;
        }
      }

      // Already in current drawing?
      if (drawingCells.some(c => ijkToKey(c) === cellKey)) {
        return;
      }

      // If we already have some drawing cells, enforce FCC adjacency
      if (drawingCells.length > 0) {
        const isAdjacent = drawingCells.some(c => areFCCAdjacent(c, cell));
        if (!isAdjacent) {
          return;
        }
      }

      const newDrawing = [...drawingCells, cell];
      setDrawingCells(newDrawing);

      if (newDrawing.length === 4) {
        // Clear drawing immediately so user can start a new one
        setDrawingCells([]);
        onPieceDrawn(newDrawing);
      }
    },
    [drawingCells, placed, onPieceDrawn]
  );

  return {
    drawingCells,
    drawCell,
    clearDrawing,
  };
};
