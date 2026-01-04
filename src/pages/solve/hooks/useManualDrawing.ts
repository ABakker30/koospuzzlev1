import { useState, useCallback } from 'react';
import type { IJK } from '../../../types/shape';
import type { PlacedPiece } from '../types/manualSolve';
import { ijkToKey } from '../../../services/FitFinder';
import { areFCCAdjacent } from '../utils/manualSolveCells';
import { sounds } from '../../../utils/audio';

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
    console.log('🎨 [DRAWING] Clearing all drawing cells');
    setDrawingCells([]);
  }, []);

  const drawCell = useCallback(
    (cell: IJK) => {
      console.log('🎨 [DRAWING] drawCell called with:', { i: cell.i, j: cell.j, k: cell.k });
      
      // Check if cell already occupied by a placed piece
      const cellKey = ijkToKey(cell);
      for (const [, piece] of placed) {
        if (piece.cells.some(c => ijkToKey(c) === cellKey)) {
          console.log('🎨 [DRAWING] ❌ Cell occupied by placed piece - ignoring');
          return;
        }
      }

      // Already in current drawing?
      if (drawingCells.some(c => ijkToKey(c) === cellKey)) {
        console.log('🎨 [DRAWING] ❌ Cell already in drawing - ignoring');
        return;
      }

      // If we already have some drawing cells, enforce FCC adjacency
      if (drawingCells.length > 0) {
        const isAdjacent = drawingCells.some(c => areFCCAdjacent(c, cell));
        if (!isAdjacent) {
          console.log('🎨 [DRAWING] ❌ Cell not adjacent to existing drawing - ignoring');
          return;
        }
      }

      const newDrawing = [...drawingCells, cell];
      console.log('🎨 [DRAWING] ✅ Adding cell to drawing:', { 
        cell: { i: cell.i, j: cell.j, k: cell.k },
        drawingLength: newDrawing.length 
      });
      setDrawingCells(newDrawing);
      
      // Play draw sound for spheres 1-3 (pop sound plays on 4th when piece is placed)
      if (newDrawing.length < 4) {
        sounds.draw();
      }

      if (newDrawing.length === 4) {
        console.log('🎨 [DRAWING] 🎯 Drawing complete (4 cells) - triggering piece placement');
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
