// Manual Solve Page - Clean implementation for puzzle solving
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { IJK } from '../../types/shape';
import type { VisibilitySettings } from '../../types/lattice';
import { ijkToXyz } from '../../lib/ijk';
import SceneCanvas from '../../components/SceneCanvas';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { GoldOrientationService, GoldOrientationController } from '../../services/GoldOrientationService';
import { computeFits, ijkToKey, type FitPlacement } from '../../services/FitFinder';
import { supabase } from '../../lib/supabase';
import { usePuzzleLoader } from './hooks/usePuzzleLoader';
import { useSolveActionTracker } from './hooks/useSolveActionTracker';
import { SolveStats } from './components/SolveStats';
import { SettingsModal } from '../../components/SettingsModal';
import { InfoModal } from '../../components/InfoModal';
import { StudioSettingsService } from '../../services/StudioSettingsService';
import { Notification } from '../../components/Notification';
import { PieceBrowserModal } from './components/PieceBrowserModal';
import '../../styles/shape.css';

// Environment settings
import { StudioSettings, DEFAULT_STUDIO_SETTINGS } from '../../types/studio';

// Piece placement type
type PlacedPiece = FitPlacement & {
  uid: string;
  placedAt: number;
};

// Action type for undo/redo
type Action = 
  | { type: 'place'; piece: PlacedPiece }
  | { type: 'delete'; piece: PlacedPiece };

// Piece availability modes
type Mode = 'oneOfEach' | 'unlimited' | 'single';

