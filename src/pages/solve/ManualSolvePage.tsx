// Manual Solve Page - Clean implementation for puzzle solving
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { IJK } from '../../types/shape';
import type { VisibilitySettings } from '../../types/lattice';
import { ijkToXyz } from '../../lib/ijk';
import SceneCanvas from '../../components/SceneCanvas';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { usePuzzleLoader } from './hooks/usePuzzleLoader';
import { useSolveActionTracker } from './hooks/useSolveActionTracker';
import { usePlacedPiecesWithUndo } from './hooks/usePlacedPiecesWithUndo';
import { useOrientationService } from './hooks/useOrientationService';
import { useManualDrawing } from './hooks/useManualDrawing';
import { useHintSystem } from './hooks/useHintSystem';
import { useSolvabilityCheck } from './hooks/useSolvabilityCheck';
import { useCompletionAutoSave } from './hooks/useCompletionAutoSave';
import type { PlacedPiece } from './types/manualSolve';
import { findFirstMatchingPiece } from './utils/manualSolveMatch';
import { DEFAULT_PIECE_LIST, STANDARD_PIECE_COUNT, estimatePuzzleComplexity as estimatePuzzleComplexityHelper, computeEmptyCells as computeEmptyCellsHelper } from './utils/manualSolveHelpers';
import { HowToPuzzleContent } from './components/HowToPuzzleContent';
import { AboutPuzzleContent } from './components/AboutPuzzleContent';
import { ManualSolveHeader } from './components/ManualSolveHeader';
import { ManualSolveFooter } from './components/ManualSolveFooter';
import { ManualSolveSuccessModal } from './components/ManualSolveSuccessModal';
import { ManualSolveMovieTypeModal } from './components/ManualSolveMovieTypeModal';
import { SettingsModal } from '../../components/SettingsModal';
import { InfoModal } from '../../components/InfoModal';
import { StudioSettingsService } from '../../services/StudioSettingsService';
import { Notification } from '../../components/Notification';
import { PieceBrowserModal } from './components/PieceBrowserModal';
import { useDraggable } from '../../hooks/useDraggable';
import '../../styles/shape.css';

// Environment settings
import { StudioSettings, DEFAULT_STUDIO_SETTINGS } from '../../types/studio';

// Piece availability modes
type Mode = 'oneOfEach' | 'unlimited' | 'single';

// Solvability status
type SolvableStatus = 'unknown' | 'checking' | 'solvable' | 'unsolvable';

// FCC transformation matrix (constant)
const T_IJK_TO_XYZ = [
  [0.5, 0.5, 0, 0],
  [0.5, 0, 0.5, 0],
  [0, 0.5, 0.5, 0],
  [0, 0, 0, 1],
];

