import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SceneCanvas from '../../components/SceneCanvas';
import { PresetSelectorModal } from '../../components/PresetSelectorModal';
import { ENVIRONMENT_PRESETS } from '../../constants/environmentPresets';
import { getPuzzleById } from '../../api/puzzles';
import { getPuzzleSolutions, type PuzzleSolutionRecord } from '../../api/solutions';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../types/studio';
import { ijkToXyz } from '../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import type { IJK } from '../../types/shape';
import type { PlacedPiece } from '../solve/types/manualSolve';

// Bright settings for sandbox viewer
const SANDBOX_SETTINGS: StudioSettings = {
  ...DEFAULT_STUDIO_SETTINGS,
  lights: {
    ...DEFAULT_STUDIO_SETTINGS.lights,
    brightness: 2.5,
  }
};

// FCC transformation matrix
const T_ijk_to_xyz = [
  [0.5, 0.5, 0, 0],
  [0.5, 0, 0.5, 0],
  [0, 0.5, 0.5, 0],
  [0, 0, 0, 1]
];

export function PuzzleViewSandboxPage() {
  const { solutionId } = useParams<{ solutionId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [placedPieces, setPlacedPieces] = useState<PlacedPiece[]>([]);
  
  const [currentPreset, setCurrentPreset] = useState<string>(() => {
    try {
      return localStorage.getItem('sandboxViewer.environmentPreset') || '';
    } catch {
      return '';
    }
  });
  
  const [envSettings, setEnvSettings] = useState<StudioSettings>(() => {
    try {
      const presetKey = localStorage.getItem('sandboxViewer.environmentPreset');
      if (presetKey && ENVIRONMENT_PRESETS[presetKey]) {
        return ENVIRONMENT_PRESETS[presetKey];
      }
    } catch {
      // ignore
    }
    return SANDBOX_SETTINGS;
  });
  
  const [showPresetModal, setShowPresetModal] = useState(false);

  // Load puzzle and solution data
  useEffect(() => {
    if (!solutionId) {
      setError('No solution ID provided');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        console.log(`🎯 [SANDBOX] Loading solution ${solutionId}`);
        setLoading(true);
        setError(null);

        // Load puzzle data
        const puzzleData = await getPuzzleById(solutionId);
        if (!puzzleData) {
          throw new Error('Puzzle not found');
        }
        console.log('✅ [SANDBOX] Puzzle loaded:', puzzleData.name);

        // Load solutions
        const solutionRecords = await getPuzzleSolutions(puzzleData.id);
        const solutionWithPieces = solutionRecords?.find(s => s.placed_pieces);
        if (!solutionWithPieces) {
          throw new Error('No solution with placed_pieces found');
        }

        // Set up geometry
        const puzzleCells = (puzzleData.geometry as IJK[]) || [];
        setCells(puzzleCells);
        
        // Compute view transforms
        const transforms = computeViewTransforms(
          puzzleCells,
          ijkToXyz,
          T_ijk_to_xyz,
          quickHullWithCoplanarMerge
        );
        setView(transforms);
        console.log('✅ [SANDBOX] View transforms computed');

        // Set up placed pieces
        if (solutionWithPieces.placed_pieces) {
          setPlacedPieces(solutionWithPieces.placed_pieces as PlacedPiece[]);
          console.log('✅ [SANDBOX] Placed pieces loaded:', solutionWithPieces.placed_pieces.length);
        }

        setLoading(false);
      } catch (err) {
        console.error('❌ [SANDBOX] Failed to load:', err);
        setError(err instanceof Error ? err.message : 'Failed to load puzzle');
        setLoading(false);
      }
    };

    loadData();
  }, [solutionId]);

  // Handle preset selection
  const handlePresetSelect = (preset: StudioSettings, presetKey: string) => {
    setEnvSettings(preset);
    setCurrentPreset(presetKey);
    try {
      localStorage.setItem('sandboxViewer.environmentPreset', presetKey);
    } catch {
      // ignore
    }
    console.log('✅ [SANDBOX] Environment preset changed:', presetKey);
    setShowPresetModal(false);
  };

  // Handle Esc key to exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate('/gallery');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  if (error) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#ff6b6b'
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.2rem', marginBottom: '16px' }}>⚠️ {error}</p>
          <button
            onClick={() => navigate('/gallery')}
            style={{
              background: '#444',
              border: '1px solid #666',
              color: '#fff',
              padding: '12px 24px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            {t('common.buttons.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      width: '100vw', 
      height: '100dvh',
      position: 'relative', 
      overflow: 'hidden', 
      background: '#000'
    }}>
      {/* Loading Overlay */}
      {loading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.8)',
          zIndex: 100
        }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: '2rem', marginBottom: '16px' }}>⏳</div>
            <p>{t('loading.puzzle')}</p>
            <p style={{ fontSize: '0.9rem', color: '#888', marginTop: '8px' }}>
              🧪 SANDBOX - Physics Ready
            </p>
          </div>
        </div>
      )}

      {/* 3D Canvas - Full screen */}
      {!loading && view && cells.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0
        }}>
          <SceneCanvas
            cells={[]}
            view={view}
            editMode={false}
            mode="add"
            onCellsChange={() => {}}
            layout="fullscreen"
            placedPieces={placedPieces}
            hidePlacedPieces={false}
            settings={envSettings}
            puzzleMode="unlimited"
            showBonds={true}
            containerOpacity={0}
            containerColor="#888888"
            containerRoughness={0.8}
            alwaysShowContainer={false}
            visibility={{
              xray: false,
              emptyOnly: false,
              sliceY: { center: 0.5, thickness: 1.0 },
            }}
          />
        </div>
      )}

      {/* Top Controls */}
      {!loading && (
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          display: 'flex',
          gap: '8px',
          zIndex: 10
        }}>
          {/* Sandbox Badge */}
          <div style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '14px',
            padding: '8px 16px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          }}>
            🧪 SANDBOX
          </div>

          {/* Environment Preset Button */}
          <button
            onClick={() => setShowPresetModal(true)}
            title="Change Environment"
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
              color: '#fff',
              fontWeight: 700,
              border: 'none',
              fontSize: '20px',
              padding: '8px 12px',
              minWidth: '40px',
              minHeight: '40px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            🎨
          </button>

          {/* Close Button */}
          <button
            onClick={() => navigate('/gallery')}
            title="Back to Gallery"
            style={{
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              color: '#fff',
              fontWeight: 700,
              border: 'none',
              fontSize: '22px',
              padding: '8px 12px',
              minWidth: '40px',
              minHeight: '40px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Preset Selector Modal */}
      <PresetSelectorModal
        isOpen={showPresetModal}
        currentPreset={currentPreset}
        onSelectPreset={handlePresetSelect}
        onClose={() => setShowPresetModal(false)}
      />
    </div>
  );
}
