import React, { useState } from 'react';
import SceneCanvas from '../../../components/SceneCanvas';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../../types/studio';
import type { IJK } from '../../../types/shape';
import type { PlacedPiece } from '../types/manualSolve';
import { useGameBoard } from '../hooks/useGameBoard';

interface ManualGameBoardProps {
  puzzle: any;
  placedPieces: PlacedPiece[];
  drawingCells: IJK[];
  computerDrawingCells: IJK[];
  selectedPieceUid: string | null;
  hidePlacedPieces: boolean;
  isHumanTurn: boolean;
  hintCells: IJK[];  // 👈 NEW
  onInteraction: (
    target: 'cell' | 'piece' | 'background' | 'ghost',
    type: 'single' | 'double' | 'long',
    data?: any
  ) => void;
}

export const ManualGameBoard: React.FC<ManualGameBoardProps> = ({
  puzzle,
  placedPieces,
  drawingCells,
  computerDrawingCells,
  selectedPieceUid,
  hidePlacedPieces,
  isHumanTurn,
  hintCells,
  onInteraction,
}) => {
  const { cells, view, loaded } = useGameBoard(puzzle);

  // Reuse the same environment settings as Manual Solve (contentStudio_v2)
  const [envSettings] = useState<StudioSettings>(() => {
    try {
      const rawStored = localStorage.getItem('contentStudio_v2');
      if (rawStored) {
        const stored = JSON.parse(rawStored);
        if (stored && typeof stored === 'object') {
          // Merge stored values onto defaults so new fields get defaults
          return { ...DEFAULT_STUDIO_SETTINGS, ...stored };
        }
      }
    } catch (err) {
      console.warn('⚠️ Failed to load env settings for vs mode:', err);
    }
    return DEFAULT_STUDIO_SETTINGS;
  });

  const visibility = {
    showSpheres: true,
    showBonds: true,
    showConvexHull: false,
    showShadows: envSettings.lights.shadows.enabled,
    xray: false,
    emptyOnly: false,
    sliceY: null as any,
  };

  if (!loaded || !view) {
    return (
      <div className="vs-board-wrapper">
        <div
          style={{
            padding: '1rem',
            textAlign: 'center',
            fontSize: '0.9rem',
            opacity: 0.8,
          }}
        >
          Loading 3D board...
        </div>
      </div>
    );
  }

  return (
    <div className="vs-board-wrapper">
      {!isHumanTurn && (
        <div className="vs-board-overlay">
          <span>Computer&apos;s turn…</span>
        </div>
      )}
      <SceneCanvas
        layout="embedded"
        cells={cells}
        view={view}
        editMode={false}
        mode="add"
        onCellsChange={() => {}}
        containerOpacity={
          envSettings.emptyCells?.customMaterial?.opacity ?? 1.0
        }
        containerColor={
          envSettings.emptyCells?.customMaterial?.color ?? '#888888'
        }
        containerRoughness={
          envSettings.emptyCells?.linkToEnvironment
            ? envSettings.material.roughness
            : envSettings.emptyCells?.customMaterial?.roughness ?? 0.35
        }
        puzzleMode="oneOfEach"
        placedPieces={placedPieces}
        selectedPieceUid={selectedPieceUid}
        onSelectPiece={() => {}}
        onDeleteSelectedPiece={() => {}}
        drawingCells={drawingCells}              // human drawing (gold)
        computerDrawingCells={computerDrawingCells} // 👈 NEW, computer drawing (will be silver)
        hidePlacedPieces={hidePlacedPieces}
        temporarilyVisiblePieces={new Set<string>()}
        explosionFactor={0}
        turntableRotation={0}
        settings={envSettings}
        visibility={visibility}
        onInteraction={onInteraction}
        onSceneReady={() => {}}
        hintCells={hintCells}  // 👈 now driven by hint system
      />
    </div>
  );
};
