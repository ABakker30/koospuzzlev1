// Solve Page - Clean implementation for social puzzle platform
import React, { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import type { IJK } from '../../types/shape';
import type { VisibilitySettings } from '../../types/lattice';
import { ijkToXyz } from '../../lib/ijk';
import SceneCanvas from '../../components/SceneCanvas';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { GoldOrientationService, GoldOrientationController } from '../../services/GoldOrientationService';
import { computeFits, ijkToKey, type FitPlacement } from '../../services/FitFinder';
import { supabase } from '../../lib/supabase';
import { getMovieById, incrementMovieViews, type MovieRecord } from '../../api/movies';
import { usePuzzleLoader } from './hooks/usePuzzleLoader';
import { useSolveActionTracker } from './hooks/useSolveActionTracker';
import { SolveStats } from './components/SolveStats';

// Movie Mode - Effects System
import { buildEffectContext, type EffectContext } from '../../studio/EffectContext';
import { TransportBar } from '../../studio/TransportBar';
import { TurnTableModal } from '../../effects/turntable/TurnTableModal';
import { RevealModal } from '../../effects/reveal/RevealModal';
import { GravityModal } from '../../effects/gravity/GravityModal';
import { GravityEffect } from '../../effects/gravity/GravityEffect';
import { TurnTableEffect } from '../../effects/turntable/TurnTableEffect';
import { RevealEffect } from '../../effects/reveal/RevealEffect';
import { CreditsModal, type CreditsData } from '../../components/CreditsModal';
import { ChallengeOverlay } from '../../components/ChallengeOverlay';
import { EngineSettingsModal } from '../../components/EngineSettingsModal';
import { SettingsModal } from '../../components/SettingsModal';
import { InfoModal } from '../../components/InfoModal';
import type { TurnTableConfig } from '../../effects/turntable/presets';
import type { RevealConfig } from '../../effects/reveal/presets';
import type { GravityEffectConfig } from '../../effects/gravity/types';
import * as THREE from 'three';
import { Notification } from '../../components/Notification';
import '../../styles/shape.css';

// Auto-solve Engine 2
import { engine2Solve, engine2Precompute, type Engine2RunHandle, type Engine2Settings } from '../../engines/engine2';
import type { PieceDB } from '../../engines/dfs2';
import type { StatusV2 } from '../../engines/types';
import { loadAllPieces } from '../../engines/piecesLoader';

// Environment settings
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

// Solve page modes
type SolveMode = 'manual' | 'automated' | 'movie';

export const SolvePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: puzzleId } = useParams<{ id: string }>();
  const { puzzle, loading, error } = usePuzzleLoader(puzzleId);
  const orientationController = useRef<GoldOrientationController | null>(null);
  
  // Movie playback from URL
  const [loadedMovie, setLoadedMovie] = useState<MovieRecord | null>(null);
  const [isLoadingMovie, setIsLoadingMovie] = useState(false);
  
  // Solution tracking (required for Movie Mode)
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
  const [notificationType, setNotificationType] = useState<'info' | 'warning' | 'error' | 'success'>('info');
  const [lastViewedPiece, setLastViewedPiece] = useState<string>('K');
  
  // Stable empty function to avoid recreating on every render
  const noOpSelectPiece = useRef(() => {}).current;
  
  // Simple timestamp to prevent ghost after deletion
  const lastDeleteTimeRef = useRef(0);
  
  // Reveal slider state (for visualization)
  const [revealK, setRevealK] = useState<number>(0);
  const [revealMax, setRevealMax] = useState<number>(0);
  
  // Explosion slider state (for visualization)
  const [explosionFactor, setExplosionFactor] = useState<number>(0); // 0 = assembled, 1 = exploded
  
  // Save modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);
  
  // Auto-solution saved modal state
  const [showAutoSolutionModal, setShowAutoSolutionModal] = useState(false);
  const [autoSolutionStats, setAutoSolutionStats] = useState<{
    isDuplicate: boolean;
    autoSolveRank: number;
    totalSolutions: number;
    solutionNumber: number;
  } | null>(null);
  
  // Movie player state (old modal - will be removed)
  const [showMoviePlayer, setShowMoviePlayer] = useState(false);
  

  // Movie Mode state (new integrated system)
  const [realSceneObjects, setRealSceneObjects] = useState<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: any;
    spheresGroup: THREE.Group;
    centroidWorld: THREE.Vector3;
  } | null>(null);
  const [effectContext, setEffectContext] = useState<EffectContext | null>(null);
  const [showEffectsDropdown, setShowEffectsDropdown] = useState(false);
  const [activeEffectId, setActiveEffectId] = useState<string | null>(null);
  const [activeEffectInstance, setActiveEffectInstance] = useState<any>(null);
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null); // Store thumbnail before effect
  
  // Effect modal states
  const [showTurnTableModal, setShowTurnTableModal] = useState(false);
  const [showRevealModal, setShowRevealModal] = useState(false);
  const [showGravityModal, setShowGravityModal] = useState(false);
  const [hideContainerCellsDuringMovie, setHideContainerCellsDuringMovie] = useState(false);
  
  // Credits modal state
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  
  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedMovieData, setSavedMovieData] = useState<{
    title: string;
    challengeText: string;
    fileSize: number;
    movieId?: string;
  } | null>(null);
  
  // Challenge overlay state
  const [showChallengeOverlay, setShowChallengeOverlay] = useState(false);
  const [hasChallenge, setHasChallenge] = useState(false);
  const currentChallengeRef = useRef<{
    text: string;
    title: string;
  } | null>(null);
  const [turntableRotation, setTurntableRotation] = useState(0); // Y-axis rotation in radians
  const originalPlacedRef = useRef<Map<string, PlacedPiece>>(new Map());
  
  // Shared welcome modal state
  const [showSharedWelcome, setShowSharedWelcome] = useState(false);
  const [isSharedLink, setIsSharedLink] = useState(false);
  
  // Solve mode state (Manual, Automated, Movie)
  const [solveMode, setSolveMode] = useState<SolveMode>('manual');
  const showAutoSolve = solveMode === 'automated'; // Backward compatibility
  const [showEngineSettings, setShowEngineSettings] = useState(false);
  const [piecesDb, setPiecesDb] = useState<PieceDB | null>(null);
  const [isAutoSolving, setIsAutoSolving] = useState(false);
  const [autoSolveStatus, setAutoSolveStatus] = useState<StatusV2 | null>(null);
  const [autoSolution, setAutoSolution] = useState<PlacedPiece[] | null>(null);
  const [autoConstructionIndex, setAutoConstructionIndex] = useState(0); // For animated piece-by-piece construction
  const [autoSolutionsFound, setAutoSolutionsFound] = useState(0); // Track number of solutions found
  const engineHandleRef = useRef<Engine2RunHandle | null>(null);
  const savingInProgressRef = useRef<boolean>(false); // Prevent duplicate saves
  
  // Engine 2 settings with localStorage persistence
  const [engineSettings, setEngineSettings] = useState<Engine2Settings>(() => {
    // Load from localStorage
    const stored = localStorage.getItem('solve.autoSolveSettings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        console.log('📥 Loaded auto-solve settings from localStorage:', parsed);
        return parsed;
      } catch (e) {
        console.error('Failed to parse stored auto-solve settings:', e);
      }
    }
    // Default settings
    const now = new Date();
    const timeSeed = now.getHours() * 10000 + now.getMinutes() * 100 + now.getSeconds();
    return {
      maxSolutions: 1, // Stop after finding first solution
      timeoutMs: 60000,
      moveOrdering: "mostConstrainedCell",
      pruning: { connectivity: true, multipleOf4: true, colorResidue: true, neighborTouch: true },
      statusIntervalMs: 500,
      seed: timeSeed, // Based on HH:MM:SS for different seed each time
      randomizeTies: true,
    };
  });
  
  // Environment settings (3D scene: lighting, materials, etc.)
  const settingsService = useRef(new StudioSettingsService());
  const [envSettingsState, setEnvSettingsState] = useState<StudioSettings>(() => {
    // Load from localStorage immediately on initialization
    try {
      const rawStored = localStorage.getItem('contentStudio_v2');
      console.log('📦 Initializing environment settings from localStorage:', rawStored ? 'found' : 'not found');
      
      const loaded = settingsService.current.loadSettings();
      console.log('✅ Environment settings loaded from localStorage:', {
        brightness: loaded.lights?.brightness,
        hdrEnabled: loaded.lights?.hdr?.enabled,
        hdrEnv: loaded.lights?.hdr?.envId,
        metalness: loaded.material?.metalness,
        roughness: loaded.material?.roughness,
        fullSettings: loaded
      });
      return loaded;
    } catch (error) {
      console.error('❌ Error loading environment settings:', error);
      return DEFAULT_STUDIO_SETTINGS;
    }
  });
  const [showEnvSettings, setShowEnvSettings] = useState(false);
  
  // Just use the state directly - no need for useMemo since we're not passing settings to SceneCanvas
  const envSettings = envSettingsState;
  
  // Action tracking for solve replay and movie generation
  const {
    actions: solveActions,
    trackAction: trackSolveAction,
    startTracking,
    isTracking,
    getSolveStats,
    clearHistory,
  } = useSolveActionTracker();
  
  // Track if we've initialized tracking for this puzzle load
  const trackingInitializedRef = useRef(false);
  
  // Initialize action tracking when puzzle loads in manual mode
  useEffect(() => {
    console.log('🔍 Tracking effect check:', { loaded, showAutoSolve, isTracking, initialized: trackingInitializedRef.current });
    
    if (loaded && !showAutoSolve && !trackingInitializedRef.current) {
      // Clear any old history and start fresh
      clearHistory();
      startTracking();
      trackingInitializedRef.current = true;
      console.log('🎬 Action tracking initialized for manual mode');
    }
    
    // Clear tracking if switching to auto-solve
    if (showAutoSolve && trackingInitializedRef.current) {
      clearHistory();
      trackingInitializedRef.current = false;
      console.log('🎬 Action tracking cleared (auto-solve mode)');
    }
    
    // Reset flag when puzzle changes
    if (!loaded) {
      trackingInitializedRef.current = false;
    }
  }, [loaded, showAutoSolve, startTracking, clearHistory]);
  
  // State for auto-solve intermediate pieces
  const [autoSolveIntermediatePieces, setAutoSolveIntermediatePieces] = useState<PlacedPiece[]>([]);
  
  // Progress indicator position (draggable)
  const [progressPosition, setProgressPosition] = useState({ x: 20, y: 80 });
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  
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
    
    // If showing auto-solve and we have a solution, use animated construction
    if (showAutoSolve && autoSolution) {
      const sorted = [...autoSolution].sort((a, b) => a.placedAt - b.placedAt);
      
      // During construction animation, only show pieces up to current index
      if (autoConstructionIndex < autoSolution.length) {
        return sorted.slice(0, autoConstructionIndex);
      }
      
      // After construction is complete, always use reveal slider (revealK)
      return sorted.slice(0, revealK);
    }
    
    // During movie playback, always show all pieces
    if (loadedMovie) {
      const pieces = Array.from(placed.values());
      console.log(`🎬 Movie playback: Showing ${pieces.length} placed pieces`);
      return pieces;
    }
    
    // Otherwise show manual solution
    if (!isComplete || revealMax === 0) {
      // Not complete or no reveal - show all placed pieces
      return Array.from(placed.values());
    }
    
    // When complete, use reveal slider
    const sorted = Array.from(placed.values()).sort((a, b) => a.placedAt - b.placedAt);
    return sorted.slice(0, revealK);
  }, [placed, isComplete, revealK, revealMax, showAutoSolve, autoSolution, isAutoSolving, autoSolveIntermediatePieces, autoConstructionIndex, loadedMovie]);
  
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

  // Load movie from URL parameter
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const movieId = searchParams.get('movie');
    
    if (!movieId || !loaded) return;
    
    const loadMovie = async () => {
      setIsLoadingMovie(true);
      console.log('🎬 Loading movie from URL:', movieId);
      
      try {
        const movie = await getMovieById(movieId);
        
        if (!movie) {
          console.error('❌ Movie not found:', movieId);
          return;
        }
        
        console.log('✅ Movie loaded:', movie);
        setLoadedMovie(movie);
        
        // Restore puzzle mode for correct coloring
        if (movie.puzzle_mode) {
          const modeMap: Record<string, Mode> = {
            'One of Each': 'oneOfEach',
            'Unlimited': 'unlimited',
            'Single Piece': 'single'
          };
          const restoredMode = modeMap[movie.puzzle_mode] || 'unlimited';
          startTransition(() => {
            setMode(restoredMode);
          });
          console.log('🎨 Restored puzzle mode:', restoredMode);
        }
        
        // Increment view count
        await incrementMovieViews(movieId);
        
        // Restore placed pieces from solution data
        if (movie.solution_data?.placed_pieces && Array.isArray(movie.solution_data.placed_pieces)) {
          console.log('🔄 Restoring', movie.solution_data.placed_pieces.length, 'placed pieces from solution');
          console.log('🔍 Sample piece:', movie.solution_data.placed_pieces[0]);
          const restoredPieces = new Map<string, PlacedPiece>();
          movie.solution_data.placed_pieces.forEach((piece: any) => {
            restoredPieces.set(piece.uid, {
              uid: piece.uid,
              pieceId: piece.pieceId,
              orientationId: piece.orientationId,
              anchorSphereIndex: piece.anchorSphereIndex,
              cells: piece.cells,
              placedAt: piece.placedAt
            });
          });
          // Batch all state updates to prevent multiple re-renders
          startTransition(() => {
            setPlaced(restoredPieces);
          });
          
          console.log('✅ Placed pieces restored, map size:', restoredPieces.size);
          console.log('🚨 PROOF: Running Windsurf updated code - timestamp:', Date.now());
          console.log('🚨 restoredPieces size:', restoredPieces.size);
          console.log('🚨 restoredPieces values:', Array.from(restoredPieces.values()));
          try {
            const firstPiece = Array.from(restoredPieces.values())[0];
            console.log('🔍 First piece in map:', firstPiece);
            if (firstPiece) {
              console.log('🔍 First piece cells:', firstPiece.cells);
              console.log('🔍 First piece cells length:', firstPiece.cells?.length);
              console.log('🔍 All piece IDs:', Array.from(restoredPieces.values()).map(p => p.pieceId));
            }
          } catch (err) {
            console.error('❌ Error logging piece info:', err);
          }
          
          // Reset camera to fit the solved puzzle - do this EARLY so it doesn't disrupt movie playback
          setTimeout(() => {
            console.log('🚨 CAMERA RESET: Starting early (before effect activation)');
            if ((window as any).resetCameraFlag) {
              (window as any).resetCameraFlag();
              console.log('📷 Camera reset for movie playback');
            }
            
            // Calculate centroid of placed pieces in WORLD SPACE using view.M_world
            const allCells = Array.from(restoredPieces.values()).flatMap(p => p.cells);
            console.log('📷 Total cells in placed pieces:', allCells.length);
            
            if (allCells.length > 0 && (window as any).setOrbitTarget && view) {
              const M = view.M_world;
              let minX = Infinity, maxX = -Infinity;
              let minY = Infinity, maxY = -Infinity;
              let minZ = Infinity, maxZ = -Infinity;
              
              // Transform each IJK cell to world space
              for (const cell of allCells) {
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
              
              // Calculate size and distance for camera positioning
              const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
              const distance = size * 2.5; // Distance from center
              
              console.log('📷 Piece centroid in WORLD SPACE:', center);
              console.log('📷 Piece size:', size, 'Camera distance:', distance);
              
              // Set orbit target
              if ((window as any).setOrbitTarget) {
                (window as any).setOrbitTarget(center);
                console.log('📷 Orbit target set to centroid');
              }
              
              // Position camera to view the pieces
              if ((window as any).setCameraPosition) {
                (window as any).setCameraPosition({
                  x: center.x + distance * 0.7,
                  y: center.y + distance * 0.8,
                  z: center.z + distance * 0.7
                });
                console.log('📷 Camera positioned to view pieces');
                
                // Re-enable controls after camera reset for gallery movies
                // Use window API since realSceneObjects might not be in scope
                setTimeout(() => {
                  if ((window as any).getOrbitControls) {
                    const controls = (window as any).getOrbitControls();
                    if (controls) {
                      controls.enabled = true;
                      console.log('✅ Controls re-enabled after camera reset via window API');
                    }
                  }
                }, 50); // Quick re-enable after camera positioning
              }
            }
          }, 100); // EARLY camera reset - before effect activation
        } else {
          console.error('❌ No solution data found in movie!', movie);
          console.error('⚠️  DATABASE MIGRATION NEEDED:');
          console.error('   1. Run: supabase-add-placed-pieces.sql');
          console.error('   2. Re-save a solution');
          console.error('   3. Re-create this movie');
          alert('Movie data incomplete!\n\nDatabase migration required:\n1. Run supabase-add-placed-pieces.sql\n2. Re-save solution\n3. Re-create movie');
          setIsLoadingMovie(false);
          return;
        }
        
        // Batch mode switch and challenge state updates
        startTransition(() => {
          setSolveMode('movie');
          setHasChallenge(true);
        });
        
        // Store challenge for display at end (ref doesn't cause re-render)
        currentChallengeRef.current = {
          text: movie.challenge_text,
          title: movie.title
        };
        
        // Effect will be auto-activated when effectContext is ready
        console.log('🎬 Movie loaded, waiting for scene and effect context...');
        
      } catch (err) {
        console.error('❌ Failed to load movie:', err);
      } finally {
        setIsLoadingMovie(false);
      }
    };
    
    loadMovie();
  }, [location.search, loaded]);

  // Detect shared link and show welcome modal (wait for full scene initialization)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const isShared = searchParams.get('shared') === 'true';
    const hasMovie = searchParams.get('movie');
    
    if (isShared && puzzle && loaded && view && realSceneObjects) {
      setIsSharedLink(true);
      console.log('🔗 Shared link detected, scene is ready');
      // Scene is fully initialized including Three.js objects
      const timer = setTimeout(() => {
        setShowSharedWelcome(true);
        console.log('✅ Welcome modal shown for:', hasMovie ? 'movie' : 'puzzle');
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [location.search, puzzle, loaded, view, realSceneObjects]);

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
  const showNotification = (message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
    setNotification(message);
    setNotificationType(type);
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
      setNotification(`Piece "${currentFit.pieceId}" is already placed in One-of-Each mode`);
      setNotificationType('warning');
      return;
    }
    
    if (mode === 'single' && currentFit.pieceId !== activePiece) {
      setNotification(`Single Piece mode: Can only place "${activePiece}"`);
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
    
    // Track action for movie generation (manual mode only)
    console.log('🔍 Tracking check at placement:', { showAutoSolve, isTracking, willTrack: !showAutoSolve && isTracking });
    if (!showAutoSolve && isTracking) {
      trackSolveAction('PLACE_PIECE', {
        pieceId: currentFit.pieceId,
        orientation: currentFit.orientationId, // Orientation ID string
        ijkPosition: currentFit.cells[0], // First cell as reference position
        cells: currentFit.cells,
        uid: uid,
      });
      console.log('🎬 Action tracked!');
    } else {
      console.warn('❌ Action NOT tracked - showAutoSolve:', showAutoSolve, 'isTracking:', isTracking);
    }
    
    console.log('✅ Piece placed:', { 
      uid, 
      pieceId: currentFit.pieceId, 
      moveCount: moveCount + 1,
      tracking: isTracking,
      totalActions: solveActions.length
    });
    
    clearGhost();
  };

  // Handle cell click
  const handleCellClick = (clickedCell: IJK, isDrawAction = false) => {
    // Block ghost creation for 300ms after deletion
    const timeSinceDelete = Date.now() - lastDeleteTimeRef.current;
    if (timeSinceDelete < 300) {
      console.log('🚫 handleCellClick blocked - just deleted ({}ms ago)', timeSinceDelete);
      return;
    }
    
    console.log('🟬 handleCellClick called:', clickedCell, 'isDrawAction:', isDrawAction);
    
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
    
    // Track action for movie generation (manual mode only) - DRAWING MODE
    console.log('🔍 Tracking check at drawing placement:', { showAutoSolve, isTracking, willTrack: !showAutoSolve && isTracking });
    if (!showAutoSolve && isTracking) {
      trackSolveAction('PLACE_PIECE', {
        pieceId: bestMatch.pieceId,
        orientation: bestMatch.orientationId,
        ijkPosition: bestMatch.cells[0],
        cells: bestMatch.cells,
        uid: uid,
      });
      console.log('🎬 Drawing mode action tracked!');
    } else {
      console.warn('❌ Drawing mode action NOT tracked - showAutoSolve:', showAutoSolve, 'isTracking:', isTracking);
    }
    
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
    
    // Mark deletion time to block ghost creation
    lastDeleteTimeRef.current = Date.now();
    
    setSelectedUid(null);
    clearGhost(); // Clear ghost preview when deleting
  };

  // Undo
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    
    const action = undoStack[undoStack.length - 1];
    
    if (action.type === 'delete') {
      const currentCount = placedCountByPieceId[action.piece.pieceId] ?? 0;
      if (mode === 'oneOfEach' && currentCount >= 1) {
        setNotification(`Cannot undo: Piece "${action.piece.pieceId}" is already placed`);
        setNotificationType('warning');
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
      
      // Track undo action for movie generation (manual mode only)
      if (!showAutoSolve && isTracking) {
        trackSolveAction('UNDO', {
          pieceId: action.piece.pieceId,
          uid: action.piece.uid,
        });
      }
      
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
      
      // Track undo action for movie generation (manual mode only)
      if (!showAutoSolve && isTracking) {
        trackSolveAction('UNDO', {
          pieceId: action.piece.pieceId,
          uid: action.piece.uid,
        });
      }
      
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
        setNotification(`Cannot redo: Piece "${action.piece.pieceId}" is already placed`);
        setNotificationType('warning');
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
        // Cancel partial piece drawing if in progress
        if (drawingCells.length > 0) {
          setDrawingCells([]);
        }
      }
      return;
    }
  };

  // Save solution to Supabase
  const handleSaveSolution = async (metadata: { solverName: string; notes?: string }) => {
    // Check if we have either a manual solution or auto-solution
    const hasManualSolution = isComplete && placed.size > 0;
    const hasAutoSolution = autoSolution && autoSolution.length > 0;
    
    if ((!hasManualSolution && !hasAutoSolution) || !puzzle) {
      console.error('❌ Cannot save: missing required data');
      return;
    }
    
    setIsSaving(true);
    
    try {
      console.log('💾 Saving solution...');
      
      // Use auto-solution if available, otherwise use placed pieces
      const isAutomated = hasAutoSolution && solveMode === 'automated';
      const sourcePieces = isAutomated ? autoSolution : Array.from(placed.values());
      
      const solutionGeometry = sourcePieces.flatMap(piece => piece.cells);
      const solveTimeMs = solveStartTime ? Date.now() - solveStartTime : null;
      
      // Serialize placed pieces for reconstruction
      const placedPieces = sourcePieces.map(piece => ({
        uid: piece.uid,
        pieceId: piece.pieceId,
        orientationId: piece.orientationId,
        anchorSphereIndex: piece.anchorSphereIndex,
        cells: piece.cells,
        placedAt: piece.placedAt
      }));
      
      // Get solve stats
      const stats = getSolveStats();
      console.log('📊 Solve stats:', stats);
      console.log('🎬 Total actions tracked:', solveActions.length);
      
      const { data, error } = await supabase
        .from('solutions')
        .insert({
          puzzle_id: puzzle.id,
          solver_name: metadata.solverName,
          solution_type: isAutomated ? 'auto' : 'manual',
          final_geometry: solutionGeometry,
          placed_pieces: placedPieces, // For movie playback
          actions: solveActions, // Save tracked actions for movie generation
          solve_time_ms: isAutomated ? null : solveTimeMs,
          move_count: isAutomated ? sourcePieces.length : moveCount,
          notes: metadata.notes
        })
        .select()
        .single();
      
      if (error) throw error;
      
      console.log('✅ Solution saved!', data);
      setCurrentSolutionId(data.id); // Enable Movie Mode!
      setShowSaveModal(false);
      showNotification('Solution saved! Movie Mode now available.');
      
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

  // Auto-save auto-solve solution with duplicate detection
  const autoSaveAutoSolution = async (pieces: PlacedPiece[]) => {
    console.log('🔍 [APP-SAVE] autoSaveAutoSolution called');
    console.log(`🔍 [APP-SAVE] puzzle exists: ${!!puzzle}`);
    console.log(`🔍 [APP-SAVE] currentSolutionId: ${currentSolutionId}`);
    console.log(`🔍 [APP-SAVE] pieces count: ${pieces.length}`);
    
    if (!puzzle) {
      console.log('⚠️ [APP-SAVE] No puzzle, returning');
      return;
    }
    
    // GUARD: Prevent duplicate saves
    if (currentSolutionId) {
      console.log('⚠️ [APP-SAVE] Solution already saved (currentSolutionId exists), skipping duplicate save');
      return;
    }
    
    try {
      console.log('💾 [APP-SAVE] Starting save to database...');
      
      const solutionGeometry = pieces.flatMap(piece => piece.cells);
      const placedPieces = pieces.map(piece => ({
        uid: piece.uid,
        pieceId: piece.pieceId,
        orientationId: piece.orientationId,
        anchorSphereIndex: piece.anchorSphereIndex,
        cells: piece.cells,
        placedAt: piece.placedAt
      }));
      
      // Check for duplicate solution geometry
      const { data: existingSolutions, error: checkError } = await supabase
        .from('solutions')
        .select('id, solution_type')
        .eq('puzzle_id', puzzle.id)
        .eq('final_geometry', JSON.stringify(solutionGeometry));
      
      if (checkError) throw checkError;
      
      const isDuplicate = existingSolutions && existingSolutions.length > 0;
      
      // Count auto-solve solutions for this puzzle
      const { count: autoSolveCount } = await supabase
        .from('solutions')
        .select('id', { count: 'exact', head: true })
        .eq('puzzle_id', puzzle.id)
        .eq('solution_type', 'auto');
      
      // Count total solutions for this puzzle
      const { count: totalCount } = await supabase
        .from('solutions')
        .select('id', { count: 'exact', head: true })
        .eq('puzzle_id', puzzle.id);
      
      // Save the solution with current user's name
      console.log('📝 [APP-SAVE] Inserting into database...');
      console.log(`   ├─ puzzle_id: ${puzzle.id}`);
      console.log(`   ├─ solver_name: ${currentUserName}`);
      console.log(`   ├─ isDuplicate: ${isDuplicate}`);
      console.log(`   └─ move_count: ${pieces.length}`);
      
      const { data, error } = await supabase
        .from('solutions')
        .insert({
          puzzle_id: puzzle.id,
          solver_name: currentUserName,
          solution_type: 'auto',
          final_geometry: solutionGeometry,
          placed_pieces: placedPieces,
          actions: solveActions,
          solve_time_ms: null,
          move_count: pieces.length,
          notes: isDuplicate ? 'Duplicate solution found by auto-solver' : 'Unique solution found by auto-solver'
        })
        .select()
        .single();
      
      if (error) {
        console.error('❌ [APP-SAVE] Database insert error:', error);
        throw error;
      }
      
      console.log('✅ [APP-SAVE] Solution saved to database!', data);
      console.log(`   └─ Solution ID: ${data.id}`);
      setCurrentSolutionId(data.id);
      
      // Store stats and show modal
      const autoSolveRank = (autoSolveCount || 0) + 1;
      const totalSolutions = (totalCount || 0) + 1;
      
      setAutoSolutionStats({
        isDuplicate,
        autoSolveRank,
        totalSolutions,
        solutionNumber: autoSolutionsFound
      });
      setShowAutoSolutionModal(true);
      
    } catch (err: any) {
      console.error('❌ Failed to auto-save solution:', err);
      // Still show error via notification for failures
      showNotification('Solution found but could not be saved to database', 'error');
    }
  };
  
  // Helper for ordinal suffix (1st, 2nd, 3rd, etc.)
  const getOrdinalSuffix = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };
  
  // Get current user's name for auto-solve credit
  const [currentUserName, setCurrentUserName] = useState<string>('Auto-Solver');
  useEffect(() => {
    const getUserName = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Use email username or full email as fallback
        const name = user.email?.split('@')[0] || user.email || 'Auto-Solver';
        setCurrentUserName(name);
      }
    };
    getUserName();
  }, []);
  
  // Convert auto-solution to action history for movie mode
  const convertAutoSolutionToActions = useCallback((pieces: PlacedPiece[]) => {
    console.log('🎬 Converting auto-solution to action history for movie mode');
    
    // Clear existing actions and start fresh
    clearHistory();
    
    // Add START action
    trackSolveAction('START_SOLVE', {});
    
    // Sort pieces by placement time
    const sortedPieces = [...pieces].sort((a, b) => a.placedAt - b.placedAt);
    
    // Track each placement
    sortedPieces.forEach(piece => {
      trackSolveAction('PLACE_PIECE', {
        pieceId: piece.pieceId,
        orientation: piece.orientationId,
        ijkPosition: piece.cells[0],
        cells: piece.cells,
        uid: piece.uid,
      });
    });
    
    // Add COMPLETE action
    trackSolveAction('COMPLETE_SOLVE', {});
    
    console.log('✅ Auto-solution converted to', sortedPieces.length + 2, 'actions');
  }, [clearHistory, trackSolveAction]);

  // Auto-solve handler
  const handleAutoSolve = async () => {
    if (!puzzle || !piecesDb) {
      alert('Pieces database not loaded yet. Please wait...');
      return;
    }
    
    // GUARD: Prevent multiple solves from running
    if (engineHandleRef.current) {
      console.log('⚠️ Auto-solve already in progress');
      return;
    }
    
    // Reset saving flag for new solve
    savingInProgressRef.current = false;
    
    console.log('🤖 Starting auto-solve...');
    
    // Clear previous solution ID for fresh solve
    setCurrentSolutionId(null);
    
    setIsAutoSolving(true);
    setAutoSolution(null);
    setAutoSolveStatus(null);
    setAutoSolutionsFound(0);
    
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
          onSolution: async (placement) => {
            console.log('🎉 [APP] Solution found! onSolution callback triggered');
            console.log(`🔍 [APP-DEBUG] savingInProgressRef.current: ${savingInProgressRef.current}`);
            console.log(`🔍 [APP-DEBUG] Placement pieces:`, placement.map(p => p.pieceId).join(','));
            
            // GUARD: Prevent React Strict Mode from scheduling multiple saves
            if (savingInProgressRef.current) {
              console.log('⚠️ [APP] Save already in progress, ignoring duplicate callback');
              return;
            }
            console.log('✅ [APP] Setting savingInProgressRef to true');
            savingInProgressRef.current = true;
            
            // Pause the solver after finding a solution
            if (engineHandleRef.current) {
              engineHandleRef.current.pause();
            }
            setIsAutoSolving(false);
            
            const pieces = await convertPlacementToPieces(placement);
            setAutoSolution(pieces);
            setAutoSolutionsFound(prev => prev + 1);
            
            // Convert to action history for movie mode (save happens after animation with full actions)
            convertAutoSolutionToActions(pieces);
            
            // Enable reveal slider for after construction
            setRevealMax(pieces.length);
            setRevealK(pieces.length); // Show all initially after construction
            console.log(`🎬 Starting animated construction: ${pieces.length} pieces`);
            console.log(`🎬 Actions available for movie mode: ${pieces.length + 2}`);
            
            // Auto-save solution after construction animation
            setTimeout(async () => {
              await autoSaveAutoSolution(pieces);
              savingInProgressRef.current = false; // Reset after save completes
              
              // CAPTURE THUMBNAIL NOW - after construction, puzzle is fully visible
              try {
                const canvas = document.querySelector('canvas');
                if (canvas) {
                  console.log('📸 Capturing thumbnail after construction completes...');
                  console.log('   Canvas size:', canvas.width, 'x', canvas.height);
                  
                  // Check if canvas has any content by reading a pixel
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    const imageData = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1);
                    console.log('   Center pixel RGBA:', imageData.data);
                  }
                  
                  // Wait 2 frames to ensure final render
                  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                  
                  const { captureCanvasScreenshot } = await import('../../services/thumbnailService');
                  const blob = await captureCanvasScreenshot(canvas);
                  setThumbnailBlob(blob);
                  
                  // DEBUG: Create preview URL
                  const previewUrl = URL.createObjectURL(blob);
                  console.log('✅ Thumbnail captured:', (blob.size / 1024).toFixed(2), 'KB');
                  console.log('🖼️ Preview URL:', previewUrl);
                  
                  const img = new Image();
                  img.src = previewUrl;
                  img.onload = () => {
                    console.log('📸 Thumbnail preview:', img);
                    console.log(`   Size: ${img.width}x${img.height}`);
                  };
                }
              } catch (error) {
                console.error('❌ Error capturing thumbnail:', error);
              }
            }, pieces.length * 150 + 2000); // Wait for construction + 2s
          },
          onDone: (summary: any) => {
            console.log('🤖 Auto-solve done:', summary);
            setIsAutoSolving(false);
            // No notifications on completion - user will see modal when solution is found
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
      engineHandleRef.current = null; // Clear ref so new solve can start
    }
    setIsAutoSolving(false);
    setAutoSolution(null);
    setAutoSolutionsFound(0);
    setAutoConstructionIndex(0);
    console.log('🛑 Auto-solve stopped');
  };

  // Resume auto-solve to find next solution
  const handleResumeAutoSolve = () => {
    if (engineHandleRef.current) {
      console.log('🔄 Resuming auto-solve to find next solution...');
      setIsAutoSolving(true);
      setAutoSolution(null); // Clear current solution
      setAutoConstructionIndex(0);
      engineHandleRef.current.resume();
    } else {
      // If no handle exists, start fresh
      handleAutoSolve();
    }
  };

  // Animate construction of auto-solve solution piece by piece
  useEffect(() => {
    if (!autoSolution || autoSolution.length === 0) {
      setAutoConstructionIndex(0);
      return;
    }
    
    // Reset to 0 when new solution arrives
    setAutoConstructionIndex(0);
    
    // Animate piece placement with 150ms delay
    const timer = setInterval(() => {
      setAutoConstructionIndex(prev => {
        if (prev >= autoSolution.length) {
          clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 150);
    
    return () => clearInterval(timer);
  }, [autoSolution]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!loaded || showViewPieces || showAutoSolve || solveMode === 'movie') return; // Disable keyboard shortcuts in automated/movie mode
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
        // Disabled in movie mode - selection not allowed
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
  }, [loaded, showViewPieces, showAutoSolve, solveMode, anchor, fits, fitIndex, currentFit, selectedUid, undoStack, redoStack]);

  // ========== MOVIE MODE - EFFECTS SYSTEM ==========
  
  // Build effect context when real scene objects are available
  useEffect(() => {
    if (!loaded || !realSceneObjects || solveMode !== 'movie') return;
    
    console.log('🎬 Building EffectContext for Movie Mode');
    try {
      const context = buildEffectContext({
        scene: realSceneObjects.scene,
        spheresGroup: realSceneObjects.spheresGroup,
        camera: realSceneObjects.camera,
        controls: realSceneObjects.controls,
        renderer: realSceneObjects.renderer,
        centroidWorld: realSceneObjects.centroidWorld
      });
      
      setEffectContext(context);
      console.log('✅ EffectContext built successfully');
    } catch (error) {
      console.error('❌ Failed to build EffectContext:', error);
    }
  }, [loaded, realSceneObjects, solveMode]);
  
  // Auto-activate effect when effectContext is ready for movie playback
  useEffect(() => {
    if (!effectContext || !loadedMovie || activeEffectInstance) return;
    
    console.log('🎬 EffectContext ready, auto-activating effect:', loadedMovie.effect_type);
    
    // Delay to ensure scene is rendered AND camera reset is complete (camera resets at 100ms)
    setTimeout(() => {
      // Disable looping for gallery-loaded movies - user controls playback
      // For turntable, force "object" mode so puzzle rotates instead of camera
      const modifiedConfig = {
        ...(loadedMovie.effect_config as any),
        loop: { 
          ...(loadedMovie.effect_config as any)?.loop,
          enabled: false 
        },
        preserveControls: true, // Keep orbit controls enabled during gallery playback
        // Force object mode for turntable to rotate puzzle, not camera
        ...(loadedMovie.effect_type === 'turntable' && { mode: 'object' })
      };
      console.log('🎬 Gallery movie config:', JSON.stringify(modifiedConfig, null, 2));
      console.log('🎬 Mode override for gallery:', loadedMovie.effect_type === 'turntable' ? 'object (rotate puzzle)' : 'default');
      handleActivateEffect(loadedMovie.effect_type, modifiedConfig);
    }, 400); // Delayed to run AFTER camera reset (100ms) + controls re-enable (150ms)
  }, [effectContext, loadedMovie, activeEffectInstance]);
  
  // Effect activation handler
  const handleActivateEffect = async (effectId: string, config: TurnTableConfig | RevealConfig | GravityEffectConfig | null): Promise<any> => {
    if (!effectContext || !realSceneObjects) {
      console.error('❌ Cannot activate effect: missing context or scene objects');
      return null;
    }
    
    console.log(`🎬 Activating effect: ${effectId}`);
    
    // Deactivate current effect if any
    if (activeEffectInstance) {
      console.log('🛑 Deactivating current effect');
      activeEffectInstance.deactivate();
    }
    
    // CRITICAL: Reset all pieces to original solved state before starting new effect
    try {
      console.log('🔄 Resetting puzzle to original solved state...');
      
      // Access the mesh group from effectContext
      const meshGroup = effectContext.meshGroup;
      
      if (meshGroup && meshGroup.children && autoSolution && autoSolution.length > 0) {
        let resetCount = 0;
        meshGroup.children.forEach((mesh: any) => {
          if (mesh.userData && mesh.userData.uid) {
            const pieceUid = mesh.userData.uid;
            const originalPiece = autoSolution.find(p => p.uid === pieceUid);
            
            if (originalPiece && originalPiece.orientation) {
              // Reset to original position (all pieces at origin)
              mesh.position.set(0, 0, 0);
              
              // Reset to original rotation
              const orientation = originalPiece.orientation;
              if (orientation && orientation.quaternion) {
                mesh.quaternion.set(
                  orientation.quaternion.x || 0,
                  orientation.quaternion.y || 0,
                  orientation.quaternion.z || 0,
                  orientation.quaternion.w || 1
                );
              }
              
              mesh.updateMatrix();
              resetCount++;
            }
          }
        });
        console.log(`✅ Puzzle reset: ${resetCount} pieces restored to original state`);
      } else {
        console.warn('⚠️ Cannot reset puzzle: missing meshGroup or autoSolution');
      }
    } catch (error) {
      console.error('❌ Error resetting puzzle (non-fatal):', error);
      // Continue anyway - don't block effect activation
    }
    
    // Thumbnail will be captured AFTER construction animation completes
    // (moved to onSolution callback after save - when puzzle is fully visible)
    
    // Create and activate new effect
    let instance = null;
    try {
      switch(effectId) {
        case 'gravity':
          instance = new GravityEffect();
          break;
        case 'turntable':
          instance = new TurnTableEffect();
          break;
        case 'reveal':
          instance = new RevealEffect();
          break;
        default:
          console.error(`❌ Unknown effect: ${effectId}`);
          return null;
      }
      
      // Initialize effect with context
      if (instance.init) {
        instance.init(effectContext);
      }
      
      // onComplete callback will be set by useEffect after TransportBar sets its callback
      
      setActiveEffectId(effectId);
      setActiveEffectInstance(instance);
      
      console.log(`✅ Effect activated: ${effectId}`);
      return instance;
    } catch (error) {
      console.error(`❌ Failed to activate effect ${effectId}:`, error);
      return null;
    }
  };
  
  // Effect clear handler
  const handleClearEffect = () => {
    if (activeEffectInstance) {
      try {
        activeEffectInstance.dispose();
        console.log(`🗑️ Effect cleared: ${activeEffectId}`);
      } catch (error) {
        console.error('❌ Error disposing effect:', error);
      }
    }
    
    // Restore puzzle to original solved state in movie mode
    if (solveMode === 'movie' && originalPlacedRef.current.size > 0) {
      setPlaced(new Map(originalPlacedRef.current));
      setRevealK(originalPlacedRef.current.size);
      setExplosionFactor(0);
      console.log('🔄 Puzzle restored to original solved state');
    }
    
    setActiveEffectId(null);
    setActiveEffectInstance(null);
    setShowEffectsDropdown(false);
  };
  
  // Effect selection handler
  const handleEffectSelect = (effectId: string) => {
    console.log(`🎬 Selecting effect: ${effectId}`);
    
    if (activeEffectInstance) {
      handleClearEffect();
    }
    
    setShowEffectsDropdown(false);
    
    if (effectId === 'turntable') {
      setShowTurnTableModal(true);
    } else if (effectId === 'reveal') {
      setShowRevealModal(true);
    } else if (effectId === 'gravity') {
      setShowGravityModal(true);
    }
  };
  
  // Effect modal handlers
  const handleTurnTableSave = (config: TurnTableConfig) => {
    console.log('🎬 TurnTable config saved:', config);
    setShowTurnTableModal(false);
    handleActivateEffect('turntable', config);
  };
  
  const handleRevealSave = (config: RevealConfig) => {
    console.log('🎬 Reveal config saved:', config);
    setShowRevealModal(false);
    handleActivateEffect('reveal', config);
  };
  
  const handleGravitySave = (config: GravityEffectConfig) => {
    console.log('🎬 Gravity config saved:', config);
    setShowGravityModal(false);
    handleActivateEffect('gravity', config);
  };
  
  // Credits modal handlers
  const handleRecordingComplete = (blob: Blob) => {
    console.log('🎬 SolvePage: Recording complete callback fired!', {
      blobSize: blob.size,
      blobType: blob.type,
      solveMode: solveMode
    });
    
    setRecordedBlob(blob);
    setShowCreditsModal(true);
  };
  
  // Upload pre-captured thumbnail (follows create page pattern)
  const uploadMovieThumbnailBlob = async (movieId: string): Promise<string | null> => {
    try {
      if (!thumbnailBlob) {
        console.error('❌ No thumbnail blob available');
        return null;
      }
      
      console.log('📤 Uploading pre-captured thumbnail...');
      const { uploadMovieThumbnail } = await import('../../services/thumbnailService');
      const thumbnailUrl = await uploadMovieThumbnail(thumbnailBlob, movieId);
      return thumbnailUrl;
    } catch (error) {
      console.error('❌ Error uploading movie thumbnail:', error);
      return null;
    }
  };

  // Handle "Save to Gallery" - saves metadata + thumbnail
  const handleCreditsSubmit = async (credits: CreditsData) => {
    console.log('💾 Save to Gallery clicked:', credits);
    console.log('📊 Current state:', {
      solveMode,
      hasCurrentSolutionId: !!currentSolutionId,
      placedCount: placed.size,
      isComplete,
      hasActiveEffect: !!activeEffectId
    });
    
    setShowCreditsModal(false); // Close modal immediately (thumbnail already captured)
    
    try {
      // Get current effect configuration
      const effectConfig = activeEffectInstance?.getConfig ? activeEffectInstance.getConfig() : {};
      console.log('⚙️ Effect config:', effectConfig);
      
      // Get current user (optional in dev mode)
      const { data: userData } = await supabase.auth.getUser();
      
      // DEV MODE: Allow saving without login
      const userId = userData.user?.id || 'dev-user';
      
      // For manual solve, we need to save the solution first
      let solutionId = currentSolutionId;
      
      if (!solutionId && solveMode === 'manual' && placed.size > 0) {
        console.log('💾 Manual solution - saving to database first...');
        
        const solutionGeometry = Array.from(placed.values()).flatMap(piece => piece.cells);
        const placedPieces = Array.from(placed.values()).map(piece => ({
          uid: piece.uid,
          pieceId: piece.pieceId,
          orientationId: piece.orientationId,
          anchorSphereIndex: piece.anchorSphereIndex,
          cells: piece.cells,
          placedAt: piece.placedAt
        }));
        
        const { data: solutionData, error: solutionError } = await supabase
          .from('solutions')
          .insert({
            puzzle_id: puzzle!.id,
            solver_name: 'Anonymous',
            solution_type: 'manual',
            final_geometry: solutionGeometry,
            placed_pieces: placedPieces,
            actions: solveActions,
            solve_time_ms: solveStartTime ? Date.now() - solveStartTime : null,
            move_count: moveCount,
            notes: 'Manual solution'
          })
          .select()
          .single();
        
        if (solutionError) {
          console.error('❌ Failed to save solution:', solutionError);
          throw solutionError;
        }
        
        solutionId = solutionData.id;
        setCurrentSolutionId(solutionId);
        console.log('✅ Manual solution saved with ID:', solutionId);
      }
      
      // Check if we have a saved solution
      if (!solutionId) {
        console.error('❌ No solution ID available');
        setNotification('❌ No solution saved yet. Please complete the puzzle first.');
        setNotificationType('error');
        setTimeout(() => setNotification(null), 3000);
        return;
      }
      
      // Save movie metadata to database (with solution reference)
      console.log('💾 Saving movie to database with solution_id:', solutionId);
      const { data, error } = await supabase
        .from('movies')
        .insert({
          puzzle_id: puzzle!.id,
          solution_id: solutionId,
          title: credits.title || 'Untitled Movie',
          description: credits.description || null,
          challenge_text: credits.challengeText || 'Can you solve this puzzle?',
          creator_name: 'Anonymous',
          effect_type: activeEffectId || 'unknown',
          effect_config: effectConfig,
          credits_config: credits
        })
        .select()
        .single();
      
      if (error) {
        console.error('❌ Supabase error:', error);
        throw error;
      }
      
      console.log('✅ Movie saved to gallery:', data);
      
      // Upload pre-captured thumbnail
      if (data.id) {
        const thumbnailUrl = await uploadMovieThumbnailBlob(data.id);
        
        if (thumbnailUrl) {
          // Update movie record with thumbnail URL
          const { error: updateError } = await supabase
            .from('movies')
            .update({ thumbnail_url: thumbnailUrl })
            .eq('id', data.id);
          
          if (updateError) {
            console.error('❌ Failed to update thumbnail URL:', updateError);
          } else {
            console.log('✅ Thumbnail URL saved to database');
          }
        }
      }
      
      setNotification('🎬 Movie saved to gallery! ID: ' + data.id);
      setNotificationType('success');
      setTimeout(() => setNotification(null), 4000);
    } catch (error) {
      console.error('❌ Error saving movie:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      setNotification('❌ Failed to save: ' + message);
      setNotificationType('error');
      setTimeout(() => setNotification(null), 4000);
    }
  };
  
  // Handle "Download Video" - replays effect with recording
  const handleDownloadVideo = async (credits: CreditsData) => {
    console.log('📥 Download Video clicked:', credits);
    
    if (!activeEffectInstance || !activeEffectId) {
      setNotification('❌ No effect active');
      setNotificationType('error');
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    
    try {
      setShowCreditsModal(false);
      setNotification('🎬 Starting recording...');
      setNotificationType('info');
      
      // Reset and replay the effect
      console.log('🔄 Resetting effect for recording...');
      activeEffectInstance.reset();
      
      // Start recording
      const canvas = realSceneObjects?.renderer?.domElement;
      if (!canvas) {
        throw new Error('Canvas not found');
      }
      
      console.log('🎥 Starting canvas recording...');
      const stream = canvas.captureStream(30); // 30 FPS
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 5000000 // 5 Mbps
      });
      
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        console.log('✅ Recording complete, creating download...');
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = `${credits.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.webm`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setNotification('✅ Video downloaded!');
        setNotificationType('success');
        setTimeout(() => setNotification(null), 3000);
      };
      
      mediaRecorder.start();
      console.log('📹 Recording started');
      
      // Play the effect
      activeEffectInstance.play();
      
      // Stop recording when effect completes
      const originalOnComplete = activeEffectInstance.onComplete;
      if (activeEffectInstance.setOnComplete) {
        activeEffectInstance.setOnComplete(() => {
          console.log('🎬 Effect completed, stopping recording...');
          mediaRecorder.stop();
          
          // Restore original callback
          if (originalOnComplete && activeEffectInstance.setOnComplete) {
            activeEffectInstance.setOnComplete(originalOnComplete);
          }
        });
      }
      
    } catch (error) {
      console.error('❌ Recording error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      setNotification('❌ Recording failed: ' + message);
      setNotificationType('error');
      setTimeout(() => setNotification(null), 4000);
    }
  };
  
  // Tick loop for active effects - CRITICAL for animation
  useEffect(() => {
    if (!activeEffectInstance) return;
    
    let animationId: number;
    
    const tick = () => {
      const time = performance.now() / 1000;
      activeEffectInstance.tick(time);
      animationId = requestAnimationFrame(tick);
    };
    
    animationId = requestAnimationFrame(tick);
    console.log('🎬 Effect tick loop started');
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
        console.log('🎬 Effect tick loop stopped');
      }
    };
  }, [activeEffectInstance]);
  
  // Auto-play when effect is loaded for gallery movie playback
  // Plays once (loop disabled), then user has full control via transport bar
  useEffect(() => {
    if (!activeEffectInstance || !loadedMovie || !realSceneObjects) return;
    
    console.log('🎬 Gallery movie loaded: ensuring controls enabled, then auto-play');
    
    // Ensure orbit controls are enabled before playback starts
    if (realSceneObjects.controls) {
      realSceneObjects.controls.enabled = true;
      console.log('✅ Orbit controls explicitly enabled for gallery playback');
    }
    
    // Brief wait for effect initialization, then auto-play (camera already reset by now)
    setTimeout(() => {
      if (activeEffectInstance.play) {
        activeEffectInstance.play();
        console.log('▶️ Auto-play started (one cycle only) - camera reset already complete');
        
        // Force-enable controls immediately after play() in case it disabled them
        setTimeout(() => {
          if (realSceneObjects.controls) {
            realSceneObjects.controls.enabled = true;
            console.log('✅ Controls force-enabled immediately after play()');
          }
        }, 10);
      }
    }, 100); // Reduced delay since camera reset already happened earlier
    
    // Keep controls fully enabled during gallery playback
    const controlsKeepAlive = setInterval(() => {
      if (realSceneObjects.controls && loadedMovie) {
        const controls = realSceneObjects.controls;
        let wasDisabled = false;
        
        // Re-enable all control features if any are disabled
        if (!controls.enabled || !controls.enableRotate || !controls.enableZoom || !controls.enablePan) {
          controls.enabled = true;
          controls.enableRotate = true;
          controls.enableZoom = true;
          controls.enablePan = true;
          wasDisabled = true;
        }
        
        if (wasDisabled) {
          console.log('🔄 Re-enabled all control features during gallery playback');
        }
      }
    }, 200); // Check every 200ms (less aggressive since we also enable in effect)
    
    return () => clearInterval(controlsKeepAlive);
  }, [activeEffectInstance, loadedMovie, realSceneObjects]);
  
  // Sync auto-solution to placed state when entering movie mode
  useEffect(() => {
    if (solveMode === 'movie') {
      // Close the auto-solution modal when entering movie mode
      setShowAutoSolutionModal(false);
      
      // Sync solution if needed
      if (autoSolution && autoSolution.length > 0 && placed.size === 0) {
        console.log('🎬 Syncing auto-solution to placed state for movie mode');
        const placedMap = new Map<string, PlacedPiece>();
        autoSolution.forEach(piece => {
          placedMap.set(piece.uid, piece);
        });
        setPlaced(placedMap);
      }
    }
  }, [solveMode, autoSolution, placed.size]);
  
  // Auto-save solution for movie mode if not already saved (only when explicitly entering movie mode)
  useEffect(() => {
    const autoSaveSolutionForMovieMode = async () => {
      // Only auto-save if:
      // 1. In movie mode
      // 2. Have an auto-solution
      // 3. No current solution ID (not saved yet)
      // 4. Not already saving
      if (solveMode === 'movie' && autoSolution && autoSolution.length > 0 && !currentSolutionId && !isSaving && puzzle) {
        console.log('💾 Auto-saving solution for movie mode (no user name)...');
        setIsSaving(true);
        
        try {
          const solutionGeometry = autoSolution.flatMap(piece => piece.cells);
          
          // Serialize placed pieces for reconstruction
          const placedPieces = autoSolution.map(piece => ({
            uid: piece.uid,
            pieceId: piece.pieceId,
            orientationId: piece.orientationId,
            anchorSphereIndex: piece.anchorSphereIndex,
            cells: piece.cells,
            placedAt: piece.placedAt
          }));
          
          const { data, error } = await supabase
            .from('solutions')
            .insert({
              puzzle_id: puzzle.id,
              solver_name: currentUserName,
              solution_type: 'auto',
              final_geometry: solutionGeometry,
              placed_pieces: placedPieces,
              actions: solveActions, // Include action history for movie mode
              solve_time_ms: null,
              move_count: autoSolution.length,
              notes: 'Auto-generated solution (not saved via modal)'
            })
            .select()
            .single();
          
          if (error) throw error;
          
          console.log('✅ Auto-solution saved for movie mode!', data);
          setCurrentSolutionId(data.id); // Enable movie saving!
          showNotification('Solution auto-saved for movie creation!');
          
        } catch (err: any) {
          console.error('❌ Failed to auto-save solution:', err);
        } finally {
          setIsSaving(false);
        }
      }
    };
    
    autoSaveSolutionForMovieMode();
  }, [solveMode, autoSolution, currentSolutionId, isSaving, puzzle, solveActions]);
  
  // Save original state when entering movie mode
  useEffect(() => {
    if (solveMode === 'movie' && placed.size > 0) {
      // Save the current solved state before any effects are applied
      originalPlacedRef.current = new Map(placed);
      console.log('💾 Original solved state saved:', placed.size, 'pieces');
      
      // Capture thumbnail for movie if not already captured
      if (!thumbnailBlob) {
        console.log('📸 Capturing thumbnail for movie mode...');
        // Wait a frame to ensure scene is rendered
        requestAnimationFrame(() => {
          const canvas = document.querySelector('canvas');
          if (canvas) {
            import('../../services/thumbnailService').then(({ captureCanvasScreenshot }) => {
              captureCanvasScreenshot(canvas).then(blob => {
                setThumbnailBlob(blob);
                console.log('✅ Thumbnail captured for movie mode');
              }).catch(err => {
                console.error('❌ Failed to capture thumbnail:', err);
              });
            });
          }
        });
      }
    }
  }, [solveMode, placed.size, thumbnailBlob]);
  
  // Set onComplete callback for active effect (runs AFTER TransportBar sets its callback)
  useEffect(() => {
    if (activeEffectInstance && activeEffectInstance.setOnComplete) {
      console.log('🎬 SolvePage: Setting up onComplete callback...');
      
      // Get the existing callback that TransportBar may have set
      const transportBarCallback = activeEffectInstance.onComplete;
      console.log('🎬 SolvePage: Existing callback?', !!transportBarCallback);
      
      // Create our callback that shows the credits modal
      const ourCallback = () => {
        console.log('🎬🎬🎬 SolvePage: Effect completed, showing credits modal NOW!');
        console.log('🎬 Setting showCreditsModal to TRUE');
        setShowCreditsModal(true);
        console.log('🎬 showCreditsModal should now be true');
        
        // TransportBar will auto-sync via its useEffect when it detects state change
        // No need to force update - the state getter will return the new value
      };
      
      // If TransportBar set a callback, chain them together
      if (transportBarCallback && transportBarCallback !== ourCallback) {
        console.log('🎬 SolvePage: Chaining with existing TransportBar callback');
        activeEffectInstance.setOnComplete(() => {
          console.log('🎬 SolvePage: Chained callback executing - calling TransportBar first');
          transportBarCallback();
          console.log('🎬 SolvePage: Now calling our callback');
          ourCallback();
        });
      } else {
        // No existing callback, just set ours
        console.log('🎬 SolvePage: No existing callback, setting ours directly');
        activeEffectInstance.setOnComplete(ourCallback);
      }
      
      console.log('🎬 SolvePage: onComplete callback setup complete');
    } else {
      console.log('🎬 SolvePage: Cannot set callback - instance or setOnComplete missing');
    }
  }, [activeEffectInstance]);
  
  // Cleanup effect on mode switch
  useEffect(() => {
    if (solveMode !== 'movie' && activeEffectInstance) {
      handleClearEffect();
    }
  }, [solveMode]);
  
  // Check if solution is complete (manual mode) and auto-save it
  useEffect(() => {
    if (solveMode !== 'manual' || !puzzle || placed.size === 0) {
      if (isComplete) setIsComplete(false);
      return;
    }
    
    // Get all placed cells
    const placedCells = Array.from(placed.values()).flatMap(piece => piece.cells);
    
    // Check if we have the same number of cells as the target
    const complete = placedCells.length === cells.length;
    
    if (complete !== isComplete) {
      console.log('🎯 Solution completion status changed:', complete);
      setIsComplete(complete);
      
      if (complete && !currentSolutionId) {
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
            
            const { data: solutionData, error: solutionError } = await supabase
              .from('solutions')
              .insert({
                puzzle_id: puzzle.id,
                solver_name: 'Anonymous',
                solution_type: 'manual',
                final_geometry: solutionGeometry,
                placed_pieces: placedPieces,
                actions: solveActions,
                solve_time_ms: solveStartTime ? Date.now() - solveStartTime : null,
                move_count: moveCount,
                notes: 'Manual solution'
              })
              .select()
              .single();
            
            if (solutionError) {
              console.error('❌ Failed to save solution:', solutionError);
              showNotification('❌ Failed to save solution');
              return;
            }
            
            setCurrentSolutionId(solutionData.id);
            console.log('✅ Solution saved with ID:', solutionData.id);
            
            // Capture thumbnail after solution is complete
            const canvas = document.querySelector('canvas');
            if (canvas) {
              try {
                const { captureCanvasScreenshot } = await import('../../services/thumbnailService');
                const blob = await captureCanvasScreenshot(canvas);
                setThumbnailBlob(blob);
                console.log('📸 Thumbnail captured for manual solution');
              } catch (err) {
                console.error('❌ Failed to capture thumbnail:', err);
              }
            }
            
            // Show success modal
            setShowSuccessModal(true);
            showNotification('🎉 Puzzle solved and saved!');
          } catch (error) {
            console.error('❌ Error saving solution:', error);
          }
        };
        
        saveSolution();
      }
    }
  }, [placed, cells, solveMode, puzzle, isComplete, currentSolutionId, solveActions, solveStartTime, moveCount]);
  
  // Close effects dropdown when clicking outside
  useEffect(() => {
    if (!showEffectsDropdown) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is outside the dropdown container
      if (!target.closest('.effects-dropdown-container')) {
        console.log('🎬 Closing dropdown (clicked outside)');
        setShowEffectsDropdown(false);
      }
    };
    
    // Add delay to avoid closing from the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      console.log('🎬 Click-outside listener added');
    }, 300);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
      console.log('🎬 Click-outside listener removed');
    };
  }, [showEffectsDropdown]);

  // Loading state
  if (loading || isLoadingMovie) {
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
        <div style={{ fontSize: '3rem' }}>{isLoadingMovie ? '🎬' : '🧩'}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
          {isLoadingMovie ? 'Loading movie...' : 'Loading puzzle...'}
        </div>
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
          onClick={() => navigate('/gallery')}
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            background: '#2196F3',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>⊞</span>
          Back to Gallery
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
        {/* Left: Manual/Automated Toggle OR empty spacer */}
        {!loadedMovie && solveMode !== 'movie' ? (
          <div className="header-left">
            <button
              className="pill"
              onClick={() => {
                const newMode = solveMode === 'manual' ? 'automated' : 'manual';
                console.log(`mode:toggle from=${solveMode} to=${newMode}`);
                setSolveMode(newMode);
              }}
              disabled={isAutoSolving}
              style={{
                background: solveMode === 'manual' ? '#4caf50' : '#2196f3',
                color: '#fff',
                fontWeight: 600,
                border: 'none'
              }}
            >
              {solveMode === 'manual' ? '👤 Manual' : '🤖 Automated'}
            </button>
          </div>
        ) : !loadedMovie ? (
          <div className="header-left" />
        ) : null}
        
        {/* Movie Playback Header */}
        {loadedMovie && (
          <div className="header-left" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div style={{
              padding: '0.5rem 1rem',
              background: 'linear-gradient(135deg, #9c27b0, #673ab7)',
              borderRadius: '8px',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(156, 39, 176, 0.4)'
            }}>
              <span>▶️</span>
              <span>Now Playing: {loadedMovie.title}</span>
            </div>
          </div>
        )}

        {/* Center: Context-aware controls */}
        <div className="header-center">
          {solveMode === 'manual' ? (
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
          ) : solveMode === 'automated' ? (
            // Automated Mode Controls
            <>
              {/* Solve Button */}
              <button
                className="pill"
                onClick={() => {
                  if (isAutoSolving) {
                    handleStopAutoSolve();
                  } else if (autoSolution && engineHandleRef.current) {
                    handleResumeAutoSolve();
                  } else {
                    handleAutoSolve();
                  }
                }}
                title={
                  isAutoSolving 
                    ? "Stop solver" 
                    : "Find solution"
                }
                style={{ 
                  background: isAutoSolving ? '#f44336' : '#4caf50',
                  color: '#fff',
                  fontWeight: 600,
                  border: 'none'
                }}
              >
                {isAutoSolving ? '⏹ Stop' : '🔍 Solve'}
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
          ) : loadedMovie ? (
            // Movie Playback Mode - Show only play button (gallery mode)
            <>
              {activeEffectInstance && (
                <TransportBar
                  activeEffectId={activeEffectId}
                  isLoaded={loaded}
                  activeEffectInstance={activeEffectInstance}
                  galleryMode={true}
                  onRecordingComplete={handleRecordingComplete}
                />
              )}
            </>
          ) : (
            // Movie Creation Mode Controls
            <>
              {/* Effects Selector - Custom Dropdown */}
              <div className="effects-dropdown-container" style={{ position: 'relative' }}>
                <button
                  className="pill"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowEffectsDropdown(prev => !prev);
                  }}
                  style={{
                    background: activeEffectId ? '#9c27b0' : 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontWeight: 500,
                    border: activeEffectId ? 'none' : '1px solid rgba(255,255,255,0.2)',
                    position: 'relative',
                    paddingRight: '2rem'
                  }}
                >
                  {activeEffectId === 'turntable' ? '🔄 Turntable Effect' :
                   activeEffectId === 'reveal' ? '✨ Reveal Effect' :
                   activeEffectId === 'gravity' ? '🌍 Gravity Effect' :
                   '🎬 Choose an Effect'}
                  <span style={{ 
                    position: 'absolute', 
                    right: '0.5rem', 
                    top: '50%', 
                    transform: 'translateY(-50%)',
                    fontSize: '0.7rem',
                    opacity: 0.7
                  }}>▼</span>
                </button>
              </div>
              
              {/* Render dropdown via Portal to avoid parent overflow clipping */}
              {showEffectsDropdown && createPortal(
                  <div 
                    className="effects-dropdown-menu"
                    style={{
                    position: 'fixed',
                    top: '60px',
                    left: '170px',
                    background: '#2a2a2a',
                    border: '1px solid rgba(156,39,176,0.5)',
                    borderRadius: '8px',
                    minWidth: '180px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    zIndex: 9999,
                    overflow: 'hidden'
                  }}>
                    {[
                      { id: 'gravity', icon: '🌍', label: 'Gravity' },
                      { id: 'turntable', icon: '🔄', label: 'Turntable' },
                      { id: 'reveal', icon: '✨', label: 'Reveal' }
                    ].map(effect => (
                      <div
                        key={effect.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem',
                          cursor: 'pointer',
                          background: activeEffectId === effect.id ? 'rgba(156,39,176,0.3)' : 'transparent',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = activeEffectId === effect.id ? 'rgba(156,39,176,0.4)' : 'rgba(255,255,255,0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = activeEffectId === effect.id ? 'rgba(156,39,176,0.3)' : 'transparent'}
                      >
                        <span
                          onClick={() => {
                            // Click on effect name - apply with current/default settings
                            setShowEffectsDropdown(false);
                            if (activeEffectInstance && activeEffectId !== effect.id) {
                              console.log('🧹 Clearing existing effect before switching');
                              handleClearEffect();
                            }
                            // Activate effect directly with saved settings (don't open modal)
                            handleActivateEffect(effect.id, null);
                          }}
                          style={{
                            flex: 1,
                            color: '#fff',
                            fontWeight: 500,
                            fontSize: '0.95rem'
                          }}
                        >
                          {effect.icon} {effect.label}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Click on settings icon - open settings modal
                            setShowEffectsDropdown(false);
                            if (effect.id === 'turntable') setShowTurnTableModal(true);
                            else if (effect.id === 'reveal') setShowRevealModal(true);
                            else if (effect.id === 'gravity') setShowGravityModal(true);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'rgba(255,255,255,0.6)',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = '#9c27b0'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
                          title="Effect Settings"
                        >
                          ⚙️
                        </button>
                      </div>
                    ))}
                  </div>,
                  document.body
                )}
              
              {/* Transport Bar Controls - Simple Play button only */}
              {activeEffectInstance && (
                <TransportBar
                  activeEffectId={activeEffectId}
                  isLoaded={loaded}
                  activeEffectInstance={activeEffectInstance}
                  movieMode={true}
                  onRecordingComplete={handleRecordingComplete}
                />
              )}
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
          
          <button
            className="pill pill--chrome"
            onClick={() => navigate('/gallery')}
            title="Back to Gallery"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span style={{ fontSize: '1.1rem' }}>⊞</span>
            <span>Gallery</span>
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
              selectedPieceUid={(showAutoSolve || showMoviePlayer || solveMode === 'movie') ? null : selectedUid}
              onSelectPiece={(showAutoSolve || showMoviePlayer || solveMode === 'movie') ? noOpSelectPiece : setSelectedUid}
              containerOpacity={loadedMovie ? 0.15 : (hideContainerCellsDuringMovie ? 0 : (autoSolution ? 0 : (envSettings.emptyCells?.linkToEnvironment ? envSettings.material.opacity : (envSettings.emptyCells?.customMaterial?.opacity ?? 0.45))))}
              containerColor={envSettings.emptyCells?.linkToEnvironment ? envSettings.material.color : (envSettings.emptyCells?.customMaterial?.color ?? "#ffffff")}
              containerRoughness={envSettings.emptyCells?.linkToEnvironment ? envSettings.material.roughness : (envSettings.emptyCells?.customMaterial?.roughness ?? 0.35)}
              puzzleMode={mode}
              onCycleOrientation={undefined}
              onPlacePiece={undefined}
              onDeleteSelectedPiece={solveMode === 'movie' ? undefined : handleDeleteSelected}
              drawingCells={showAutoSolve ? [] : drawingCells}
              onDrawCell={undefined}
              hidePlacedPieces={showAutoSolve ? false : hidePlacedPieces}
              explosionFactor={explosionFactor}
              turntableRotation={turntableRotation}
              onInteraction={(showAutoSolve || solveMode === 'movie') ? undefined : handleInteraction}
              onSceneReady={setRealSceneObjects}
            />
            
            {/* Stats Overlay - Only in Manual Mode and when puzzle is not complete */}
            {solveMode === 'manual' && !showMoviePlayer && !isComplete && (
              <SolveStats
                moveCount={moveCount}
                isStarted={isStarted}
                challengeMessage={puzzle.challenge_message}
              />
            )}
            
            {/* Reveal / Explosion Overlay - Bottom Right Corner (hidden in movie mode) */}
            {solveMode !== 'movie' && (revealMax > 0 || explosionFactor > 0 || autoSolution) && (
              <div style={{
                position: 'absolute',
                bottom: window.innerWidth <= 768 ? '80px' : '10px',
                right: '10px',
                background: 'rgba(0, 0, 0, 0.85)',
                backdropFilter: 'blur(10px)',
                color: 'white',
                padding: window.innerWidth <= 768 ? '10px' : '12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 'bold',
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                width: window.innerWidth <= 768 ? 'calc(100vw - 30px)' : 'calc(100vw - 20px)',
                maxWidth: '200px',
                maxHeight: window.innerWidth <= 768 ? 'calc(100vh - 240px)' : 'calc(100vh - 140px)',
                overflowY: 'auto',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: '12px',
                zIndex: 50,
                boxSizing: 'border-box'
              }}>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ marginBottom: '6px', fontWeight: 600, fontSize: '13px' }}>
                    Reveal
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={autoSolution ? autoSolution.length : (revealMax || 1)}
                    step={1}
                    value={(autoSolution && autoConstructionIndex < autoSolution.length) ? autoConstructionIndex : revealK}
                    onChange={(e) => setRevealK(parseInt(e.target.value, 10))}
                    disabled={(revealMax === 0 && !autoSolution) || (!!autoSolution && autoConstructionIndex < autoSolution.length)}
                    style={{ 
                      width: '100%',
                      opacity: ((revealMax === 0 && !autoSolution) || (!!autoSolution && autoConstructionIndex < autoSolution.length)) ? 0.3 : 1
                    }}
                    aria-label="Reveal pieces"
                  />
                </div>
                
                <div>
                  <div style={{ marginBottom: '6px', fontWeight: 600, fontSize: '13px' }}>
                    Explosion
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
                </div>
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
                bottom: window.innerWidth <= 768 ? '90px' : '10px',
                left: '10px',
                background: 'rgba(0, 0, 0, 0.85)',
                backdropFilter: 'blur(10px)',
                color: 'white',
                padding: '10px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                fontFamily: 'monospace',
                pointerEvents: 'none',
                maxWidth: 'calc(50vw - 20px)'
              }}>
                <div><strong>Piece:</strong> {activePiece}</div>
                <div><strong>Fits:</strong> {fits.length > 0 ? `${fitIndex + 1} / ${fits.length}` : '0'}</div>
                {currentFit && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#bbb' }}>
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
            
            
            {/* Auto-Solution Saved Modal - only show in automated mode */}
            {showAutoSolutionModal && autoSolutionStats && solveMode === 'automated' && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'linear-gradient(135deg, #00c853, #00e676)',
                color: 'white',
                padding: '32px 40px',
                borderRadius: '16px',
                fontSize: '20px',
                fontWeight: 'bold',
                textAlign: 'center',
                boxShadow: '0 12px 40px rgba(0, 200, 83, 0.5)',
                zIndex: 1001,
                maxWidth: '400px',
                minWidth: '320px'
              }}>
                {/* Close button */}
                <button
                  onClick={() => setShowAutoSolutionModal(false)}
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
                  {currentUserName}
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
                    {autoSolutionStats.isDuplicate 
                      ? `✨ Solution #${autoSolutionStats.solutionNumber} Found!`
                      : `🌟 Unique Solution #${autoSolutionStats.solutionNumber} Found!`
                    }
                  </div>
                  <div><strong>📅 Date:</strong> {new Date().toLocaleDateString()}</div>
                  <div><strong>🕐 Time:</strong> {new Date().toLocaleTimeString()}</div>
                  {autoSolutionStats.isDuplicate ? (
                    <div><strong>🏆 Discovery:</strong> You are the {autoSolutionStats.autoSolveRank}{getOrdinalSuffix(autoSolutionStats.autoSolveRank)} person to find this solution</div>
                  ) : (
                    <div><strong>🌟 Status:</strong> First discovery of this solution!</div>
                  )}
                  <div><strong>📊 Total Solutions:</strong> {autoSolutionStats.totalSolutions} for this puzzle</div>
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.3)' }}>
                    <strong>🧩 Pieces:</strong> {autoSolution?.length || 0}
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
                  💡 Press <strong>▶️ Solve</strong> to find another solution!
                </div>
                
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    onClick={() => {
                      setShowAutoSolutionModal(false);
                      setSolveMode('movie');
                    }}
                    style={{
                      padding: '12px 24px',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      background: 'linear-gradient(135deg, #9c27b0, #673ab7)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: '0 4px 12px rgba(156, 39, 176, 0.4)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(156, 39, 176, 0.6)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(156, 39, 176, 0.4)';
                    }}
                  >
                    🎬 Make a Movie
                  </button>
                  
                  <button
                    onClick={() => setShowAutoSolutionModal(false)}
                    style={{
                      padding: '12px 24px',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      background: 'rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      border: '2px solid rgba(255, 255, 255, 0.5)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      backdropFilter: 'blur(10px)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                      e.currentTarget.style.transform = 'scale(1.05)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    Got it!
                  </button>
                </div>
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

      {/* Engine Settings Modal */}
      <EngineSettingsModal
        open={showEngineSettings}
        engineName="Engine 2"
        currentSettings={engineSettings}
        onClose={() => setShowEngineSettings(false)}
        onSave={(newSettings) => {
          setEngineSettings(newSettings);
          localStorage.setItem('solve.autoSolveSettings', JSON.stringify(newSettings));
          setShowEngineSettings(false);
          console.log('💾 Auto-solve settings saved:', newSettings);
        }}
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
        title="About Solve Mode"
      >
        <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#4b5563' }}>
          <p><strong>Manual Mode:</strong> Solve puzzles piece by piece with intuitive controls.</p>
          <p><strong>Automated Mode:</strong> Let the AI solver find solutions using advanced algorithms.</p>
          <p><strong>Movie Mode:</strong> Create cinematic presentations with visual effects.</p>
          <p style={{ marginTop: '1rem', padding: '0.75rem', background: '#f3f4f6', borderRadius: '6px' }}>
            💡 <strong>Tip:</strong> Use the gear icon (⚙️) to adjust environment settings like lighting and materials.
          </p>
        </div>
      </InfoModal>

      {/* Legacy modals removed - using integrated movie mode system */}

      {/* Notification Toast */}
      {notification && (
        <Notification
          message={notification}
          type={notificationType}
          onClose={() => setNotification(null)}
          duration={3000}
        />
      )}
      
      {/* Effect Modals - Movie Mode */}
      <TurnTableModal
        isOpen={showTurnTableModal}
        onClose={() => setShowTurnTableModal(false)}
        onSave={handleTurnTableSave}
      />
      
      <RevealModal
        isOpen={showRevealModal}
        onClose={() => setShowRevealModal(false)}
        onSave={handleRevealSave}
      />
      
      <GravityModal
        isOpen={showGravityModal}
        onClose={() => setShowGravityModal(false)}
        onSave={handleGravitySave}
      />
      
      {/* Credits Modal */}
      <CreditsModal
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        onSave={handleCreditsSubmit}
        onDownload={handleDownloadVideo}
        puzzleName={puzzle?.name}
        effectType={activeEffectId || undefined}
        recordedBlob={recordedBlob || undefined}
      />
      
      {/* Success Modal for Manual Solutions - matches auto-solve style */}
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
            {currentUserName}
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
              ✨ Puzzle Solved!
            </div>
            <div><strong>📅 Date:</strong> {new Date().toLocaleDateString()}</div>
            <div><strong>🕐 Time:</strong> {new Date().toLocaleTimeString()}</div>
            <div><strong>⏱️ Solve Time:</strong> {solveStartTime ? `${Math.floor((Date.now() - solveStartTime) / 1000)}s` : 'N/A'}</div>
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
            💡 Create a movie with effects to share your solution!
          </div>
          
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => {
                setShowSuccessModal(false);
                setSolveMode('movie');
              }}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                background: 'linear-gradient(135deg, #9c27b0, #673ab7)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(156, 39, 176, 0.4)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(156, 39, 176, 0.6)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(156, 39, 176, 0.4)';
              }}
            >
              🎬 Make a Movie
            </button>
            
            <button
              onClick={() => setShowSuccessModal(false)}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: '2px solid rgba(255, 255, 255, 0.5)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                backdropFilter: 'blur(10px)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
      
      {/* Challenge Overlay */}
      {hasChallenge && currentChallengeRef.current && (
        <ChallengeOverlay
          isVisible={showChallengeOverlay}
          onClose={() => {
            // X button - just close the overlay, stay on movie page
            console.log('✖️ Challenge overlay closed - staying on movie page');
            setShowChallengeOverlay(false);
          }}
          onBackToGallery={() => {
            // "Browse More Movies" button - return to movie gallery
            console.log('🎬 Browse More Movies clicked - returning to movie gallery');
            navigate('/gallery?tab=movies');
          }}
          challengeText={currentChallengeRef.current.text}
          movieTitle={currentChallengeRef.current.title}
          puzzleName={puzzle?.name || 'Puzzle'}
          creatorName={loadedMovie?.creator_name || "Puzzle Master"}
          solveDate={loadedMovie?.created_at || new Date().toISOString()}
          solveTime={loadedMovie?.solve_time_ms ? Math.floor(loadedMovie.solve_time_ms / 1000) : (solveStartTime ? Math.floor((Date.now() - solveStartTime) / 1000) : undefined)}
          piecesPlaced={loadedMovie?.pieces_placed || placed.size}
          totalPieces={Math.floor(cells.length / 4)}
          puzzleMode={loadedMovie?.puzzle_mode || (mode === 'oneOfEach' ? 'One of Each' : mode === 'unlimited' ? 'Unlimited' : 'Single Piece')}
          onTryPuzzle={() => {
            // "Accept Challenge!" - switch to manual mode for this puzzle
            console.log('🎯 Accept Challenge clicked - switching to manual mode');
            setShowChallengeOverlay(false);
            
            // Clear the effect first
            handleClearEffect();
            
            // Force a full page reload to ensure clean state transition from movie to manual mode
            if (puzzleId) {
              window.location.href = `/solve/${puzzleId}`;
            }
          }}
        />
      )}
      
      {/* Legacy SharedWelcomeModal removed */}
    </div>
  );
}

export default SolvePage;
