// src/game/three/GameBoard3D.tsx
// Phase 3A-3: Three.js board wrapper with draw/commit placement
// Adapts ManualGameBoard to work with GameState.boardState

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { ManualGameBoard } from '../../pages/solve/components/ManualGameBoard';
import type { PuzzleData } from '../puzzle/PuzzleTypes';
import type { GamePlacedPiece } from '../contracts/GameState';
import type { IJK } from '../../services/FitFinder';
import { ijkToKey } from '../../services/FitFinder';
import type { StudioSettings } from '../../types/studio';
import type { PlacementInfo } from '../engine/GameDependencies';
import { useOrientationService } from '../../pages/solve/hooks/useOrientationService';
import { findFirstMatchingPiece } from '../../pages/solve/utils/manualSolveMatch';
import { areFCCAdjacent } from '../../pages/solve/utils/manualSolveCells';
import { sounds } from '../../utils/audio';

// Interaction mode for the board
export type InteractionMode = 'none' | 'placing' | 'pickingAnchor';

// PlacedPiece format expected by ManualGameBoard
interface LegacyPlacedPiece {
  uid: string;
  pieceId: string;
  orientationId: string;
  anchorSphereIndex: 0 | 1 | 2 | 3;
  cells: IJK[];
  placedAt: number;
}

export interface GameBoard3DProps {
  puzzle: PuzzleData | null;
  boardState: Map<string, GamePlacedPiece>;
  interactionMode?: InteractionMode;
  isHumanTurn?: boolean; // Whether active player is human (controls "Computer's turn" overlay)
  highlightPieceId?: string | null;
  selectedAnchor?: IJK | null;
  envSettings?: StudioSettings;
  hidePlacedPieces?: boolean;
  onAnchorPicked?: (anchor: IJK) => void;
  onPlacementCommitted?: (placement: PlacementInfo) => void;
  onPlacementRejected?: (reason: string) => void;
  onCancelInteraction?: () => void;
  onDrawingCellsChange?: (cells: IJK[]) => void;
}

/**
 * Convert GameState.boardState (Map) to legacy PlacedPiece[] format
 */
function convertBoardState(boardState: Map<string, GamePlacedPiece>): LegacyPlacedPiece[] {
  const pieces: LegacyPlacedPiece[] = [];
  
  boardState.forEach((piece, uid) => {
    pieces.push({
      uid,
      pieceId: piece.pieceId,
      orientationId: piece.orientationId,
      anchorSphereIndex: 0, // Default - we don't track this in GameState
      cells: piece.cells,
      placedAt: piece.placedAt,
    });
  });
  
  return pieces;
}

// Standard piece list for matching
const PIECE_IDS = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('');