export const ManualSolvePage: React.FC = () => {
  const navigate = useNavigate();
  const { id: puzzleId } = useParams<{ id: string }>();
  const { puzzle, loading, error } = usePuzzleLoader(puzzleId);
  const orientationController = useRef<GoldOrientationController | null>(null);
  
  // Solution tracking
  const [currentSolutionId, setCurrentSolutionId] = useState<string | null>(null);
  
  // FCC transformation matrix
  const T_ijk_to_xyz = [
    [0.5, 0.5, 0, 0],
    [0.5, 0, 0.5, 0],  
    [0, 0.5, 0.5, 0],
    [0, 0, 0, 1]
  ];
  
  // Shape state
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [loaded, setLoaded] = useState(false);
  
  // Solving state - timer and moves
  const [solveStartTime, setSolveStartTime] = useState<number | null>(null);
  const [solveEndTime, setSolveEndTime] = useState<number | null>(null);
  const [moveCount, setMoveCount] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  
  // Board state: placed pieces
  const [placed, setPlaced] = useState<Map<string, PlacedPiece>>(new Map());
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  
  // Ghost/Preview state
  const [anchor, setAnchor] = useState<IJK | null>(null);
  const [fits, setFits] = useState<FitPlacement[]>([]);
  const [fitIndex, setFitIndex] = useState<number>(0);
  const currentFit = fits.length > 0 ? fits[fitIndex] : null;
  
  // Piece selection
  const [pieces, setPieces] = useState<string[]>([]);
  const [activePiece, setActivePiece] = useState<string>('K');
  const [mode, setMode] = useState<Mode>('oneOfEach');
  const [placedCountByPieceId, setPlacedCountByPieceId] = useState<Record<string, number>>({});
  
  // Drawing mode state
  const [drawingCells, setDrawingCells] = useState<IJK[]>([]);
  
  // Undo/Redo stacks
  const [undoStack, setUndoStack] = useState<Action[]>([]);
  const [redoStack, setRedoStack] = useState<Action[]>([]);
  
  // UI state
  const [showViewPieces, setShowViewPieces] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [hidePlacedPieces, setHidePlacedPieces] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [notificationType, setNotificationType] = useState<'info' | 'warning' | 'error' | 'success'>('info');
  const [lastViewedPiece, setLastViewedPiece] = useState<string>('K');
  
  // Stable empty function
  const noOpSelectPiece = useRef(() => {}).current;
  
  // Timestamp to prevent ghost after deletion
  const lastDeleteTimeRef = useRef(0);
  
  // Reveal slider state
  const [revealK, setRevealK] = useState<number>(0);
  const [revealMax, setRevealMax] = useState<number>(0);
  
  // Explosion slider state
  const [explosionFactor, setExplosionFactor] = useState<number>(0);
  
  // Save modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);
  
  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  // Movie type selection modal state
  const [showMovieTypeModal, setShowMovieTypeModal] = useState(false);
  
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
  
  // Track if we've already saved to prevent duplicate saves
  const hasSavedRef = useRef(false);
  const hasSetCompleteRef = useRef(false);
  
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
  
  // Action tracking for solve actions
  const { trackAction, actions: solveActions, clearHistory } = useSolveActionTracker();
  
  // No need for explicit load useEffect - initialized from localStorage in useState
  
  // Load puzzle data
  useEffect(() => {
    if (!puzzle) return;
    
    console.log('📦 Loading puzzle:', puzzle.name);
    
    // Load piece list - puzzle has 25 standard pieces (A-Y)
    const pieceList = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 
                       'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y'];
    setPieces(pieceList);
    setActivePiece(pieceList[0]);
    setLastViewedPiece(pieceList[0]);
    
    // Load container geometry from puzzle.geometry (not container_geometry!)
    const containerCells = (puzzle as any).geometry || [];
    console.log('📊 Container geometry:', containerCells.length, 'cells');
    setCells(containerCells);
    
    // Compute view transforms
    try {
      const viewData = computeViewTransforms(containerCells, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
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
  
  // Init orientation service
  useEffect(() => {
    if (!puzzle || !loaded || !activePiece) return;
    
    (async () => {
      const service = new GoldOrientationService();
      await service.load();
      const controller = new GoldOrientationController(service);
      await controller.init(activePiece);
      orientationController.current = controller;
      console.log(`✅ Orientation service initialized for piece ${activePiece}`);
    })();
  }, [puzzle, loaded, activePiece]);
  
  // Fits are computed in handleCellClick now - remove this useEffect
  
  // Check for completion
  useEffect(() => {
    if (!puzzle || placed.size === 0) {
      setIsComplete(false);
      setRevealMax(0);
      return;
    }
    
    const targetPieceCount = 25; // Standard Koos puzzle has 25 pieces
    const complete = placed.size === targetPieceCount;
    
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
  
  // Clear ghost (anchor + fits)
  const clearGhost = useCallback(() => {
    setAnchor(null);
    setFits([]);
    setFitIndex(0);
  }, []);
  
  // Confirm fit (place piece)
  const handleConfirmFit = useCallback(() => {
    if (!currentFit) return;
    
    const currentCount = placedCountByPieceId[currentFit.pieceId] ?? 0;
    
    if (mode === 'oneOfEach' && currentCount >= 1) {
      setNotification(`Piece "${currentFit.pieceId}" is already placed in One-of-Each mode`);
      setNotificationType('warning');
      return;
    }
    
    // START TIMER on first placement
    if (!isStarted) {
      setSolveStartTime(Date.now());
      setIsStarted(true);
      console.log('⏱️ Timer started for manual solve');
    }
    setMoveCount(prev => prev + 1);
    
    const uid = `pp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const placedPiece: PlacedPiece = {
      ...currentFit,
      uid,
      placedAt: Date.now(),
    };
    
    setPlaced(prev => {
      const next = new Map(prev);
      next.set(uid, placedPiece);
      return next;
    });
    
    setUndoStack(prev => [...prev, { type: 'place', piece: placedPiece }]);
    setRedoStack([]);
    
    setPlacedCountByPieceId(prev => ({
      ...prev,
      [currentFit.pieceId]: (prev[currentFit.pieceId] ?? 0) + 1
    }));
    
    // Track action
    trackAction('PLACE_PIECE', {
      pieceId: currentFit.pieceId,
      orientation: currentFit.orientationId,
      ijkPosition: currentFit.cells[0],
      cells: currentFit.cells,
      uid: uid,
    });
    
    console.log('✅ Piece placed:', { uid, pieceId: currentFit.pieceId, moveCount: moveCount + 1 });
    
    clearGhost();
  }, [currentFit, placedCountByPieceId, mode, isStarted, moveCount, trackAction, clearGhost]);
  
  // Handle cell click
  const handleCellClick = useCallback((clickedCell: IJK) => {
    // Block ghost creation for 300ms after deletion
    const timeSinceDelete = Date.now() - lastDeleteTimeRef.current;
    if (timeSinceDelete < 300) {
      console.log('🚫 Click blocked - just deleted');
      return;
    }
    
    console.log('🟬 Cell clicked:', clickedCell);
    
    // Check if clicking on occupied cell
    const clickedKey = ijkToKey(clickedCell);
    const occupiedSet = new Set<string>();
    for (const piece of placed.values()) {
      for (const cell of piece.cells) {
        occupiedSet.add(ijkToKey(cell));
      }
    }
    
    if (occupiedSet.has(clickedKey)) {
      setSelectedUid(null);
      clearGhost();
      return;
    }
    
    setSelectedUid(null);
    setAnchor(clickedCell);
    
    const controller = orientationController.current;
    if (!controller) {
      console.log('❌ No orientation controller');
      clearGhost();
      return;
    }
    
    const orientations = controller.getOrientations();
    console.log(`🔍 Got ${orientations.length} orientations for piece ${activePiece}`);
    
    if (orientations.length === 0) {
      console.log('❌ No orientations found');
      clearGhost();
      return;
    }
    
    const containerSet = new Set(cells.map(ijkToKey));
    
    const validFits = computeFits({
      containerCells: containerSet,
      occupiedCells: occupiedSet,
      anchor: clickedCell,
      pieceId: activePiece,
      orientations,
    });
    
    console.log(`✅ Found ${validFits.length} valid fits at ${JSON.stringify(clickedCell)}`);
    
    setFits(validFits);
    setFitIndex(0);
  }, [placed, cells, activePiece, clearGhost]);
  
  const handleDeleteSelected = useCallback(() => {
    if (!selectedUid) return;
    
    const piece = placed.get(selectedUid);
    if (!piece) return;
    
    setPlaced(prev => {
      const next = new Map(prev);
      next.delete(selectedUid);
      return next;
    });
    
    setUndoStack(prev => [...prev, { type: 'delete', piece }]);
    setRedoStack([]);
    setMoveCount(prev => prev + 1);
    setSelectedUid(null);
    lastDeleteTimeRef.current = Date.now();
    
    // Update piece count
    setPlacedCountByPieceId(prev => ({
      ...prev,
      [piece.pieceId]: Math.max(0, (prev[piece.pieceId] || 0) - 1)
    }));
    
    // Track action
    trackAction('REMOVE_PIECE', {
      pieceId: piece.pieceId,
      uid: selectedUid
    });
    
    console.log('🗑️ Deleted piece:', selectedUid);
  }, [selectedUid, placed, trackAction]);
  
  // Check if two cells are FCC-adjacent
  const areFCCAdjacent = (cell1: IJK, cell2: IJK): boolean => {
    const di = Math.abs(cell1.i - cell2.i);
    const dj = Math.abs(cell1.j - cell2.j);
    const dk = Math.abs(cell1.k - cell2.k);
    
    const nonZero = [di, dj, dk].filter(d => d === 1).length;
    const hasTwo = [di, dj, dk].filter(d => d === 2).length;
    return (nonZero === 2 && hasTwo === 0) || (nonZero === 1 && hasTwo === 1);
  };

  // Normalize cells to origin
  const normalizeCells = (cells: IJK[]): IJK[] => {
    const minI = Math.min(...cells.map(c => c.i));
    const minJ = Math.min(...cells.map(c => c.j));
    const minK = Math.min(...cells.map(c => c.k));
    return cells.map(c => ({ i: c.i - minI, j: c.j - minJ, k: c.k - minK }));
  };

  // Check if two normalized cell sets match
  const cellsMatch = (cells1: IJK[], cells2: IJK[]): boolean => {
    if (cells1.length !== cells2.length) return false;
    const set1 = new Set(cells1.map(ijkToKey));
    const set2 = new Set(cells2.map(ijkToKey));
    return [...set1].every(key => set2.has(key));
  };

  // Handle drawing a cell
  const handleDrawCell = useCallback((cell: IJK) => {
    if (drawingCells.length === 0) {
      clearGhost();
    }
    
    // Check if cell already occupied
    const cellKey = ijkToKey(cell);
    for (const [_, piece] of placed) {
      if (piece.cells.some(c => ijkToKey(c) === cellKey)) {
        return;
      }
    }
    
    if (drawingCells.some(c => ijkToKey(c) === cellKey)) {
      return;
    }
    
    if (drawingCells.length > 0) {
      const isAdjacent = drawingCells.some(c => areFCCAdjacent(c, cell));
      if (!isAdjacent) {
        return;
      }
    }
    
    const newDrawing = [...drawingCells, cell];
    setDrawingCells(newDrawing);
    
    if (newDrawing.length === 4) {
      identifyAndPlacePiece(newDrawing);
    }
  }, [drawingCells, placed, clearGhost, pieces, placedCountByPieceId, mode, activePiece, isStarted, trackAction]);

  // Identify piece from drawn cells
  const identifyAndPlacePiece = async (drawnCells: IJK[]) => {
    const svc = new GoldOrientationService();
    try {
      await svc.load();
    } catch (err) {
      console.error('🎨 Failed to load orientations:', err);
      setDrawingCells([]);
      return;
    }
    
    let bestMatch: { pieceId: string; orientationId: string; cells: IJK[] } | null = null;
    
    for (const pieceId of pieces) {
      const orientations = svc.getOrientations(pieceId);
      if (!orientations || orientations.length === 0) continue;
      
      for (let oriIdx = 0; oriIdx < orientations.length; oriIdx++) {
        const ori = orientations[oriIdx];
        const normalizedDrawn = normalizeCells(drawnCells);
        const normalizedOri = normalizeCells(ori.ijkOffsets);
        
        if (cellsMatch(normalizedDrawn, normalizedOri)) {
          bestMatch = {
            pieceId,
            orientationId: ori.orientationId,
            cells: drawnCells
          };
          break;
        }
      }
      if (bestMatch) break;
    }
    
    if (!bestMatch) {
      setNotification('Shape not recognized - must be a valid Koos piece');
      setNotificationType('warning');
      setDrawingCells([]);
      return;
    }
    
    const currentCount = placedCountByPieceId[bestMatch.pieceId] ?? 0;
    if (mode === 'oneOfEach' && currentCount >= 1) {
      setNotification(`Piece "${bestMatch.pieceId}" is already placed in One-of-Each mode`);
      setNotificationType('warning');
      setDrawingCells([]);
      return;
    }
    if (mode === 'single' && bestMatch.pieceId !== activePiece) {
      setNotification(`Single Piece mode: Can only place "${activePiece}"`);
      setNotificationType('warning');
      setDrawingCells([]);
      return;
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
    
    setPlaced(prev => {
      const next = new Map(prev);
      next.set(uid, placedPiece);
      return next;
    });
    
    setUndoStack(prev => [...prev, { type: 'place', piece: placedPiece }]);
    setRedoStack([]);
    
    setPlacedCountByPieceId(prev => ({
      ...prev,
      [bestMatch!.pieceId]: (prev[bestMatch!.pieceId] ?? 0) + 1
    }));
    
    // Track action
    trackAction('PLACE_PIECE', {
      pieceId: bestMatch.pieceId,
      orientation: bestMatch.orientationId,
      ijkPosition: bestMatch.cells[0],
      cells: bestMatch.cells,
      uid: uid,
    });
    
    setSelectedUid(null);
    setNotification(`Piece ${bestMatch.pieceId} added!`);
    setNotificationType('success');
    setDrawingCells([]);
  };
  
  // Interaction handler (behavior table)
  const handleInteraction = useCallback((
    target: 'ghost' | 'cell' | 'piece' | 'background',
    type: 'single' | 'double' | 'long',
    data?: any
  ) => {
    console.log('🎯 Interaction:', target, type, data);

    if (target === 'ghost') {
      if (type === 'single') {
        // Cycle through fits
        if (anchor && fits.length > 0) {
          setFitIndex((prev) => (prev + 1) % fits.length);
        }
      } else if (type === 'double' || type === 'long') {
        // Place piece
        if (currentFit) {
          handleConfirmFit();
          setSelectedUid(null);
        }
      }
      return;
    }

    if (target === 'cell') {
      const clickedCell = data as IJK;
      
      if (type === 'single') {
        // Cancel drawing mode if single clicking
        if (drawingCells.length > 0) {
          setDrawingCells([]);
          return;
        }
        handleCellClick(clickedCell);
      } else if (type === 'double') {
        // Double-click enters drawing mode
        if (anchor) {
          clearGhost();
        }
        handleDrawCell(clickedCell);
      }
      return;
    }

    if (target === 'piece') {
      const uid = data as string;
      
      if (type === 'single') {
        if (anchor) {
          clearGhost();
          return;
        }
        setSelectedUid(uid === selectedUid ? null : uid);
      } else if (type === 'double' || type === 'long') {
        if (uid === selectedUid) {
          handleDeleteSelected();
        }
      }
      return;
    }

    if (target === 'background') {
      if (type === 'single') {
        clearGhost();
        setSelectedUid(null);
      }
      return;
    }
  }, [anchor, fits, currentFit, selectedUid, handleConfirmFit, handleCellClick, clearGhost, handleDeleteSelected, drawingCells, handleDrawCell]);
  
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    
    const action = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, action]);
    
    if (action.type === 'place') {
      setPlaced(prev => {
        const next = new Map(prev);
        next.delete(action.piece.uid);
        return next;
      });
      setPlacedCountByPieceId(prev => ({
        ...prev,
        [action.piece.pieceId]: Math.max(0, (prev[action.piece.pieceId] || 0) - 1)
      }));
    } else {
      setPlaced(prev => new Map(prev).set(action.piece.uid, action.piece));
      setPlacedCountByPieceId(prev => ({
        ...prev,
        [action.piece.pieceId]: (prev[action.piece.pieceId] || 0) + 1
      }));
    }
  }, [undoStack]);
  
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    
    const action = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, action]);
    
    if (action.type === 'place') {
      setPlaced(prev => new Map(prev).set(action.piece.uid, action.piece));
      setPlacedCountByPieceId(prev => ({
        ...prev,
        [action.piece.pieceId]: (prev[action.piece.pieceId] || 0) + 1
      }));
    } else {
      setPlaced(prev => {
        const next = new Map(prev);
        next.delete(action.piece.uid);
        return next;
      });
      setPlacedCountByPieceId(prev => ({
        ...prev,
        [action.piece.pieceId]: Math.max(0, (prev[action.piece.pieceId] || 0) - 1)
      }));
    }
  }, [redoStack]);
  
  const handleReset = useCallback(() => {
    if (!confirm('Reset puzzle? This will clear all placed pieces.')) return;
    
    setPlaced(new Map());
    setUndoStack([]);
    setRedoStack([]);
    setSelectedUid(null);
    setAnchor(null);
    setMoveCount(0);
    setSolveStartTime(null);
    setSolveEndTime(null);
    setIsStarted(false);
    setIsComplete(false);
    setPlacedCountByPieceId({});
    clearHistory();
    
    console.log('🔄 Puzzle reset');
  }, [clearHistory]);
  
  const handleSaveSolution = useCallback(async () => {
    if (!puzzle || placed.size === 0) return;
    
    setIsSaving(true);
    
    try {
      const solutionGeometry = Array.from(placed.values()).flatMap(p => p.cells);
      const placedPieces = Array.from(placed.values()).map(p => ({
        uid: p.uid,
        pieceId: p.pieceId,
        orientationId: p.orientationId,
        anchorSphereIndex: p.anchorSphereIndex,
        cells: p.cells,
        placedAt: p.placedAt
      }));
      
      // Use captured end time if available, otherwise use current time
      const solveTime = (solveStartTime && solveEndTime) 
        ? solveEndTime - solveStartTime 
        : solveStartTime ? Date.now() - solveStartTime : null;
      
      const { data, error } = await supabase
        .from('solutions')
        .insert({
          puzzle_id: puzzle.id,
          solver_name: 'Anonymous',
          solution_type: 'manual',
          final_geometry: solutionGeometry,
          placed_pieces: placedPieces,
          actions: solveActions,
          solve_time_ms: solveTime,
          move_count: moveCount,
          notes: 'Manual solution'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setCurrentSolutionId(data.id);
      setNotification('✅ Solution saved!');
      setNotificationType('success');
      setTimeout(() => setNotification(null), 3000);
      
      console.log('✅ Solution saved:', data.id);
    } catch (err) {
      console.error('❌ Failed to save solution:', err);
      setNotification('❌ Failed to save solution');
      setNotificationType('error');
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setIsSaving(false);
      setShowSaveModal(false);
    }
  }, [puzzle, placed, solveActions, solveStartTime, moveCount]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showViewPieces || showInfo) return;
      
      if (e.key === 'Escape') {
        setAnchor(null);
        setSelectedUid(null);
        e.preventDefault();
      }
      
      if (e.key === 'Enter' || e.key === ' ') {
        if (currentFit) {
          handleConfirmFit();
          e.preventDefault();
        }
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedUid) {
          handleDeleteSelected();
          e.preventDefault();
        }
      }
      
      if (e.key === 'Tab') {
        if (fits.length > 0) {
          setFitIndex(prev => (prev + 1) % fits.length);
          e.preventDefault();
        }
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        handleUndo();
        e.preventDefault();
      }
      
      if (((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) || 
          (e.ctrlKey && e.key === 'y')) {
        handleRedo();
        e.preventDefault();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showViewPieces, showInfo, currentFit, selectedUid, fits.length, handleConfirmFit, handleDeleteSelected, handleUndo, handleRedo]);
  
  // Check if solution is complete and auto-save it
  useEffect(() => {
    if (!puzzle || placed.size === 0) {
      if (isComplete) setIsComplete(false);
      hasSavedRef.current = false;
      hasSetCompleteRef.current = false;
      return;
    }
    
    // Get all placed cells
    const placedCells = Array.from(placed.values()).flatMap(piece => piece.cells);
    
    // Check if we have the same number of cells as the target
    const complete = placedCells.length === cells.length;
    
    // Only update completion state once
    if (complete && !hasSetCompleteRef.current) {
      hasSetCompleteRef.current = true;
      console.log('🎯 Solution completion status changed: true');
      
      // Capture end time when solution becomes complete
      if (!solveEndTime) {
        const endTime = Date.now();
        console.log('⏱️ Timer stopped at:', endTime);
        setSolveEndTime(endTime);
      }
      
      setIsComplete(true);
    }
    
    // Auto-save logic (only runs once using ref)
    if (complete && !hasSavedRef.current) {
      hasSavedRef.current = true;
      console.log('🎉 Solution complete! Placed all', placedCells.length, 'cells');
      console.log('💾 Auto-saving manual solution...');
      
      // Auto-save the solution to database
      const saveSolution = async () => {
        try {
          const solutionGeometry = Array.from(placed.values()).flatMap(piece => piece.cells);
          const placedPieces = Array.from(placed.values()).map(piece => ({
            uid: piece.uid,
            pieceId: piece.pieceId,
            orientationId: piece.orientationId,
            anchorSphereIndex: piece.anchorSphereIndex,
            cells: piece.cells,
            placedAt: piece.placedAt
          }));
          
          const solveTime = (solveStartTime && solveEndTime) 
            ? solveEndTime - solveStartTime 
            : null;
          
          const { data: solutionData, error: solutionError } = await supabase
            .from('solutions')
            .insert({
              puzzle_id: puzzle.id,
              solver_name: 'Anonymous',
              solution_type: 'manual',
              final_geometry: solutionGeometry,
              placed_pieces: placedPieces,
              actions: solveActions,
              solve_time_ms: solveTime,
              move_count: moveCount,
              notes: 'Manual solution'
            })
            .select()
            .single();
          
          if (solutionError) {
            console.error('❌ Failed to save solution:', solutionError);
            return;
          }
          
          setCurrentSolutionId(solutionData.id);
          console.log('✅ Solution saved with ID:', solutionData.id);
          
          // Show success modal
          setShowSuccessModal(true);
        } catch (error) {
          console.error('❌ Error saving solution:', error);
        }
      };
      
      saveSolution();
    }
  }, [placed, cells, puzzle, isComplete, solveActions, solveStartTime, moveCount]);
  
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
      {/* Header */}
      <div className="header" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '64px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.95) 100%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(10px)',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        padding: '0 12px',
        gap: '8px',
        zIndex: 1000
      }}>
        {/* Left: Empty spacer for now */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }} />

        {/* Center: Manual Mode Controls */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
          {/* Piece Selector Button */}
          <button
            className="pill pill--ghost"
            onClick={() => setShowViewPieces(true)}
            title="Select piece to place"
            style={{ 
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            📦 Piece: {activePiece} 
            <span style={{ opacity: 0.7, marginLeft: '8px', fontSize: '0.9em' }}>
              ({mode === 'oneOfEach' ? `${placedCountByPieceId[activePiece] || 0}/1` : `${placedCountByPieceId[activePiece] || 0} placed`})
            </span>
          </button>

          {/* Mode Toggle Button */}
          <button
            className="pill pill--ghost"
            onClick={() => {
              const modes: Mode[] = ['oneOfEach', 'unlimited', 'single'];
              const currentIndex = modes.indexOf(mode);
              const nextMode = modes[(currentIndex + 1) % modes.length];
              setMode(nextMode);
            }}
            title="Toggle piece placement mode"
            style={{ 
              background: 'rgba(255,255,255,0.1)',
              color: '#fff'
            }}
          >
            🎲 {mode === 'oneOfEach' ? 'One Each' : mode === 'unlimited' ? 'Unlimited' : 'Single'}
          </button>

          {/* Hide Placed Button */}
          <button
            className="pill pill--ghost"
            onClick={() => setHidePlacedPieces(!hidePlacedPieces)}
            title="Toggle placed pieces visibility"
            style={{ 
              background: 'rgba(255,255,255,0.1)',
              color: '#fff'
            }}
          >
            {hidePlacedPieces ? '👁️ Show' : '🙈 Hide'} Placed
          </button>
        </div>

        {/* Right: Settings, Info, Auto-Solve & Gallery */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          alignItems: 'center',
          justifyContent: 'flex-end'
        }}>
          {/* Info Button */}
          <button
            className="pill"
            onClick={() => setShowInfoModal(true)}
            title="Info"
            style={{
              background: 'rgba(255, 255, 255, 0.18)',
              color: '#fff',
              fontWeight: 700,
              border: '1px solid rgba(255, 255, 255, 0.3)',
              fontSize: '16px',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            ℹ
          </button>
          
          {/* Settings Button */}
          <button
            className="pill"
            onClick={() => setShowEnvSettings(true)}
            title="Settings"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              fontWeight: 700,
              border: 'none',
              fontSize: '16px',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            ⚙
          </button>
          
          {/* Auto-Solve Button */}
          <button
            className="pill"
            onClick={() => navigate(`/auto/${puzzle?.id}`)}
            title="Auto-Solve"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff',
              fontWeight: 700,
              border: 'none',
              fontSize: '16px',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            🤖
          </button>
          
          {/* Gallery Button */}
          <button
            className="pill"
            onClick={() => navigate('/gallery')}
            title="Gallery"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              fontWeight: 700,
              border: 'none',
              fontSize: '16px',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            ⊞
          </button>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="page-content" style={{ marginTop: '64px' }}>
        {loaded && view ? (
          <SceneCanvas
            cells={cells}
            view={view}
            visibility={visibility}
            editMode={false}
            mode="add"
            settings={envSettings}
            onCellsChange={() => {}}
            onHoverCell={() => {}}
            onClickCell={handleCellClick}
            anchor={anchor}
            previewOffsets={currentFit?.cells ?? null}
            placedPieces={Array.from(placed.values())}
            selectedPieceUid={selectedUid}
            onSelectPiece={setSelectedUid}
            containerOpacity={envSettings.emptyCells?.linkToEnvironment ? envSettings.material.opacity : (envSettings.emptyCells?.customMaterial?.opacity ?? 0.45)}
            containerColor={envSettings.emptyCells?.linkToEnvironment ? envSettings.material.color : (envSettings.emptyCells?.customMaterial?.color ?? "#ffffff")}
            containerRoughness={envSettings.emptyCells?.linkToEnvironment ? envSettings.material.roughness : (envSettings.emptyCells?.customMaterial?.roughness ?? 0.35)}
            puzzleMode={mode}
            onCycleOrientation={undefined}
            onPlacePiece={undefined}
            onDeleteSelectedPiece={handleDeleteSelected}
            drawingCells={drawingCells}
            onDrawCell={undefined}
            hidePlacedPieces={hidePlacedPieces}
            explosionFactor={explosionFactor}
            turntableRotation={0}
            onInteraction={handleInteraction}
            onSceneReady={() => {}}
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
      <footer className="page-footer">
        <div className="footer-section">
          <label>Active Piece:</label>
          <select 
            value={activePiece} 
            onChange={(e) => setActivePiece(e.target.value)}
            className="select"
            style={{ fontSize: '16px', padding: '8px 12px', minWidth: '80px' }}
          >
            {pieces.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>
            {mode === 'oneOfEach' 
              ? `(${placedCountByPieceId[activePiece] || 0}/1)` 
              : mode === 'single'
              ? '(Single Only)'
              : `(${placedCountByPieceId[activePiece] || 0} placed)`
            }
          </span>
        </div>
        
        <div className="footer-section">
          <label>
            Reveal: {revealK}/{revealMax}
            <input 
              type="range" 
              min="0" 
              max={revealMax} 
              value={revealK}
              onChange={(e) => setRevealK(Number(e.target.value))}
              style={{ width: '150px', marginLeft: '8px' }}
            />
          </label>
          <label>
            Explode: {explosionFactor.toFixed(2)}
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01"
              value={explosionFactor}
              onChange={(e) => setExplosionFactor(Number(e.target.value))}
              style={{ width: '150px', marginLeft: '8px' }}
            />
          </label>
        </div>
        
        <div className="footer-section">
          <button onClick={handleReset} className="btn btn-warning">
            Reset
          </button>
        </div>
      </footer>
      
      {/* Piece Browser Modal - 3D Carousel */}
      <PieceBrowserModal
        isOpen={showViewPieces}
        pieces={pieces}
        activePiece={activePiece}
        settings={envSettings}
        onSelectPiece={(pieceId) => setActivePiece(pieceId)}
        onClose={() => setShowViewPieces(false)}
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

      {/* Info Modal */}
      <InfoModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        title="About Manual Solve"
      >
        <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#4b5563' }}>
          <p><strong>Manual Mode:</strong> Solve puzzles piece by piece with intuitive controls.</p>
          <p style={{ marginTop: '0.5rem' }}><strong>Controls:</strong></p>
          <ul style={{ marginTop: '0.25rem', paddingLeft: '1.5rem' }}>
            <li>Click empty cell to place piece</li>
            <li>Click ghost to cycle orientations</li>
            <li>Double-click ghost or press Enter to confirm</li>
            <li>Click piece to select, double-click to delete</li>
            <li>Press Escape to clear selection</li>
          </ul>
          <p style={{ marginTop: '1rem', padding: '0.75rem', background: '#f3f4f6', borderRadius: '6px' }}>
            💡 <strong>Tip:</strong> Use the gear icon (⚙️) to adjust environment settings like lighting and materials.
          </p>
        </div>
      </InfoModal>
      
      {/* Success Modal - matches SolvePage style */}
      {showSuccessModal && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'linear-gradient(135deg, #1e88e5, #42a5f5)',
          color: 'white',
          padding: '32px 40px',
          borderRadius: '16px',
          fontSize: '20px',
          fontWeight: 'bold',
          textAlign: 'center',
          boxShadow: '0 12px 40px rgba(30, 136, 229, 0.5)',
          zIndex: 1001,
          maxWidth: '400px',
          minWidth: '320px'
        }}>
          {/* Close button */}
          <button
            onClick={() => setShowSuccessModal(false)}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'transparent',
              border: 'none',
              color: 'white',
              fontSize: '28px',
              cursor: 'pointer',
              padding: '4px 8px',
              lineHeight: '1',
              opacity: 0.8,
              fontWeight: 'normal'
            }}
            title="Close"
          >
            ×
          </button>
          
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
          <div style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px', color: '#ffffff' }}>
            Congratulations!
          </div>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', opacity: 0.95 }}>
            Puzzle Solved!
          </div>
          
          <div style={{ 
            fontSize: '15px', 
            fontWeight: 'normal', 
            lineHeight: '1.8', 
            textAlign: 'left',
            background: 'rgba(0,0,0,0.2)',
            padding: '20px',
            borderRadius: '12px',
            marginBottom: '20px',
            color: '#ffffff'
          }}>
            <div style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 600 }}>
              ✨ Puzzle Complete!
            </div>
            <div><strong>📅 Date:</strong> {new Date().toLocaleDateString()}</div>
            <div><strong>⏱️ Solve Time:</strong> {(solveStartTime && solveEndTime) ? `${Math.floor((solveEndTime - solveStartTime) / 1000)}s` : 'N/A'}</div>
            <div><strong>🔢 Moves:</strong> {moveCount}</div>
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.3)' }}>
              <strong>🧩 Pieces:</strong> {placed.size}
            </div>
          </div>
          
          <div style={{ 
            fontSize: '14px', 
            fontWeight: 'normal',
            opacity: 0.9,
            marginBottom: '16px',
            padding: '12px',
            background: 'rgba(0,0,0,0.15)',
            borderRadius: '8px'
          }}>
            ✅ Your solution has been automatically saved!
          </div>
          
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <button
              onClick={() => {
                setShowSuccessModal(false);
                setShowMovieTypeModal(true);
              }}
              style={{
                flex: 1,
                padding: '14px 24px',
                background: 'rgba(139, 69, 255, 0.3)',
                border: '2px solid rgba(139, 69, 255, 0.8)',
                color: 'white',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(139, 69, 255, 0.4)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(139, 69, 255, 0.3)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              🎬 Make a Movie
            </button>
            <button
              onClick={() => setShowSuccessModal(false)}
              style={{
                flex: 1,
                padding: '14px 24px',
                background: 'rgba(255,255,255,0.25)',
                border: '2px solid rgba(255,255,255,0.8)',
                color: 'white',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.35)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.25)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}
      
      {/* Save Modal */}
      {showSaveModal && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 1000
        }}>
          <h2>Save Solution</h2>
          <p>Save your solution to the database?</p>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
            <button onClick={() => setShowSaveModal(false)} className="btn">
              Cancel
            </button>
            <button 
              onClick={handleSaveSolution}
              disabled={isSaving}
              className="btn btn-primary"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
      
      {/* Movie Type Selection Modal */}
      {showMovieTypeModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 1002,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            padding: '32px 40px',
            borderRadius: '16px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 12px 40px rgba(102, 126, 234, 0.5)',
            position: 'relative'
          }}>
            {/* Close button */}
            <button
              onClick={() => setShowMovieTypeModal(false)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '28px',
                cursor: 'pointer',
                padding: '4px 8px',
                lineHeight: '1',
                opacity: 0.8,
                fontWeight: 'normal'
              }}
              title="Close"
            >
              ×
            </button>
            
            <div style={{ fontSize: '48px', marginBottom: '16px', textAlign: 'center' }}>🎬</div>
            <h2 style={{ 
              fontSize: '28px', 
              fontWeight: 700, 
              marginBottom: '8px', 
              textAlign: 'center',
              color: '#ffffff' 
            }}>
              Make a Movie
            </h2>
            <p style={{ 
              fontSize: '16px', 
              fontWeight: 400, 
              marginBottom: '24px', 
              textAlign: 'center',
              opacity: 0.9 
            }}>
              Select your movie type
            </p>
            
            {/* Movie type buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={() => handleMovieTypeSelect('turntable')}
                style={{
                  padding: '16px 24px',
                  background: 'rgba(255,255,255,0.2)',
                  border: '2px solid rgba(255,255,255,0.4)',
                  color: 'white',
                  borderRadius: '10px',
                  fontSize: '18px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'translateX(4px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <span style={{ fontSize: '24px' }}>🔄</span>
                <span>Turntable</span>
              </button>
              
              <button
                onClick={() => handleMovieTypeSelect('reveal')}
                style={{
                  padding: '16px 24px',
                  background: 'rgba(255,255,255,0.2)',
                  border: '2px solid rgba(255,255,255,0.4)',
                  color: 'white',
                  borderRadius: '10px',
                  fontSize: '18px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'translateX(4px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <span style={{ fontSize: '24px' }}>✨</span>
                <span>Reveal</span>
              </button>
              
              <button
                onClick={() => handleMovieTypeSelect('gravity')}
                style={{
                  padding: '16px 24px',
                  background: 'rgba(255,255,255,0.2)',
                  border: '2px solid rgba(255,255,255,0.4)',
                  color: 'white',
                  borderRadius: '10px',
                  fontSize: '18px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'translateX(4px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <span style={{ fontSize: '24px' }}>🌍</span>
                <span>Gravity</span>
              </button>
            </div>
          </div>
        </div>
      )}
      
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
