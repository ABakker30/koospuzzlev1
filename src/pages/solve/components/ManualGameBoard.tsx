import React, { useState } from 'react';
import SceneCanvas from '../../../components/SceneCanvas';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../../types/studio';
import type { IJK } from '../../../types/shape';
import { useGameBoard } from '../hooks/useGameBoard';

interface ManualGameBoardProps {
  puzzle: any;
}

export const ManualGameBoard: React.FC<ManualGameBoardProps> = ({ puzzle }) => {
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

  const emptyPlaced: any[] = [];
  const emptySet = new Set<string>();
  const emptyCells: IJK[] = [];

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
        placedPieces={emptyPlaced}
        selectedPieceUid={null}
        onSelectPiece={() => {}}
        onDeleteSelectedPiece={() => {}}
        drawingCells={emptyCells}
        hidePlacedPieces={false}
        temporarilyVisiblePieces={emptySet}
        explosionFactor={0}
        turntableRotation={0}
        settings={envSettings}
        visibility={visibility}
        onInteraction={(target, type, data) => {
          // For now, just log interactions.
          console.log('🎯 Game board interaction (view-only):', {
            target,
            type,
            data,
          });
        }}
        onSceneReady={() => {}}
        hintCells={emptyCells}
      />
    </div>
  );
};
