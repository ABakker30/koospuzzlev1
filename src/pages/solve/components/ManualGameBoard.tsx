import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  isGameComplete: boolean;
  hintCells: IJK[];
  envSettings?: StudioSettings; // Optional: VS mode can pass its own settings
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
  isGameComplete,
  hintCells,
  envSettings: propEnvSettings,
  onInteraction,
}) => {
  const { t } = useTranslation();
  const { cells, view, loaded } = useGameBoard(puzzle);

  // Use passed settings if provided, otherwise fall back to localStorage (contentStudio_v2)
  const [fallbackSettings] = useState<StudioSettings>(() => {
    try {
      const rawStored = localStorage.getItem('contentStudio_v2');
      if (rawStored) {
        const stored = JSON.parse(rawStored);
        if (stored && typeof stored === 'object') {
          return { ...DEFAULT_STUDIO_SETTINGS, ...stored };
        }
      }
    } catch (err) {
      console.warn('⚠️ Failed to load env settings for vs mode:', err);
    }
    return DEFAULT_STUDIO_SETTINGS;
  });
  
  // Use prop if provided (reactive), otherwise use fallback
  const envSettings = propEnvSettings ?? fallbackSettings;

  const visibility = {
    showSpheres: true,
    showBonds: true,
    showConvexHull: false,
    showShadows: envSettings.lights.shadows.enabled,
    xray: false,
    emptyOnly: false,
    sliceY: null as any,
  };

  // Stable empty set to avoid re-renders
  const emptySet = useMemo(() => new Set<string>(), []);

  if (!loaded || !view) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
        <div
          style={{
            padding: '1rem',
            textAlign: 'center',
            fontSize: '0.9rem',
            opacity: 0.8,
          }}
        >
          {t('loading.default')}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      {!isHumanTurn && !isGameComplete && (
        <div className="vs-board-overlay">
          <span>{t('game.computerTurn')}</span>
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
        selectedUid={selectedPieceUid}
        onSelectPiece={() => {}}
        onDeleteSelectedPiece={() => {}}
        drawingCells={drawingCells}              // human drawing (gold)
        computerDrawingCells={computerDrawingCells} // 👈 NEW, computer drawing (will be silver)
        hidePlacedPieces={hidePlacedPieces}
        temporarilyVisiblePieces={emptySet}
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