export const ManualSolvePage: React.FC = () => {
  const navigate = useNavigate();
  const { id: puzzleId } = useParams<{ id: string }>();
  const { puzzle, loading, error } = usePuzzleLoader(puzzleId);

  const {
    service: orientationService,
    loading: orientationsLoading,
    error: orientationsError,
  } = useOrientationService();
  
  // Shape state
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [loaded, setLoaded] = useState(false);
  
  // Solving state - timer and moves
  const [solveStartTime, setSolveStartTime] = useState<number | null>(null);
  const [solveEndTime, setSolveEndTime] = useState<number | null>(null);
  const [moveCount, setMoveCount] = useState(0);
  const [undoCount, setUndoCount] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  
  // Board state: placed pieces (with undo/redo)
  const {
    placed,
    placedCountByPieceId,
    canUndo,
    placePiece,
    deletePieceByUid,
    undo,
    redo,
    resetPlacedState,
  } = usePlacedPiecesWithUndo();

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  
  // Solvability tracking
  const [solvableStatus, setSolvableStatus] = useState<SolvableStatus>('unknown');

  // Piece selection
  const [pieces, setPieces] = useState<string[]>([]);
  const [activePiece, setActivePiece] = useState<string>('K'); // For single mode validation
  const [mode, setMode] = useState<Mode>('oneOfEach');
  
  // UI state (declared early for use in hooks)
  const [notification, setNotification] = useState<string | null>(null);
  const [notificationType, setNotificationType] = useState<'info' | 'warning' | 'error' | 'success'>('info');
  const [showAboutPuzzle, setShowAboutPuzzle] = useState(false);
  
  // Completion and visual state (declared early for use in hooks)
  const [revealK, setRevealK] = useState<number>(0);
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);
  
  // Action tracking (declared early for use in hooks)
  const { trackAction, actions: solveActions, clearHistory } = useSolveActionTracker();

  // Drawing state management (defined early so clearDrawing available in effects)
  const { drawingCells, drawCell, clearDrawing } = useManualDrawing({
    placed,
    onPieceDrawn: (cells) => identifyAndPlacePiece(cells),
  });
  
  // Hint system
  const { hintCells, hintsUsed, handleRequestHint: handleRequestHintBase } = useHintSystem({
    puzzle,
    cells,
    mode,
    placed,
    activePiece,
    orientationService,
    placePiece,
    setNotification,
    setNotificationType,
  });
  
  // Solvability check system
  const { solvabilityChecksUsed, handleRequestSolvability } = useSolvabilityCheck({
    puzzle,
    cells,
    mode,
    placed,
    activePiece,
    setSolvableStatus,
    setNotification,
    setNotificationType,
  });
  
  // Compute solve statistics for leaderboards
  const computeSolveStats = useCallback(() => {
    // Guard in case end time hasn't been set yet
    const durationMs =
      solveStartTime && solveEndTime
        ? solveEndTime - solveStartTime
        : null;

    console.log('📊 Computing solve stats:', {
      solveStartTime,
      solveEndTime,
      durationMs,
      moveCount,
      undoCount,
      hintsUsed,
      solvabilityChecksUsed
    });

    return {
      total_moves: moveCount,
      undo_count: undoCount,
      hints_used: hintsUsed,
      solvability_checks_used: solvabilityChecksUsed,
      duration_ms: durationMs,
    };
  }, [
    moveCount,
    undoCount,
    hintsUsed,
    solvabilityChecksUsed,
    solveStartTime,
    solveEndTime,
  ]);
  
  // Group solve stats into a single object for easier access
  const solveStats = useMemo(
    () => computeSolveStats(),
    [computeSolveStats]
  );
  
  // Solution save system
  // Success modal state (managed by auto-save)
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [currentSolutionId, setCurrentSolutionId] = useState<string | null>(null);
  
  // Completion detection and auto-save
  const { hasSetCompleteRef: _hasSetCompleteRef } = useCompletionAutoSave({
    puzzle,
    cells,
    placed,
    solveStartTime,
    moveCount,
    solveActions,
    getSolveStats: () => solveStats,
    setIsComplete,
    setSolveEndTime,
    setRevealK,
    setShowCompletionCelebration,
    setCurrentSolutionId,
    setShowSuccessModal,
    setNotification,
    setNotificationType,
  });
  
  // More UI state
  const [showViewPieces, setShowViewPieces] = useState(false);
  const [hidePlacedPieces, setHidePlacedPieces] = useState(false);
  const [temporarilyVisiblePieces, setTemporarilyVisiblePieces] = useState<Set<string>>(new Set());
  
  // Reveal slider state
  const [revealMax, setRevealMax] = useState<number>(0);
  
  // Explosion slider state
  const [explosionFactor, setExplosionFactor] = useState<number>(0);
  
  // Movie type selection modal state
  const [showMovieTypeModal, setShowMovieTypeModal] = useState(false);
  
  // Draggable for movie type modal
  const movieTypeModalDraggable = useDraggable();
  
  // Handle movie type selection
  const handleMovieTypeSelect = (effectType: string) => {
    if (!puzzle) {
      console.error('❌ No puzzle available for movie creation');
      return;
    }
    
    if (!currentSolutionId) {
      console.error('❌ No solution ID available for movie creation');
      setNotification('Please wait for solution to save before creating movie');
      setNotificationType('warning');
      return;
    }
    
    console.log('🎬 Creating movie with effect:', effectType, 'for solution:', currentSolutionId);
    
    // Close the movie type modal
    setShowMovieTypeModal(false);
    setShowSuccessModal(false);
    
    // Navigate to dedicated movie page for the effect type with solution ID
    // Add mode=create to indicate movie creation (no automatic modals)
    const url = `/movies/${effectType}/${currentSolutionId}?mode=create`;
    console.log('🔗 Navigating to:', url);
    navigate(url);
  };
  
  
  // Environment settings (3D scene: lighting, materials, etc.)
  const settingsService = useRef(new StudioSettingsService());
  const [envSettingsState, setEnvSettingsState] = useState<StudioSettings>(() => {
    // Load from localStorage immediately on initialization
    try {
      const rawStored = localStorage.getItem('contentStudio_v2');
      if (rawStored) {
        const stored = JSON.parse(rawStored);
        if (stored && typeof stored === 'object') {
          return { ...DEFAULT_STUDIO_SETTINGS, ...stored };
        }
      }
    } catch (err) {
      console.warn('⚠️ Failed to load settings from localStorage:', err);
    }
    return DEFAULT_STUDIO_SETTINGS;
  });
  const [showEnvSettings, setShowEnvSettings] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  
  // Just use the state directly
  const envSettings = envSettingsState;
  
  // Visibility for shape browser
  const visibility = useMemo<VisibilitySettings>(() => ({
    showSpheres: true,
    showBonds: true,
    showConvexHull: false,
    showShadows: envSettings.lights.shadows.enabled,
    xray: false,
    emptyOnly: false,
    sliceY: null as any,
  }), [envSettings.lights.shadows.enabled]);
  
  // No need for explicit load useEffect - initialized from localStorage in useState
  
  // Load puzzle data
  useEffect(() => {
    if (!puzzle) return;
    
    console.log('📦 Loading puzzle:', puzzle.name);
    
    // Load piece list - puzzle has 25 standard pieces (A-Y)
    setPieces(DEFAULT_PIECE_LIST);
    setActivePiece(DEFAULT_PIECE_LIST[0]);
    
    // Load container geometry from puzzle.geometry (not container_geometry!)
    const containerCells = (puzzle as any).geometry || [];
    console.log('📊 Container geometry:', containerCells.length, 'cells');
    setCells(containerCells);
    
    // Compute view transforms
    try {
      const viewData = computeViewTransforms(containerCells, ijkToXyz, T_IJK_TO_XYZ, quickHullWithCoplanarMerge);
      setView(viewData);
      
      // Set up camera
      setTimeout(() => {
        const center = (viewData as any).centroid_world || (viewData as any).centroidWorld;
        if ((window as any).setOrbitTarget) {
          (window as any).setOrbitTarget(center);
        }
      }, 100);
    } catch (error) {
      console.error('❌ Failed to compute view transforms:', error);
    }
    
    setLoaded(true);
  }, [puzzle]);
  
  // Auto-open About modal when arriving from gallery
  useEffect(() => {
    if (!puzzle) return;

    const params = new URLSearchParams(window.location.search);
    const fromGalleryParam = params.get('from') === 'gallery';
    const fromGalleryReferrer = document.referrer.includes('/gallery');

    if (!fromGalleryParam && !fromGalleryReferrer) return;

    setShowAboutPuzzle(true);

    if (fromGalleryParam) {
      params.delete('from');
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [puzzle]);
  
  // Check for completion
  useEffect(() => {
    if (!puzzle || placed.size === 0) {
      setIsComplete(false);
      setRevealMax(0);
      return;
    }
    
    const complete = placed.size === STANDARD_PIECE_COUNT;
    
    if (complete && !isComplete) {
      console.log('🎉 Puzzle complete!');
      setShowCompletionCelebration(true);
      setTimeout(() => setShowCompletionCelebration(false), 3000);
      setShowSuccessModal(true);
    }
    
    setIsComplete(complete);
    setRevealMax(placed.size);
    setRevealK(placed.size);
  }, [placed.size, puzzle, isComplete]);
  
  
  // Note: Removed click & choose mode - only draw mode remains
  
  const handleDeleteSelected = useCallback(() => {
    if (!selectedUid) return;

    const piece = deletePieceByUid(selectedUid);
    if (!piece) return;

    setMoveCount(prev => prev + 1);
    setUndoCount(prev => prev + 1); // Track explicit deletions as undos
    setSelectedUid(null);

    // Track action
    trackAction('REMOVE_PIECE', {
      pieceId: piece.pieceId,
      uid: selectedUid,
    });

    console.log('🗑️ Deleted piece:', selectedUid);
  }, [selectedUid, deletePieceByUid, trackAction]);

  // Identify piece from drawn cells
  const identifyAndPlacePiece = useCallback((drawnCells: IJK[]) => {
    if (orientationsError) {
      console.error('🎨 Failed to load orientations:', orientationsError);
      setNotification('Failed to load piece orientations');
      setNotificationType('error');
      return;
    }

    if (orientationsLoading || !orientationService) {
      setNotification('Loading piece orientations, please try again in a moment');
      setNotificationType('info');
      return;
    }

    const match = findFirstMatchingPiece(drawnCells, pieces, orientationService);

    if (!match) {
      setNotification('Shape not recognized - must be a valid Koos piece');
      setNotificationType('warning');
      return;
    }

    const bestMatch = {
      pieceId: match.pieceId,
      orientationId: match.orientationId,
      cells: drawnCells,
    } as const;

    const currentCount = placedCountByPieceId[bestMatch.pieceId] ?? 0;
    if (mode === 'oneOfEach' && currentCount >= 1) {
      setNotification(`Piece "${bestMatch.pieceId}" is already placed in One-of-Each mode`);
      setNotificationType('warning');
      return;
    }
    // Single mode: first piece can be any piece, subsequent pieces must match
    if (mode === 'single') {
      if (placed.size === 0) {
        // First piece - any piece is allowed, set it as active
        setActivePiece(bestMatch.pieceId);
        console.log(`🎯 Single mode: First piece set to "${bestMatch.pieceId}"`);
      } else {
        // Subsequent pieces must match the first piece
        const firstPiece = Array.from(placed.values())[0];
        if (bestMatch.pieceId !== firstPiece.pieceId) {
          setNotification(`Single Piece mode: Can only place "${firstPiece.pieceId}" (first piece placed)`);
          setNotificationType('warning');
          return;
        }
      }
    }
    
    // START TIMER if not started
    if (!isStarted) {
      setSolveStartTime(Date.now());
      setIsStarted(true);
    }
    setMoveCount(prev => prev + 1);
    
    const uid = `pp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const placedPiece: PlacedPiece = {
      pieceId: bestMatch.pieceId,
      orientationId: bestMatch.orientationId,
      anchorSphereIndex: 0,
      cells: bestMatch.cells,
      uid,
      placedAt: Date.now(),
    };

    placePiece(placedPiece);
    
    // Track action
    trackAction('PLACE_PIECE', {
      pieceId: bestMatch.pieceId,
      orientation: bestMatch.orientationId,
      ijkPosition: bestMatch.cells[0],
      cells: bestMatch.cells,
      uid: uid,
    });
    
    // Keep piece visible for 2 seconds even if hidePlacedPieces is true
    if (hidePlacedPieces) {
      setTemporarilyVisiblePieces(prev => new Set(prev).add(uid));
      setTimeout(() => {
        setTemporarilyVisiblePieces(prev => {
          const next = new Set(prev);
          next.delete(uid);
          return next;
        });
      }, 2000);
    }
    
    setSelectedUid(null);
    setNotification(`Piece ${bestMatch.pieceId} added!`);
    setNotificationType('success');
  }, [
    orientationsError,
    orientationsLoading,
    orientationService,
    pieces,
    placedCountByPieceId,
    mode,
    placed,
    isStarted,
    hidePlacedPieces,
    placePiece,
    trackAction,
  ]);
  
  // Interaction handler (draw-only mode - no ghost/preview)
  const handleInteraction = useCallback((
    target: 'cell' | 'piece' | 'background' | 'ghost',
    type: 'single' | 'double' | 'long',
    data?: any
  ) => {
    console.log('🎯 Interaction:', target, type, data);

    // --- DESELECT GUARD: Clear selection when clicking away from selected piece ---
    setSelectedUid(prevSelected => {
      if (!prevSelected) return prevSelected; // Nothing selected
      
      // Only consider single and double click types
      if (type !== 'single' && type !== 'double') return prevSelected;
      
      // If we clicked on the *same* selected piece, keep it for now
      // (Piece + single/double will handle its own behavior later)
      if (target === 'piece' && data === prevSelected) {
        return prevSelected;
      }
      
      // For any other target (other piece, cell, background),
      // deselect the previously selected piece
      return null;
    });

    if (target === 'cell') {
      const clickedCell = data as IJK;

      if (type === 'single') {
        // Cancel drawing mode if single clicking
        if (drawingCells.length > 0) {
          clearDrawing();
        }
      } else if (type === 'double') {
        // Double-click to draw
        drawCell(clickedCell);
      }
      return;
    }

    if (target === 'piece') {
      const uid = data as string;
      
      if (type === 'single') {
        // TASK 2: Clear any in-progress drawing first
        if (drawingCells.length > 0) {
          clearDrawing();
        }
        
        // Select piece for deletion
        setSelectedUid(uid === selectedUid ? null : uid);
      } else if (type === 'double' || type === 'long') {
        // Delete selected piece
        if (uid === selectedUid) {
          handleDeleteSelected();
        }
      }
      return;
    }

    if (target === 'background') {
      if (type === 'single') {
        setSelectedUid(null);
        clearDrawing();
      }
      return;
    }
  }, [selectedUid, handleDeleteSelected, drawingCells, drawCell, clearDrawing]);
  
  const handleUndo = useCallback(() => {
    undo();
    setUndoCount(prev => prev + 1); // Track undo button usage
    // Clear selection, because the last operation may have removed or changed the selected piece
    if (selectedUid) {
      setSelectedUid(null);
    }
  }, [undo, selectedUid]);
  
  const handleRedo = useCallback(() => {
    redo();
    if (selectedUid) {
      setSelectedUid(null);
    }
  }, [redo, selectedUid]);
  
  // Reset solvability status when board changes
  useEffect(() => {
    // Any change in placed pieces invalidates previous solvability result
    setSolvableStatus('unknown');
  }, [placed]);
  
  
  // Compute empty cells and complexity using memoized helpers
  const emptyCells = useMemo(
    () => computeEmptyCellsHelper(cells, placed),
    [cells, placed]
  );

  const complexity = useMemo(
    () => estimatePuzzleComplexityHelper(cells.length, pieces.length),
    [cells.length, pieces.length]
  );
  
  
  
  // Request hint handler - works with any number of empty cells
  const handleRequestHint = useCallback(async () => {
    // We need the orientation service to interpret hint orientations
    if (!orientationService) {
      setNotification('Hint engine is still initializing. Please try again.');
      setNotificationType('info');
      return;
    }

    // Clear drawing before showing hint
    clearDrawing();

    // Call the base hint handler (it will check drawingCells)
    await handleRequestHintBase(drawingCells);
  }, [
    setNotification,
    setNotificationType,
    orientationService,
    clearDrawing,
    handleRequestHintBase,
    drawingCells,
  ]);

  const handleReset = useCallback(() => {
    if (!confirm('Reset puzzle? This will clear all placed pieces.')) return;

    resetPlacedState();
    setSelectedUid(null);
    setMoveCount(0);
    setUndoCount(0); // Reset undo stats
    setSolveStartTime(null);
    setSolveEndTime(null);
    setIsStarted(false);
    setIsComplete(false);
    clearHistory();

    console.log('🔄 Puzzle reset');
  }, [clearHistory, resetPlacedState]);
  
  // Reset puzzle when mode changes
  useEffect(() => {
    console.log('🔄 Mode changed – resetting puzzle state for mode:', mode);
    resetPlacedState();
    setSelectedUid(null);
    clearDrawing();
    setMoveCount(0);
    setUndoCount(0);
    setSolveStartTime(null);
    setSolveEndTime(null);
    setIsStarted(false);
    setIsComplete(false);
  }, [mode, resetPlacedState, clearDrawing]);
  
  // Ensure activePiece follows piece list
  useEffect(() => {
    if (pieces.length > 0) {
      setActivePiece(pieces[0]);
    }
  }, [pieces]);
  
  // Keyboard shortcuts (simplified for draw-only mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showViewPieces || showInfoModal) return;
      
      if (e.key === 'Escape') {
        if (selectedUid) {
          setSelectedUid(null);
          e.preventDefault();
        }
        if (drawingCells.length > 0) {
          clearDrawing();
          e.preventDefault();
        }
      }
      
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedUid) {
        handleDeleteSelected();
        e.preventDefault();
      }
      
      // Undo/Redo
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        handleUndo();
        e.preventDefault();
      }
      
      if ((e.key === 'z' && e.shiftKey && (e.ctrlKey || e.metaKey)) || (e.key === 'y' && (e.ctrlKey || e.metaKey))) {
        handleRedo();
        e.preventDefault();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showViewPieces,
    showInfoModal,
    selectedUid,
    drawingCells,
    clearDrawing,
    handleDeleteSelected,
    handleUndo,
    handleRedo,
  ]);
  
  
  // UI gating for hint and solvability buttons
  const canHintButton = true; // Hints work with any number of empty cells
  const canSolvableButton = true; // Solvability check always available (uses lightweight checks for >30 empty)
  
  // Loading states
  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading puzzle...</p>
      </div>
    );
  }
  
  if (error || !puzzle) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Error loading puzzle: {error}</p>
        <button onClick={() => navigate('/gallery')} className="btn">
          Back to Gallery
        </button>
      </div>
    );
  }
  
  return (
    <div className="page-container">
      <ManualSolveHeader
        mode={mode}
        hidePlacedPieces={hidePlacedPieces}
        canUndo={canUndo}
        onOpenPieces={() => setShowViewPieces(true)}
        onChangeMode={setMode}
        onToggleHidePlaced={() => setHidePlacedPieces(prev => !prev)}
        onUndo={handleUndo}
        onOpenInfo={() => setShowInfoModal(true)}
        onOpenSettings={() => setShowEnvSettings(true)}
        onGoToGallery={() => navigate('/gallery')}
        onGoToAutoSolve={() => navigate(`/auto/${puzzle?.id}`)}
        onCheckSolvable={handleRequestSolvability}
        onRequestHint={handleRequestHint}
        solvableStatus={solvableStatus}
        canHint={canHintButton}
        showSolvableButton={canSolvableButton}
        onOpenAboutPuzzle={() => setShowAboutPuzzle(true)}
      />
      
      {/* Main Content */}
      <div className="page-content" style={{ marginTop: '56px' }}>
        {loaded && view ? (
          <SceneCanvas
            cells={cells}
            view={view}
            editMode={false}
            mode="add"
            onCellsChange={() => {}}
            containerOpacity={envSettings.emptyCells?.customMaterial?.opacity ?? 1.0}
            containerColor={envSettings.emptyCells?.customMaterial?.color ?? '#888888'}
            containerRoughness={envSettings.emptyCells?.linkToEnvironment ? envSettings.material.roughness : (envSettings.emptyCells?.customMaterial?.roughness ?? 0.35)}
            puzzleMode={mode}
            placedPieces={Array.from(placed.values())}
            selectedPieceUid={selectedUid}
            onSelectPiece={setSelectedUid}
            onDeleteSelectedPiece={handleDeleteSelected}
            drawingCells={drawingCells}
            hidePlacedPieces={hidePlacedPieces}
            temporarilyVisiblePieces={temporarilyVisiblePieces}
            explosionFactor={explosionFactor}
            turntableRotation={0}
            settings={envSettings}
            visibility={visibility}
            onInteraction={handleInteraction}
            onSceneReady={() => {}}
            hintCells={hintCells}
          />
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            Loading 3D scene...
          </div>
        )}
        
        {/* Drawing Mode Indicator */}
        {drawingCells.length > 0 && (
          <div style={{
            position: 'absolute',
            top: 70,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 200, 0, 0.9)',
            color: '#000',
            padding: '10px 20px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 1000
          }}>
            🎨 Drawing {drawingCells.length}/4 cells - Double-click adjacent cells | Single click to cancel
          </div>
        )}
      </div>
      
      {/* Footer Controls */}
      <ManualSolveFooter
        mode={mode}
        activePiece={activePiece}
        pieces={pieces}
        placedCountByPieceId={placedCountByPieceId}
        placedCount={placed.size}
        revealK={revealK}
        revealMax={revealMax}
        onChangeRevealK={setRevealK}
        explosionFactor={explosionFactor}
        onChangeExplosionFactor={setExplosionFactor}
        onChangeActivePiece={setActivePiece}
        onReset={handleReset}
      />
      
      {/* Piece Browser Modal - Read-only reference */}
      <PieceBrowserModal
        isOpen={showViewPieces}
        onClose={() => setShowViewPieces(false)}
        pieces={pieces}
        activePiece={activePiece}
        settings={envSettings}
        mode={mode}
        placedCountByPieceId={placedCountByPieceId}
        onSelectPiece={() => {}}
      />

      {/* Environment Settings Modal */}
      {showEnvSettings && (
        <SettingsModal
          settings={envSettings}
          onSettingsChange={(newSettings) => {
            setEnvSettingsState(newSettings);
            settingsService.current.saveSettings(newSettings);
          }}
          onClose={() => setShowEnvSettings(false)}
        />
      )}

      {/* How to Puzzle Modal */}
      <InfoModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        title="How to puzzle"
      >
        <HowToPuzzleContent />
      </InfoModal>

      {/* About This Puzzle Modal */}
      <InfoModal
        isOpen={showAboutPuzzle}
        onClose={() => setShowAboutPuzzle(false)}
        title={puzzle?.name ? `About "${puzzle.name}"` : 'About this puzzle'}
        aiContext={{
          source: 'about-puzzle',
          puzzleId: puzzle?.id,
          puzzleName: puzzle?.name,
          mode,
          cellsCount: cells.length,
          allowedPieces:
            ((puzzle as any)?.allowed_piece_ids as string[] | undefined) || pieces,
          placedPiecesCount: placed.size,
          emptyCellsCount: emptyCells.length,
          difficultyEstimate: complexity,
        }}
      >
        <AboutPuzzleContent
          puzzle={puzzle}
          mode={mode}
          cellsCount={cells.length}
          pieces={pieces}
          placedCount={placed.size}
          emptyCellsCount={emptyCells.length}
          complexity={complexity}
          onOpenHowTo={() => {
            setShowAboutPuzzle(false);
            setShowInfoModal(true);
          }}
        />
      </InfoModal>
      
      <ManualSolveSuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        onMakeMovie={() => {
          setShowSuccessModal(false);
          setShowMovieTypeModal(true);
        }}
        onViewLeaderboard={() => {
          setShowSuccessModal(false);
          navigate(`/leaderboards/${puzzle?.id}`);
        }}
        solveStartTime={solveStartTime}
        solveEndTime={solveEndTime}
        moveCount={moveCount}
        pieceCount={placed.size}
      />
      
      
      <ManualSolveMovieTypeModal
        isOpen={showMovieTypeModal}
        onClose={() => setShowMovieTypeModal(false)}
        draggableRef={movieTypeModalDraggable.ref}
        draggableStyle={movieTypeModalDraggable.style}
        onSelectType={handleMovieTypeSelect}
      />
      
      {/* Notifications */}
      {notification && (
        <Notification
          message={notification}
          type={notificationType}
          onClose={() => setNotification(null)}
          duration={3000}
        />
      )}
      
      {/* Completion Celebration */}
      {showCompletionCelebration && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '4rem',
          zIndex: 999,
          animation: 'bounce 0.5s',
          pointerEvents: 'none'
        }}>
          🎉
        </div>
      )}
    </div>
  );
};
