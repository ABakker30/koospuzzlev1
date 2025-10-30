// Solve Page - Clean implementation with core solving logic from ManualPuzzlePage
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { IJK } from '../../types/shape';
import type { VisibilitySettings } from '../../types/lattice';
import { ijkToXyz } from '../../lib/ijk';
import SceneCanvas from '../../components/SceneCanvas';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { InfoModal } from '../../components/InfoModal';
import { ViewPiecesModal } from '../ManualPuzzle/ViewPiecesModal';
import { GoldOrientationService, GoldOrientationController } from '../../services/GoldOrientationService';
import { computeFits, ijkToKey, type FitPlacement } from '../../services/FitFinder';
import { supabase } from '../../lib/supabase';
import { usePuzzleLoader } from './hooks/usePuzzleLoader';
import { SolveStats } from './components/SolveStats';
import SaveSolutionModal from './components/SaveSolutionModal';
import '../../styles/shape.css';

// Auto-solve Engine 2
import { engine2Solve, engine2Precompute, type Engine2RunHandle, type Engine2Settings } from '../../engines/engine2';
import type { PieceDB } from '../../engines/dfs2';
import type { StatusV2 } from '../../engines/types';
import { loadAllPieces } from '../../engines/piecesLoader';
import { EngineSettingsModal } from '../../components/EngineSettingsModal';

// Environment settings
import { SettingsModal } from '../../components/SettingsModal';
import { StudioSettings, DEFAULT_STUDIO_SETTINGS } from '../../types/studio';
import { StudioSettingsService } from '../../services/StudioSettingsService';

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

