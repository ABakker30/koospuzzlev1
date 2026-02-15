import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SceneCanvas from '../../components/SceneCanvas';
import { PresetSelectorModal } from '../../components/PresetSelectorModal';
import { SolutionPickerModal } from './SolutionPickerModal';
import { ENVIRONMENT_PRESETS } from '../../constants/environmentPresets';
import { getPuzzleById, type PuzzleRecord } from '../../api/puzzles';
import { getPuzzleSolutions, type PuzzleSolutionRecord } from '../../api/solutions';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../types/studio';
import { ijkToXyz } from '../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import type { IJK } from '../../types/shape';
import type { PlacedPiece } from '../solve/types/manualSolve';

// Bright settings for viewer
const VIEWER_SETTINGS: StudioSettings = {
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

interface PuzzleViewerPageProps {}

export function PuzzleViewerPage({}: PuzzleViewerPageProps) {
  const { puzzleId } = useParams<{ puzzleId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [puzzle, setPuzzle] = useState<PuzzleRecord | null>(null);
  const [solutions, setSolutions] = useState<PuzzleSolutionRecord[]>([]);
  const [viewMode, setViewMode] = useState<'solution' | 'shape'>('shape');
  
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [placedPieces, setPlacedPieces] = useState<PlacedPiece[]>([]);
  const [currentPreset, setCurrentPreset] = useState<string>(() => {
    try {
      return localStorage.getItem('puzzleViewer.environmentPreset') || '';
    } catch {
      return '';
    }
  });
  const [envSettings, setEnvSettings] = useState<StudioSettings>(() => {
    try {
      const presetKey = localStorage.getItem('puzzleViewer.environmentPreset');
      if (presetKey && ENVIRONMENT_PRESETS[presetKey]) {
        return ENVIRONMENT_PRESETS[presetKey];
      }
    } catch {
      // ignore
    }
    return VIEWER_SETTINGS;
  });
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showSolutionPicker, setShowSolutionPicker] = useState(false);
  const [selectedSolution, setSelectedSolution] = useState<PuzzleSolutionRecord | null>(null);
  
  // Auto-rotation state
  const [turntableRotation, setTurntableRotation] = useState(0);
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const controlsRef = useRef<any>(null);
  const lastTimeRef = useRef<number>(0);
  
  const IDLE_TIMEOUT_MS = 1000; // 1 second
  const ROTATION_SPEED = 0.3; // radians per second
  
  // Reset idle timer and stop auto-rotation
  const resetIdleTimer = useCallback(() => {
    // Stop auto-rotation
    setIsAutoRotating(false);
    
    // Clear existing timer
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    
    // Start new timer
    idleTimerRef.current = setTimeout(() => {
      setIsAutoRotating(true);
      lastTimeRef.current = performance.now();
    }, IDLE_TIMEOUT_MS);
  }, []);
  
  // Handle scene ready - attach orbit control listeners
  const handleSceneReady = useCallback((objects: {
    scene: any;
    camera: any;
    renderer: any;
    controls: any;
    spheresGroup: any;
    centroidWorld: any;
  }) => {
    controlsRef.current = objects.controls;
    
    // Listen for orbit control interactions
    if (objects.controls) {
      objects.controls.addEventListener('start', resetIdleTimer);
      objects.controls.addEventListener('change', resetIdleTimer);
    }
    
    // Start the initial idle timer
    resetIdleTimer();
  }, [resetIdleTimer]);
  
  // Auto-rotation animation loop
  useEffect(() => {
    if (!isAutoRotating) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }
    
    const animate = () => {
      const now = performance.now();
      const deltaTime = (now - lastTimeRef.current) / 1000; // Convert to seconds
      lastTimeRef.current = now;
      
      setTurntableRotation(prev => prev + ROTATION_SPEED * deltaTime);
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isAutoRotating]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Remove event listeners
      if (controlsRef.current) {
        controlsRef.current.removeEventListener('start', resetIdleTimer);
        controlsRef.current.removeEventListener('change', resetIdleTimer);
      }
    };
  }, [resetIdleTimer]);

  // Load puzzle and solutions data
  useEffect(() => {
    if (!puzzleId) {
      setError('No puzzle ID provided');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        console.log(`🎯 Loading puzzle ${puzzleId} for viewer`);
        setLoading(true);
        setError(null);

        // Load puzzle
        const puzzleData = await getPuzzleById(puzzleId);
        if (!puzzleData) {
          throw new Error('Puzzle not found');
        }
        setPuzzle(puzzleData);

        // Load solutions
        const solutionsData = await getPuzzleSolutions(puzzleId);
        setSolutions(solutionsData || []);

        // Set up geometry first
        if (puzzleData.geometry && Array.isArray(puzzleData.geometry)) {
          const puzzleCells = puzzleData.geometry as IJK[];
          setCells(puzzleCells);
          
          // Compute view transforms with proper FCC lattice orientation
          const transforms = computeViewTransforms(
            puzzleCells,
            ijkToXyz,
            T_ijk_to_xyz,
            quickHullWithCoplanarMerge
          );
          setView(transforms);
          console.log('✅ View transforms computed');
        }

        // Pre-select most recent solution (already sorted by created_at desc)
        if (solutionsData && solutionsData.length > 0) {
          const mostRecent = solutionsData[0];
          setSelectedSolution(mostRecent);
          if (mostRecent.placed_pieces) {
            setPlacedPieces(mostRecent.placed_pieces as PlacedPiece[]);
            setViewMode('solution');
            console.log(`✅ Pre-selected most recent solution: ${mostRecent.solver_name} (${solutionsData.length} total)`);
          }
        } else {
          setViewMode('shape');
          console.log('📦 No solutions, showing shape view');
        }

        setLoading(false);
      } catch (err) {
        console.error('❌ Failed to load puzzle data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load puzzle');
        setLoading(false);
      }
    };

    loadData();
  }, [puzzleId]);

  // Handle preset selection (signature matches PresetSelectorModal)
  const handlePresetSelect = (preset: StudioSettings, presetKey: string) => {
    setEnvSettings(preset);
    setCurrentPreset(presetKey);
    try {
      localStorage.setItem('puzzleViewer.environmentPreset', presetKey);
    } catch {
      // ignore
    }
    console.log('✅ Environment preset changed:', presetKey);
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

  // Navigation handlers
  const handleExplore = () => {
    if (!puzzleId) return;
    // Pass selected solution ID if one is selected
    if (selectedSolution) {
      navigate(`/solutions/${puzzleId}?solution=${selectedSolution.id}`);
    } else {
      navigate(`/solutions/${puzzleId}`);
    }
  };

  const handleEdit = () => {
    if (!puzzleId || !puzzle) return;
    // Navigate to create page with puzzle loaded for editing
    navigate('/create', {
      state: {
        loadPuzzle: {
          id: puzzle.id,
          name: puzzle.name,
          cells: puzzle.geometry,
          description: puzzle.description,
          challengeMessage: puzzle.challenge_message,
          isEditing: true // Flag to indicate this is an edit, not a re-save
        }
      }
    });
  };

  const handleSolve = () => {
    if (!puzzleId) return;
    navigate(`/game/${puzzleId}?mode=solo`);
  };

  const handlePlay = () => {
    if (!puzzleId) return;
    navigate(`/play/${puzzleId}`);
  };

  const handleKoosPuzzle = () => {
    if (!puzzleId) return;
    // Navigate to sandbox view page for geometry verification
    navigate(`/view-sandbox/${puzzleId}`);
  };

  const handleAutoSolve = () => {
    if (!puzzleId) return;
    navigate(`/auto/${puzzleId}`);
  };

  const handleClose = () => {
    navigate('/gallery');
  };

  // Handle solution selection from picker modal
  const handleSolutionSelect = (solution: PuzzleSolutionRecord) => {
    setSelectedSolution(solution);
    setShowSolutionPicker(false);
    if (solution.placed_pieces) {
      setPlacedPieces(solution.placed_pieces as PlacedPiece[]);
      setViewMode('solution');
      console.log('✅ Solution selected:', solution.solver_name, solution.placed_pieces.length, 'pieces');
    }
    // Reset idle timer so user can view new selection without rotation for 2 seconds
    resetIdleTimer();
  };

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
            onClick={handleClose}
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
      height: '100dvh', // Use dynamic viewport height for mobile
      position: 'relative', 
      overflow: 'hidden', 
      background: '#000',
      paddingBottom: 'env(safe-area-inset-bottom)' // Support for mobile notch/home indicator
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
            cells={viewMode === 'shape' ? cells : []}
            view={view}
            editMode={false}
            mode="add"
            onCellsChange={() => {}}
            layout="fullscreen"
            placedPieces={viewMode === 'solution' ? placedPieces : []}
            hidePlacedPieces={false}
            settings={solutions.length === 0 ? {
              ...envSettings,
              material: {
                ...envSettings.material,
                color: '#ff0000'
              },
              emptyCells: {
                linkToEnvironment: true,
                customMaterial: {
                  ...envSettings.material,
                  color: '#ff0000'
                }
              }
            } : envSettings}
            puzzleMode="unlimited"
            showBonds={true}
            containerOpacity={solutions.length === 0 ? envSettings.material.opacity : (viewMode === 'solution' ? 0 : 0.15)}
            containerColor={solutions.length === 0 ? "#ff0000" : "#888888"}
            containerRoughness={solutions.length === 0 ? envSettings.material.roughness : 0.8}
            alwaysShowContainer={false}
            visibility={{
              xray: false,
              emptyOnly: false,
              sliceY: { center: 0.5, thickness: 1.0 },
            }}
            onSelectPiece={() => {}}
            turntableRotation={turntableRotation}
            onSceneReady={handleSceneReady}
          />
        </div>
      )}

      {/* Top Control Buttons */}
      {!loading && puzzle && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          display: 'flex',
          gap: '8px',
          zIndex: 1000
        }}>
          {/* Info Button */}
          <button
            onClick={() => setShowInfoModal(true)}
            title="Puzzle Information"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#fff',
              fontWeight: 700,
              border: 'none',
              fontSize: '22px',
              padding: '8px 12px',
              minWidth: '40px',
              minHeight: '40px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
          >
            ℹ️
          </button>

          {/* Solutions Button - only show if multiple solutions */}
          {solutions.length > 1 && (
            <button
              onClick={() => setShowSolutionPicker(true)}
              title={`${solutions.length} Solutions Available`}
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#fff',
                fontWeight: 700,
                border: 'none',
                fontSize: '14px',
                padding: '8px 12px',
                minWidth: '40px',
                minHeight: '40px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
            >
              🏆 {solutions.length}
            </button>
          )}

          {/* Preset Selector */}
          <button
            onClick={() => setShowPresetModal(true)}
            title="Environment Presets"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              fontWeight: 700,
              border: 'none',
              fontSize: '22px',
              padding: '8px 12px',
              minWidth: '40px',
              minHeight: '40px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
          >
            ⚙️
          </button>

          {/* Close Button */}
          <button
            onClick={handleClose}
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>
      )}


      {/* Action Buttons - Bottom Center */}
      {!loading && puzzle && (
        <div style={{
          position: 'fixed',
          bottom: 'max(20px, env(safe-area-inset-bottom, 20px))', // Safe area for mobile
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexWrap: 'nowrap', // Keep buttons side by side
          justifyContent: 'center',
          gap: window.innerWidth < 768 ? '8px' : '16px',
          zIndex: 10,
          padding: window.innerWidth < 768 ? '0 20px' : '0 12px',
          maxWidth: '100%',
          width: window.innerWidth < 768 ? 'calc(100% - 40px)' : 'auto'
        }}>
            <button
              onClick={handleExplore}
              style={{
                background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
                border: 'none',
                borderRadius: window.innerWidth < 768 ? '10px' : '12px',
                color: '#fff',
                padding: window.innerWidth < 768 ? '10px 12px' : '16px 32px',
                fontSize: window.innerWidth < 768 ? '0.85rem' : '1rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: window.innerWidth < 768 ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: window.innerWidth < 768 ? '4px' : '8px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
                flex: '1 1 0',
                minWidth: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>🔍</span>
              <span>{t('gallery.modals.topLevel.explore')}</span>
            </button>

            <button
              onClick={handlePlay}
              style={{
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                border: 'none',
                borderRadius: window.innerWidth < 768 ? '10px' : '12px',
                color: '#fff',
                padding: window.innerWidth < 768 ? '10px 12px' : '16px 32px',
                fontSize: window.innerWidth < 768 ? '0.85rem' : '1rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: window.innerWidth < 768 ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: window.innerWidth < 768 ? '4px' : '8px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)',
                flex: '1 1 0',
                minWidth: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(245, 158, 11, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.4)';
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>🎮</span>
              <span>{t('gallery.modals.topLevel.play')}</span>
            </button>

            {/* Edit Button - visible on all devices */}
            <button
              onClick={handleEdit}
              style={{
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                border: 'none',
                borderRadius: window.innerWidth < 768 ? '10px' : '12px',
                color: '#fff',
                padding: window.innerWidth < 768 ? '10px 12px' : '16px 32px',
                fontSize: window.innerWidth < 768 ? '0.85rem' : '1rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: window.innerWidth < 768 ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: window.innerWidth < 768 ? '4px' : '8px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                flex: '1 1 0',
                minWidth: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>✏️</span>
              <span>{t('gallery.actions.edit')}</span>
            </button>

            {window.innerWidth >= 768 && (
            <button
              onClick={handleKoosPuzzle}
              style={{
                background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                padding: '16px 32px',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
                flex: '1 1 0',
                minWidth: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
              }}
            >
              <span style={{ fontSize: '1.5rem' }}></span>
              <span>KOOS Puzzle</span>
            </button>
            )}

            {window.innerWidth >= 768 && (
            <button
              onClick={handleAutoSolve}
              style={{
                background: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                padding: '16px 32px',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(236, 72, 153, 0.4)',
                flex: '1 1 0',
                minWidth: 0
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(236, 72, 153, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(236, 72, 153, 0.4)';
              }}
            >
              <span style={{ fontSize: '1.5rem' }}></span>
              <span>Auto Solve</span>
            </button>
            )}
        </div>
      )}

      {/* Preset Selector Modal */}
      <PresetSelectorModal
        isOpen={showPresetModal}
        currentPreset={currentPreset}
        onClose={() => setShowPresetModal(false)}
        onSelectPreset={handlePresetSelect}
      />

      {/* Info Modal */}
      {showInfoModal && puzzle && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setShowInfoModal(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #d946ef 0%, #c026d3 50%, #a21caf 100%)',
              borderRadius: '20px',
              padding: '32px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShowInfoModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: '#fff',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '4px 8px',
                lineHeight: 1,
                borderRadius: '6px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
            >
              ✕
            </button>

            {/* Modal Content */}
            <h2 style={{
              color: '#fff',
              fontSize: '1.75rem',
              fontWeight: 700,
              margin: '0 0 28px 0',
              textAlign: 'center',
              textShadow: '0 2px 10px rgba(0, 0, 0, 0.3)'
            }}>
              {puzzle.name}
            </h2>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              color: '#fff',
              fontSize: '1.05rem'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.3rem' }}>🧩</span> Cell Count
                </span>
                <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{cells.length} cells</span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.3rem' }}>✓</span> Solutions
                </span>
                <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                  {solutions.length} solution{solutions.length !== 1 ? 's' : ''}
                </span>
              </div>

              {puzzle.created_at && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.3rem' }}>📅</span> Created
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                    {new Date(puzzle.created_at).toLocaleDateString()}
                  </span>
                </div>
              )}

              {puzzle.creator_name && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.3rem' }}>👤</span> Creator
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{puzzle.creator_name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Solution Picker Modal */}
      {showSolutionPicker && solutions.length > 1 && puzzle && (
        <SolutionPickerModal
          solutions={solutions}
          puzzleName={puzzle.name || 'Puzzle'}
          onSelect={handleSolutionSelect}
          onClose={() => setShowSolutionPicker(false)}
        />
      )}
    </div>
  );
}