export function GameBoard3D({
  puzzle,
  boardState,
  interactionMode = 'none',
  isHumanTurn = true,
  highlightPieceId,
  selectedAnchor,
  envSettings,
  hidePlacedPieces = false,
  onAnchorPicked,
  onPlacementCommitted,
  onPlacementRejected,
  onCancelInteraction,
  onDrawingCellsChange,
}: GameBoard3DProps) {
  // Drawing state for placement mode
  const [drawingCells, setDrawingCells] = useState<IJK[]>([]);
  
  // Load orientations for piece matching
  const { service: orientationService, loading: orientationsLoading } = useOrientationService();
  
  // Convert boardState to legacy format
  const placedPieces = useMemo(
    () => convertBoardState(boardState),
    [boardState]
  );
  
  // Clear drawing when interaction mode changes
  useEffect(() => {
    if (interactionMode !== 'placing') {
      setDrawingCells([]);
    }
  }, [interactionMode]);
  
  // Report drawing cells changes to parent
  useEffect(() => {
    onDrawingCellsChange?.(drawingCells);
  }, [drawingCells, onDrawingCellsChange]);
  
  // Handle drawing a cell (for placement mode)
  const drawCell = useCallback((cell: IJK) => {
    if (interactionMode !== 'placing') return;
    if (orientationsLoading || !orientationService) return;
    
    const cellKey = ijkToKey(cell);
    
    // Check if cell is already occupied by a placed piece
    for (const piece of boardState.values()) {
      if (piece.cells.some(c => ijkToKey(c) === cellKey)) return;
    }
    
    // Check if cell is already in drawing
    if (drawingCells.some(c => ijkToKey(c) === cellKey)) return;
    
    // Enforce FCC adjacency after first cell
    if (drawingCells.length > 0) {
      const isAdjacent = drawingCells.some(c => areFCCAdjacent(c, cell));
      if (!isAdjacent) return;
    }
    
    const newDrawing = [...drawingCells, cell];
    setDrawingCells(newDrawing);
    
    // Play draw sound for cells 1-3
    if (newDrawing.length < 4) {
      sounds.draw();
    }
    
    // When 4 cells drawn, try to identify and commit the piece
    if (newDrawing.length === 4) {
      
      const match = findFirstMatchingPiece(newDrawing, PIECE_IDS, orientationService);
      
      if (!match) {
        onPlacementRejected?.('Shape not recognized - must be a valid Koos piece');
        setDrawingCells([]);
        return;
      }
      
      // Build PlacementInfo and commit
      const placement: PlacementInfo = {
        pieceId: match.pieceId,
        orientationId: match.orientationId,
        cells: newDrawing,
      };
      
      setDrawingCells([]);
      onPlacementCommitted?.(placement);
    }
  }, [interactionMode, boardState, drawingCells, orientationService, orientationsLoading, onPlacementCommitted, onPlacementRejected]);
  
  // Handle interactions from ManualGameBoard
  const handleInteraction = useCallback((
    target: 'cell' | 'piece' | 'background' | 'ghost',
    type: 'single' | 'double' | 'long',
    data?: any
  ) => {
    // Placing mode: draw cells on any click (single or double)
    // Accept both to avoid 400ms delay from double-click detection
    if (interactionMode === 'placing' && target === 'cell' && (type === 'single' || type === 'double')) {
      drawCell(data as IJK);
      return;
    }
    
    // Anchor picking mode: report anchor on any click
    if (interactionMode === 'pickingAnchor' && target === 'cell' && (type === 'single' || type === 'double')) {
      onAnchorPicked?.(data as IJK);
      return;
    }
    
    // Background click cancels interaction
    if (target === 'background' && (type === 'single' || type === 'double')) {
      if (interactionMode === 'placing' && drawingCells.length > 0) {
        setDrawingCells([]);
      } else {
        onCancelInteraction?.();
      }
    }
  }, [interactionMode, drawCell, drawingCells.length, onAnchorPicked, onCancelInteraction]);
  
  // Show loading state if no puzzle
  if (!puzzle) {
    return (
      <div style={styles.loading}>
        <span>Loading puzzle...</span>
      </div>
    );
  }
  
  // Use hintCells to highlight the selected anchor (Phase 3A-4)
  const anchorHighlight = useMemo(() => {
    if (interactionMode === 'pickingAnchor' && selectedAnchor) {
      return [selectedAnchor];
    }
    return [];
  }, [interactionMode, selectedAnchor]);
  
  return (
    <ManualGameBoard
      puzzle={puzzle.geometry}
      placedPieces={placedPieces}
      drawingCells={drawingCells}
      computerDrawingCells={[]}
      rejectedPieceCells={null}
      rejectedPieceId={null}
      selectedPieceUid={null}
      highlightedPieceUid={highlightPieceId ?? null}
      hidePlacedPieces={hidePlacedPieces}
      isHumanTurn={isHumanTurn}
      isGameComplete={false}
      hintCells={anchorHighlight}
      pieceMode="unique"
      envSettings={envSettings}
      onInteraction={handleInteraction}
    />
  );
}

const styles: Record<string, React.CSSProperties> = {
  loading: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    color: '#fff',
    fontSize: '1.2rem',
  },
};

export default GameBoard3D;