export const SolvePage: React.FC = () => {
  const navigate = useNavigate();
  const { id: puzzleId } = useParams<{ id: string }>();
  const { puzzle, loading, error } = usePuzzleLoader(puzzleId);
  const orientationController = useRef<GoldOrientationController | null>(null);
  
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
  const [mode, setMode] = useState<Mode>('oneOfEach'); // Use oneOfEach for stable colors by pieceId
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
  const [lastViewedPiece, setLastViewedPiece] = useState<string>('K');
  
  // Reveal slider state (for visualization)
  const [revealK, setRevealK] = useState<number>(0);
  const [revealMax, setRevealMax] = useState<number>(0);
  
  // Explosion slider state (for visualization)
  const [explosionFactor, setExplosionFactor] = useState<number>(0); // 0 = assembled, 1 = exploded
  
  // Save modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);
  
  // Auto-solve state
  const [showAutoSolve, setShowAutoSolve] = useState(false);
  const [showEngineSettings, setShowEngineSettings] = useState(false);
  const [piecesDb, setPiecesDb] = useState<PieceDB | null>(null);
  const [isAutoSolving, setIsAutoSolving] = useState(false);
  const [autoSolveStatus, setAutoSolveStatus] = useState<StatusV2 | null>(null);
  const [autoSolution, setAutoSolution] = useState<PlacedPiece[] | null>(null);
  const engineHandleRef = useRef<Engine2RunHandle | null>(null);
  
  // Engine 2 settings (simple defaults for SolvePage)
  const [engineSettings, setEngineSettings] = useState<Engine2Settings>({
    maxSolutions: 1,
    timeoutMs: 60000,
    moveOrdering: "mostConstrainedCell",
    pruning: { connectivity: true, multipleOf4: true, colorResidue: true, neighborTouch: true },
    statusIntervalMs: 500,
    seed: Date.now() % 100000,
    randomizeTies: true,
  });
  
  // Environment settings (3D scene: lighting, materials, etc.)
  const settingsService = useRef(new StudioSettingsService());
  const [envSettings, setEnvSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
  const [showEnvSettings, setShowEnvSettings] = useState(false);
  
  // State for auto-solve intermediate pieces
  const [autoSolveIntermediatePieces, setAutoSolveIntermediatePieces] = useState<PlacedPiece[]>([]);
  
  // Progress indicator position (draggable)
  const [progressPosition, setProgressPosition] = useState({ x: 20, y: 80 });
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  
  // Load environment settings on mount
  useEffect(() => {
    try {
      const loaded = settingsService.current.loadSettings();
      setEnvSettings(loaded);
      console.log('✅ Environment settings loaded from localStorage:', {
        brightness: loaded.lights?.brightness,
        hdrEnabled: loaded.lights?.hdr?.enabled,
        hdrEnv: loaded.lights?.hdr?.envId,
        metalness: loaded.material?.metalness,
        roughness: loaded.material?.roughness
      });
    } catch (error) {
      console.warn('Failed to load environment settings, using defaults:', error);
    }
  }, []);
  
  // Shared orientation service ref for auto-solve
  const autoSolveOrientationService = useRef<GoldOrientationService | null>(null);
  
  // Load orientation service for auto-solve once
  useEffect(() => {
    if (!autoSolveOrientationService.current) {
      (async () => {
        try {
          const svc = new GoldOrientationService();
          await svc.load();
          autoSolveOrientationService.current = svc;
          console.log('✅ Auto-solve orientation service loaded');
        } catch (error) {
          console.error('Failed to load auto-solve orientation service:', error);
        }
      })();
    }
  }, []);
  
  // Update intermediate pieces when auto-solve status changes
  useEffect(() => {
    if (!isAutoSolving || !autoSolveStatus?.stack) {
      setAutoSolveIntermediatePieces([]);
      return;
    }
    
    // Use pre-loaded service
    const svc = autoSolveOrientationService.current;
    if (!svc) {
      console.warn('⚠️ Orientation service not ready for stack conversion');
      return;
    }
    
    try {
      const pieces: PlacedPiece[] = [];
      for (const p of autoSolveStatus.stack!) {
        const orientations = svc.getOrientations(p.pieceId);
        if (!orientations || p.ori >= orientations.length) {
          console.warn(`⚠️ Missing orientations for ${p.pieceId} ori ${p.ori}`);
          continue;
        }
        
        const orientation = orientations[p.ori];
        const anchor: IJK = { i: p.t[0], j: p.t[1], k: p.t[2] };
        
        const cells: IJK[] = orientation.ijkOffsets.map((offset: IJK) => ({
          i: anchor.i + offset.i,
          j: anchor.j + offset.j,
          k: anchor.k + offset.k
        }));
        
        pieces.push({
          pieceId: p.pieceId,
          orientationId: orientation.orientationId,
          anchorSphereIndex: 0,
          cells,
          uid: `solving-${p.pieceId}-${pieces.length}`,
          placedAt: Date.now() + pieces.length
        });
      }
      
      console.log(`🎨 Converted ${pieces.length} pieces from auto-solve stack (${autoSolveStatus.stack!.length} stack entries)`);
      if (pieces.length > 0) {
        console.log('First piece:', pieces[0]);
      }
      setAutoSolveIntermediatePieces(pieces);
    } catch (error) {
      console.error('Failed to convert stack to pieces:', error);
      console.error('Stack:', autoSolveStatus.stack);
    }
  }, [isAutoSolving, autoSolveStatus]);
  
  // Derived: filter placed pieces based on reveal slider and auto-solve mode
  const visiblePlacedPieces = React.useMemo(() => {
    // If auto-solving, show intermediate pieces from current stack
    if (isAutoSolving && autoSolveIntermediatePieces.length > 0) {
      console.log(`🔍 Showing ${autoSolveIntermediatePieces.length} intermediate pieces from auto-solver`);
      return autoSolveIntermediatePieces;
    }
    
    // If showing auto-solve and we have a solution, use that
    if (showAutoSolve && autoSolution) {
      // Apply reveal slider to auto solution too
      if (revealMax > 0) {
        const sorted = [...autoSolution].sort((a, b) => a.placedAt - b.placedAt);
        return sorted.slice(0, revealK);
      }
      return autoSolution;
    }
    
    // Otherwise show manual solution
    if (!isComplete || revealMax === 0) {
      // Not complete or no reveal - show all placed pieces
      return Array.from(placed.values());
    }
    
    // When complete, use reveal slider
    const sorted = Array.from(placed.values()).sort((a, b) => a.placedAt - b.placedAt);
    return sorted.slice(0, revealK);
  }, [placed, isComplete, revealK, revealMax, showAutoSolve, autoSolution, isAutoSolving, autoSolveIntermediatePieces]);
  
  // Fixed visibility settings
  const visibility: VisibilitySettings = {
    xray: false,
    emptyOnly: false,
    sliceY: { center: 0.5, thickness: 1.0 }
  };
  
  // UI state
  const [showInfoModal, setShowInfoModal] = useState(false);
  
  // Refs
  const cellsRef = useRef<IJK[]>(cells);
  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  // Load puzzle when data arrives
  useEffect(() => {
    if (!puzzle) return;
    
    console.log('📥 Loading puzzle for solving:', puzzle.name);
    console.log('📊 Puzzle geometry:', puzzle.geometry.length, 'spheres');
    
    // Reset camera flag so SceneCanvas will fit camera to new puzzle
    if ((window as any).resetCameraFlag) {
      (window as any).resetCameraFlag();
      console.log('📷 SolvePage: Camera reset flag called for initial puzzle load');
    }
    
    // Set cells from puzzle geometry
    const newCells = puzzle.geometry;
    setCells(newCells);
    
    // Compute view transforms for orientation
    const T_ijk_to_xyz = [
      [0.5, 0.5, 0, 0],
      [0.5, 0, 0.5, 0],
      [0, 0.5, 0.5, 0],
      [0, 0, 0, 1]
    ];
    
    try {
      const v = computeViewTransforms(newCells, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
      setView(v);
      console.log('✅ View transforms computed');
      
      // Set OrbitControls target
      setTimeout(() => {
        if ((window as any).setOrbitTarget && v) {
          const M = v.M_world;
          let minX = Infinity, maxX = -Infinity;
          let minY = Infinity, maxY = -Infinity;
          let minZ = Infinity, maxZ = -Infinity;
          
          for (const cell of newCells) {
            const x = M[0][0] * cell.i + M[0][1] * cell.j + M[0][2] * cell.k + M[0][3];
            const y = M[1][0] * cell.i + M[1][1] * cell.j + M[1][2] * cell.k + M[1][3];
            const z = M[2][0] * cell.i + M[2][1] * cell.j + M[2][2] * cell.k + M[2][3];
            
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
          }
          
          const center = {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2,
            z: (minZ + maxZ) / 2
          };
          
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
    (async () => {
      try {
        console.log('🔄 Loading orientation service...');
        const svc = new GoldOrientationService();
        await svc.load();
        
        const controller = new GoldOrientationController(svc);
        await controller.init(activePiece);

        orientationController.current = controller;
        const pieceList = svc.getPieces();
        setPieces(pieceList);
        console.log('✅ Orientation service loaded, pieces:', pieceList.length);
      } catch (error) {
        console.error('❌ Failed to load orientation service:', error);
      }
    })();
  }, []);

  // Load pieces database for auto-solve
  useEffect(() => {
    (async () => {
      try {
        console.log('📦 Loading pieces database for auto-solve...');
        const db = await loadAllPieces();
        setPiecesDb(db);
        console.log('✅ Pieces database loaded:', db.size, 'pieces');
      } catch (error) {
        console.error('❌ Failed to load pieces database:', error);
      }
    })();
  }, []);

  // Check completion
  useEffect(() => {
    if (cells.length === 0) {
      setIsComplete(false);
      return;
    }
    
    const occupiedCells = new Set<string>();
    for (const piece of placed.values()) {
      for (const cell of piece.cells) {
        occupiedCells.add(`${cell.i},${cell.j},${cell.k}`);
      }
    }
    
    const complete = occupiedCells.size === cells.length;
    
    if (complete && !isComplete) {
      console.log(`🎉 Puzzle Complete! All ${cells.length} cells occupied.`);
      setIsComplete(true);
      setShowCompletionCelebration(true); // Show celebration
      
      // Set up reveal slider
      setRevealMax(placed.size);
      setRevealK(placed.size); // Show all by default
    } else if (!complete && isComplete) {
      setIsComplete(false);
      setShowCompletionCelebration(false);
      setRevealMax(0);
      setRevealK(0);
    }
  }, [placed, cells, isComplete]);

  // Helper: Delete a piece
  const deletePiece = (uid: string) => {
    const piece = placed.get(uid);
    if (!piece) return;
    
    setPlaced(prev => {
      const next = new Map(prev);
      next.delete(uid);
      return next;
    });
    setPlacedCountByPieceId(prev => ({
      ...prev,
      [piece.pieceId]: Math.max(0, (prev[piece.pieceId] || 0) - 1)
    }));
    setSelectedUid(null);
  };

  // Helper: Clear ghost piece
  const clearGhost = () => {
    setAnchor(null);
    setFits([]);
    setFitIndex(0);
  };

  // Show brief notification
  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 2000);
  };

  // Check if two cells are FCC-adjacent
  const areFCCAdjacent = (cell1: IJK, cell2: IJK): boolean => {
    const di = Math.abs(cell1.i - cell2.i);
    const dj = Math.abs(cell1.j - cell2.j);
    const dk = Math.abs(cell1.k - cell2.k);
    
    const diffs = [di, dj, dk].filter(d => d === 1);
    const totalDiff = di + dj + dk;
    
    return (diffs.length === 1 || diffs.length === 2) && totalDiff === diffs.length;
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
    for (const key of set1) {
      if (!set2.has(key)) return false;
    }
    return true;
  };

  // Confirm fit (place piece) - WITH TIMER
  const handleConfirmFit = () => {
    if (!currentFit) return;
    
    const currentCount = placedCountByPieceId[currentFit.pieceId] ?? 0;
    
    if (mode === 'oneOfEach' && currentCount >= 1) {
      alert(`One-of-Each mode: "${currentFit.pieceId}" is already placed.`);
      return;
    }
    
    if (mode === 'single' && currentFit.pieceId !== activePiece) {
      alert(`Single Piece mode: Can only place "${activePiece}"`);
      return;
    }
    
    // START TIMER on first placement
    if (!isStarted) {
      setSolveStartTime(Date.now());
      setIsStarted(true);
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
    
    console.log('✅ Piece placed:', { uid, pieceId: currentFit.pieceId, moveCount: moveCount + 1 });
    
    clearGhost();
  };

  // Handle cell click
  const handleCellClick = (clickedCell: IJK, isDrawAction = false) => {
    if (isDrawAction && drawingCells.length < 4) {
      handleDrawCell(clickedCell);
      return;
    }
    
    if (drawingCells.length > 0 && !isDrawAction) {
      setDrawingCells([]);
      return;
    }
    
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
      clearGhost();
      return;
    }
    
    const orientations = controller.getOrientations();
    if (orientations.length === 0) {
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
    
    setFits(validFits);
    setFitIndex(0);
  };

  // Handle drawing a cell
  const handleDrawCell = (cell: IJK) => {
    if (drawingCells.length === 0) {
      clearGhost();
    }
    
    const cellKey = ijkToKey(cell);
    const occupiedSet = new Set<string>();
    for (const piece of placed.values()) {
      for (const c of piece.cells) {
        occupiedSet.add(ijkToKey(c));
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
  };

  // Identify piece from drawn cells - WITH TIMER
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
      setDrawingCells([]);
      return;
    }
    
    const currentCount = placedCountByPieceId[bestMatch.pieceId] ?? 0;
    if (mode === 'oneOfEach' && currentCount >= 1) {
      alert(`One-of-Each mode: "${bestMatch.pieceId}" is already placed.`);
      setDrawingCells([]);
      return;
    }
    if (mode === 'single' && bestMatch.pieceId !== activePiece) {
      alert(`Single Piece mode: Can only place "${activePiece}"`);
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
    
    setSelectedUid(null);
    showNotification(`Piece ${bestMatch.pieceId} added!`);
    setDrawingCells([]);
  };

  // Delete selected piece
  const handleDeleteSelected = () => {
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
    
    const newCount = Math.max(0, (placedCountByPieceId[piece.pieceId] ?? 0) - 1);
    setPlacedCountByPieceId(prev => ({
      ...prev,
      [piece.pieceId]: newCount
    }));
    
    console.log('🗑️ Piece deleted:', selectedUid);
    setSelectedUid(null);
  };

  // Undo
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    
    const action = undoStack[undoStack.length - 1];
    
    if (action.type === 'delete') {
      const currentCount = placedCountByPieceId[action.piece.pieceId] ?? 0;
      if (mode === 'oneOfEach' && currentCount >= 1) {
        alert(`One-of-Each mode: Cannot undo delete - "${action.piece.pieceId}" is already placed.`);
        return;
      }
    }
    
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
        [action.piece.pieceId]: Math.max(0, (prev[action.piece.pieceId] ?? 0) - 1)
      }));
      console.log('↶ Undo place:', action.piece.uid);
    } else {
      setPlaced(prev => {
        const next = new Map(prev);
        next.set(action.piece.uid, action.piece);
        return next;
      });
      setPlacedCountByPieceId(prev => ({
        ...prev,
        [action.piece.pieceId]: (prev[action.piece.pieceId] ?? 0) + 1
      }));
      console.log('↶ Undo delete:', action.piece.uid);
    }
  };

  // Redo
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    
    const action = redoStack[redoStack.length - 1];
    
    if (action.type === 'place') {
      const currentCount = placedCountByPieceId[action.piece.pieceId] ?? 0;
      if (mode === 'oneOfEach' && currentCount >= 1) {
        alert(`One-of-Each mode: Cannot redo place - "${action.piece.pieceId}" is already placed.`);
        return;
      }
    }
    
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, action]);
    
    if (action.type === 'place') {
      setPlaced(prev => {
        const next = new Map(prev);
        next.set(action.piece.uid, action.piece);
        return next;
      });
      setPlacedCountByPieceId(prev => ({
        ...prev,
        [action.piece.pieceId]: (prev[action.piece.pieceId] ?? 0) + 1
      }));
      console.log('↷ Redo place:', action.piece.uid);
    } else {
      setPlaced(prev => {
        const next = new Map(prev);
        next.delete(action.piece.uid);
        return next;
      });
      setPlacedCountByPieceId(prev => ({
        ...prev,
        [action.piece.pieceId]: Math.max(0, (prev[action.piece.pieceId] ?? 0) - 1)
      }));
      console.log('↷ Redo delete:', action.piece.uid);
    }
  };

  // Interaction handler (behavior table)
  const handleInteraction = (
    target: 'ghost' | 'cell' | 'piece' | 'background',
    type: 'single' | 'double' | 'long',
    data?: any
  ) => {
    console.log('🎯 Interaction:', target, type, data);

    if (target === 'ghost') {
      if (type === 'single') {
        if (anchor && fits.length > 0) {
          setFitIndex((prev) => (prev + 1) % fits.length);
        }
      } else if (type === 'double' || type === 'long') {
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
        handleCellClick(clickedCell);
      } else if (type === 'double') {
        if (anchor) {
          clearGhost();
        }
        handleCellClick(clickedCell, true);
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
          deletePiece(uid);
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
  };

  // Save solution to Supabase
  const handleSaveSolution = async (metadata: { solverName: string; notes?: string }) => {
    if (!isComplete || placed.size === 0 || !puzzle) {
      console.error('❌ Cannot save: missing required data');
      return;
    }
    
    setIsSaving(true);
    
    try {
      console.log('💾 Saving solution...');
      
      const solutionGeometry = Array.from(placed.values()).flatMap(piece => piece.cells);
      const solveTimeMs = solveStartTime ? Date.now() - solveStartTime : null;
      
      const { data, error } = await supabase
        .from('solutions')
        .insert({
          puzzle_id: puzzle.id,
          solver_name: metadata.solverName,
          solution_type: 'manual',
          final_geometry: solutionGeometry,
          actions: [],
          solve_time_ms: solveTimeMs,
          move_count: moveCount,
          notes: metadata.notes
        })
        .select()
        .single();
      
      if (error) throw error;
      
      console.log('✅ Solution saved!', data);
      setShowSaveModal(false);
      showNotification('Solution saved successfully!');
      
    } catch (err: any) {
      console.error('❌ Failed to save solution:', err);
      alert('Failed to save solution: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Convert Engine 2 placement to PlacedPiece format
  const convertPlacementToPieces = async (
    placement: Array<{ pieceId: string; ori: number; t: [number, number, number] }>
  ): Promise<PlacedPiece[]> => {
    const svc = new GoldOrientationService();
    await svc.load();
    
    const pieces: PlacedPiece[] = [];
    
    for (const p of placement) {
      const orientations = svc.getOrientations(p.pieceId);
      if (!orientations || p.ori >= orientations.length) continue;
      
      const orientation = orientations[p.ori];
      const anchor: IJK = { i: p.t[0], j: p.t[1], k: p.t[2] };
      
      // Calculate actual cells by adding anchor to orientation offsets
      const cells: IJK[] = orientation.ijkOffsets.map(offset => ({
        i: anchor.i + offset.i,
        j: anchor.j + offset.j,
        k: anchor.k + offset.k
      }));
      
      pieces.push({
        pieceId: p.pieceId,
        orientationId: orientation.orientationId,
        anchorSphereIndex: 0,
        cells,
        uid: `auto-${p.pieceId}-${pieces.length}`,
        placedAt: Date.now() + pieces.length
      });
    }
    
    return pieces;
  };

  // Auto-solve handler
  const handleAutoSolve = async () => {
    if (!puzzle || !piecesDb) {
      alert('Pieces database not loaded yet. Please wait...');
      return;
    }
    
    console.log('🤖 Starting auto-solve...');
    setIsAutoSolving(true);
    setAutoSolution(null);
    setAutoSolveStatus(null);
    
    // Convert puzzle geometry to container format
    const containerCells: [number, number, number][] = 
      puzzle.geometry.map(cell => [cell.i, cell.j, cell.k]);
    
    try {
      // Step 1: Precompute
      console.log('🔧 Precomputing...');
      const pre = engine2Precompute(
        { cells: containerCells, id: puzzle.id },
        piecesDb
      );
      console.log(`✅ Precompute done: ${pre.N} cells, ${pre.pieces.size} pieces`);
      
      // Step 2: Solve
      console.log('🔧 Starting solve...');
      const handle = engine2Solve(
        pre,
        engineSettings,
        {
          onStatus: (status: StatusV2) => {
            setAutoSolveStatus(status);
            console.log(`🤖 Auto-solve status: depth=${status.depth}`);
          },
          onSolution: async (placement: any) => {
            console.log('✅ Auto-solve found solution!', placement);
            const pieces = await convertPlacementToPieces(placement);
            setAutoSolution(pieces);
            // Enable reveal slider
            setRevealMax(pieces.length);
            setRevealK(pieces.length); // Show all initially
            console.log(`🎚️ Reveal slider enabled: ${pieces.length} pieces`);
          },
          onDone: (summary: any) => {
            console.log('🤖 Auto-solve done:', summary);
            setIsAutoSolving(false);
            if (summary.solutionsFound === 0) {
              alert('No solution found by auto-solver. Try different settings or manual solve.');
            }
          }
        }
      );
      
      engineHandleRef.current = handle;
      handle.resume();
    } catch (error: any) {
      console.error('❌ Auto-solve failed:', error);
      alert('Auto-solve failed: ' + error.message);
      setIsAutoSolving(false);
    }
  };

  // Stop auto-solve
  const handleStopAutoSolve = () => {
    if (engineHandleRef.current) {
      engineHandleRef.current.pause();
      engineHandleRef.current = null;
    }
    setIsAutoSolving(false);
    console.log('🛑 Auto-solve stopped');
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!loaded || showViewPieces || showAutoSolve) return; // Disable keyboard shortcuts in automated mode
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) return;

      if (e.key.toLowerCase() === 'r') {
        if (!anchor || fits.length === 0) return;
        if (e.shiftKey) {
          setFitIndex((prev) => (prev - 1 + fits.length) % fits.length);
        } else {
          setFitIndex((prev) => (prev + 1) % fits.length);
        }
        e.preventDefault();
      }

      if (e.key === 'Enter') {
        if (currentFit) {
          handleConfirmFit();
          e.preventDefault();
        }
      }

      if (e.key === 'Escape') {
        if (anchor) {
          clearGhost();
          e.preventDefault();
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedUid) {
          handleDeleteSelected();
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
  }, [loaded, showViewPieces, showAutoSolve, anchor, fits, fitIndex, currentFit, selectedUid, undoStack, redoStack]);

  // Loading state
  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '3rem' }}>🧩</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>Loading puzzle...</div>
      </div>
    );
  }

  // Error state
  if (error || !puzzle) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '3rem' }}>❌</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>Puzzle not found</div>
        <div style={{ color: 'rgba(255,255,255,0.6)' }}>{error || 'Invalid puzzle ID'}</div>
        <button
          onClick={() => navigate('/')}
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            background: '#2196F3',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div className="content-studio-page" style={{ 
      height: '100vh', 
      width: '100vw', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: '#000'
    }}>
      {/* Header */}
      <div className="shape-header">
        {/* Left: Home + Mode Toggle */}
        <div className="header-left">
          <button
            className="pill pill--chrome"
            onClick={() => navigate('/')}
            title="Home"
          >
            ⌂
          </button>
          
          {/* Manual/Automated Toggle */}
          <button
            className="pill pill--ghost"
            onClick={() => {
              if (showAutoSolve) {
                // Back to manual mode
                setShowAutoSolve(false);
              } else {
                // Start auto-solve mode
                setShowAutoSolve(true);
                if (!autoSolution && !isAutoSolving) {
                  handleAutoSolve();
                }
              }
            }}
            title={showAutoSolve ? "Switch to manual mode" : "Switch to automated mode"}
            style={{ 
              background: showAutoSolve ? '#4caf50' : 'rgba(255,255,255,0.1)',
              color: '#fff',
              fontWeight: 600
            }}
            disabled={isAutoSolving}
          >
            {isAutoSolving ? '⏳ Solving...' : showAutoSolve ? '🤖 Automated' : '👤 Manual'}
          </button>
        </div>

        {/* Center: Context-aware controls */}
        <div className="header-center">
          {!showAutoSolve ? (
            // Manual Mode Controls
            <>
              {/* Pieces Button */}
              <button
                className="pill pill--ghost"
                onClick={() => setShowViewPieces(true)}
                title="Select piece to place"
                style={{ 
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff'
                }}
              >
                📦 Pieces
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
            </>
          ) : (
            // Automated Mode Controls
            <>
              {/* Start/Stop Auto-Solve Button */}
              <button
                className="pill pill--primary"
                onClick={() => {
                  if (isAutoSolving) {
                    handleStopAutoSolve();
                  } else {
                    if (!autoSolution) {
                      handleAutoSolve();
                    }
                  }
                }}
                title={isAutoSolving ? "Stop solver" : "Start solver"}
                style={{ 
                  background: isAutoSolving ? '#f44336' : '#4caf50',
                  color: '#fff',
                  fontWeight: 600
                }}
              >
                {isAutoSolving ? '⏹ Stop' : '▶️ Start'}
              </button>
              
              {/* Auto-Solve Settings Button */}
              <button
                className="pill pill--ghost"
                onClick={() => setShowEngineSettings(true)}
                title="Auto-solve settings"
                style={{ 
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff'
                }}
              >
                ⚙️ Settings
              </button>
            </>
          )}
        </div>

        {/* Right: Environment Settings + Info */}
        <div className="header-right">
          <button
            className="pill pill--ghost"
            onClick={() => setShowEnvSettings(true)}
            title="Environment settings (lighting, materials)"
          >
            ⚙️
          </button>
          
          <button
            className="pill pill--chrome"
            onClick={() => setShowInfoModal(true)}
            title="About solving"
          >
            ℹ
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="canvas-wrap" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loaded && view ? (
          <>
            <SceneCanvas
              cells={cells}
              view={view}
              visibility={visibility}
              editMode={false}
              mode="add"
              settings={envSettings}
              onCellsChange={() => {}}
              onHoverCell={() => {}}
              onClickCell={undefined}
              anchor={showAutoSolve ? null : anchor}
              previewOffsets={showAutoSolve ? null : (currentFit?.cells ?? null)}
              placedPieces={visiblePlacedPieces}
              selectedPieceUid={showAutoSolve ? null : selectedUid}
              onSelectPiece={showAutoSolve ? (() => {}) : setSelectedUid}
              containerOpacity={0.45}
              containerColor="#ffffff"
              containerRoughness={0.35}
              puzzleMode={mode}
              onCycleOrientation={undefined}
              onPlacePiece={undefined}
              onDeleteSelectedPiece={undefined}
              drawingCells={showAutoSolve ? [] : drawingCells}
              onDrawCell={undefined}
              hidePlacedPieces={showAutoSolve ? false : hidePlacedPieces}
              explosionFactor={explosionFactor}
              onInteraction={showAutoSolve ? undefined : handleInteraction}
            />
            
            {/* Stats Overlay */}
            <SolveStats
              moveCount={moveCount}
              isStarted={isStarted}
              challengeMessage={puzzle.challenge_message}
            />
            
            {/* HUD Chip - Piece counter */}
            {loaded && cells.length > 0 && (
              <div className="hud-chip">
                Pieces placed: {placed.size} / {Math.floor(cells.length / 4)}
              </div>
            )}
            
            {/* Reveal and Explosion Sliders - Permanent controls */}
            {loaded && (
              <div style={{
                position: 'absolute',
                bottom: 20,
                right: 20,
                background: 'rgba(0, 0, 0, 0.75)',
                color: 'white',
                padding: '16px',
                borderRadius: '8px',
                minWidth: '200px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: '14px',
                zIndex: 100
              }}>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ marginBottom: '4px', fontWeight: 600 }}>
                    Reveal: {revealMax > 0 ? `${revealK} / ${revealMax}` : 'All'}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, revealMax)}
                    step={1}
                    value={revealK}
                    onChange={(e) => setRevealK(parseInt(e.target.value, 10))}
                    disabled={revealMax === 0}
                    style={{ 
                      width: '100%',
                      opacity: revealMax === 0 ? 0.3 : 1
                    }}
                    aria-label="Reveal pieces"
                  />
                  <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>
                    {revealMax > 0 ? 'Show pieces in placement order' : 'Available when solved'}
                  </div>
                </div>
                
                <div>
                  <div style={{ marginBottom: '4px', fontWeight: 600 }}>
                    Explosion: {Math.round(explosionFactor * 100)}%
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={explosionFactor * 100}
                    onChange={(e) => setExplosionFactor(parseInt(e.target.value, 10) / 100)}
                    style={{ width: '100%' }}
                    aria-label="Explosion amount"
                  />
                  <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>
                    Separate pieces for inspection
                  </div>
                </div>
              </div>
            )}
            
            {/* Notification */}
            {notification && (
              <div style={{
                position: 'absolute',
                top: 20,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0, 150, 0, 0.9)',
                color: 'white',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: 1000
              }}>
                {notification}
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
                🎨 Drawing {drawingCells.length}/4 cells - Single click to cancel
              </div>
            )}
            
            {/* Ghost HUD Overlay */}
            {anchor && (
              <div style={{
                position: 'absolute',
                bottom: 20,
                left: 20,
                background: 'rgba(0, 0, 0, 0.75)',
                color: 'white',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'monospace',
                pointerEvents: 'none'
              }}>
                <div><strong>Piece:</strong> {activePiece}</div>
                <div><strong>Fits:</strong> {fits.length > 0 ? `${fitIndex + 1} / ${fits.length}` : '0'}</div>
                {currentFit && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#aaa' }}>
                    <strong>Enter</strong> or double-click to place<br/>
                    <strong>R</strong> to cycle orientations
                  </div>
                )}
              </div>
            )}
            
            {/* Auto-Solve Progress Indicator - Draggable */}
            {isAutoSolving && autoSolveStatus && (
              <div
                onMouseDown={(e) => {
                  setIsDraggingProgress(true);
                  dragStartPos.current = {
                    x: e.clientX - progressPosition.x,
                    y: e.clientY - progressPosition.y
                  };
                }}
                onMouseMove={(e) => {
                  if (isDraggingProgress) {
                    setProgressPosition({
                      x: e.clientX - dragStartPos.current.x,
                      y: e.clientY - dragStartPos.current.y
                    });
                  }
                }}
                onMouseUp={() => setIsDraggingProgress(false)}
                onMouseLeave={() => setIsDraggingProgress(false)}
                style={{
                  position: 'absolute',
                  top: `${progressPosition.y}px`,
                  left: `${progressPosition.x}px`,
                  background: 'rgba(76, 175, 80, 0.95)',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  zIndex: 1000,
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: isDraggingProgress ? 'grabbing' : 'grab',
                  userSelect: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  minWidth: '180px'
                }}
              >
                <div style={{ fontSize: '12px', opacity: 0.9 }}>
                  🤖 Solving...
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                  <span>D: {autoSolveStatus.depth}</span>
                  <span>N: {((autoSolveStatus as any).nodes || 0).toLocaleString()}</span>
                </div>
                {(autoSolveStatus as any).nodesPerSec && (
                  <div style={{ fontSize: '10px', opacity: 0.8 }}>
                    {((autoSolveStatus as any).nodesPerSec).toFixed(0)} n/s
                  </div>
                )}
              </div>
            )}
            
            {/* Completion Notification */}
            {showCompletionCelebration && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(0, 200, 0, 0.95)',
                color: 'white',
                padding: '24px 32px',
                borderRadius: '12px',
                fontSize: '24px',
                fontWeight: 'bold',
                textAlign: 'center',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                zIndex: 1000
              }}>
                {/* Close button */}
                <button
                  onClick={() => setShowCompletionCelebration(false)}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    fontSize: '24px',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    lineHeight: '1',
                    opacity: 0.7
                  }}
                  title="Dismiss"
                >
                  ×
                </button>
                
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
                <div>Puzzle Complete!</div>
                <div style={{ fontSize: '14px', fontWeight: 'normal', marginTop: '8px', marginBottom: '16px', opacity: 0.9 }}>
                  All {cells.length} container cells filled
                </div>
                <button
                  onClick={() => {
                    setShowCompletionCelebration(false);
                    setShowSaveModal(true);
                  }}
                  style={{
                    padding: '10px 20px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    background: 'white',
                    color: '#00c800',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  💾 Save Solution
                </button>
              </div>
            )}
          </>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#fff'
          }}>
            Loading puzzle...
          </div>
        )}
      </div>

      {/* View Pieces Modal */}
      <ViewPiecesModal
        open={showViewPieces}
        onClose={() => setShowViewPieces(false)}
        onSelect={(pieceId) => {
          setActivePiece(pieceId);
          orientationController.current?.setPiece(pieceId);
          setFits([]);
          setAnchor(null);
          setLastViewedPiece(pieceId);
          setShowViewPieces(false);
        }}
        piecesAll={pieces}
        mode={mode}
        placedCountByPieceId={placedCountByPieceId}
        lastViewedPiece={lastViewedPiece}
      />

      {/* Save Solution Modal */}
      {showSaveModal && puzzle && (
        <SaveSolutionModal
          onSave={handleSaveSolution}
          onCancel={() => setShowSaveModal(false)}
          isSaving={isSaving}
          solutionStats={{
            puzzleName: puzzle.name,
            moveCount,
            solveTimeMs: solveStartTime ? Date.now() - solveStartTime : null
          }}
        />
      )}

      {/* Info Modal */}
      <InfoModal
        isOpen={showInfoModal}
        title="Solve Mode - How to Play"
        onClose={() => setShowInfoModal(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.95rem' }}>
          <p style={{ margin: 0 }}><strong>Goal</strong> — Recreate the puzzle shape by placing all spheres</p>
          <p style={{ margin: 0 }}><strong>How to Play</strong> — Double-click on ghost spheres to place them</p>
          <p style={{ margin: 0 }}><strong>Timer</strong> — Starts automatically on your first move</p>
          <p style={{ margin: 0 }}><strong>Moves</strong> — Each placement counts as one move</p>
          
          <div style={{ marginTop: '0.5rem' }}>
            <p style={{ margin: 0, marginBottom: '0.5rem' }}><strong>Modes</strong></p>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <li><strong>One Each:</strong> Each piece type can only be placed once. Same piece type = same color.</li>
              <li><strong>Unlimited:</strong> Place any piece as many times as you want. Each instance gets unique color.</li>
              <li><strong>Single:</strong> Only place the currently selected piece type. Each instance gets unique color.</li>
            </ul>
          </div>
          
          <p style={{ margin: 0 }}><strong>Auto-Solve</strong> — Click the button to see the algorithm solve it</p>
          
          {puzzle.challenge_message && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '0.75rem', 
              background: '#f0f9ff', 
              borderLeft: '3px solid #2196F3',
              borderRadius: '4px',
              fontSize: '0.875rem',
              color: '#1e40af'
            }}>
              💬 <strong>Creator's Challenge:</strong><br/>
              {puzzle.challenge_message}
            </div>
          )}
        </div>
      </InfoModal>

      {/* Engine Settings Modal (Auto-Solve) */}
      <EngineSettingsModal
        open={showEngineSettings}
        onClose={() => setShowEngineSettings(false)}
        engineName="Engine 2"
        currentSettings={engineSettings}
        onSave={(newSettings) => {
          console.log('💾 Saving auto-solve settings:', newSettings);
          setEngineSettings(newSettings);
          setShowEngineSettings(false);
        }}
      />

      {/* Environment Settings Modal (3D Scene) */}
      {showEnvSettings && (
        <SettingsModal
          settings={envSettings}
          onSettingsChange={(newSettings) => {
            console.log('💾 Saving environment settings to localStorage:', {
              brightness: newSettings.lights?.brightness,
              hdrEnabled: newSettings.lights?.hdr?.enabled,
              hdrEnv: newSettings.lights?.hdr?.envId,
              metalness: newSettings.material?.metalness,
              roughness: newSettings.material?.roughness
            });
            setEnvSettings(newSettings);
            settingsService.current.saveSettings(newSettings);
            console.log('✅ Environment settings persisted to localStorage');
          }}
          onClose={() => setShowEnvSettings(false)}
        />
      )}
    </div>
  );
}

export default SolvePage;
