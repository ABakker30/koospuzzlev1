// Solve Page - Clean implementation with core solving logic from ManualPuzzlePage
import React, { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
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
import { getMovieById, incrementMovieViews, type MovieRecord } from '../../api/movies';
import { usePuzzleLoader } from './hooks/usePuzzleLoader';
import { useSolveActionTracker } from './hooks/useSolveActionTracker';
import { SolveStats } from './components/SolveStats';
import SaveSolutionModal from './components/SaveSolutionModal';
import { MoviePlayer, type PlaybackFrame } from './components/MoviePlayer';

// Movie Mode - Effects System (from Studio)
import { buildEffectContext, type EffectContext } from '../../studio/EffectContext';
import { getEffect } from '../../effects/registry';
import { TransportBar } from '../../studio/TransportBar';
import { TurnTableModal } from '../../effects/turntable/TurnTableModal';
import { RevealModal } from '../../effects/reveal/RevealModal';
import { GravityModal } from '../../effects/gravity/GravityModal';
import { CreditsModal, type CreditsData } from '../../components/CreditsModal';
import { MovieSuccessModal } from '../../components/MovieSuccessModal';
import { ChallengeOverlay } from '../../components/ChallengeOverlay';
import { SharedWelcomeModal } from '../../components/SharedWelcomeModal';
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
  
  // Reveal slider state (for visualization)
  const [revealK, setRevealK] = useState<number>(0);
  const [revealMax, setRevealMax] = useState<number>(0);
  
  // Explosion slider state (for visualization)
  const [explosionFactor, setExplosionFactor] = useState<number>(0); // 0 = assembled, 1 = exploded
  
  // Save modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);
  
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
  const engineHandleRef = useRef<Engine2RunHandle | null>(null);
  
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
    return {
      maxSolutions: 1,
      timeoutMs: 60000,
      moveOrdering: "mostConstrainedCell",
      pruning: { connectivity: true, multipleOf4: true, colorResidue: true, neighborTouch: true },
      statusIntervalMs: 500,
      seed: Date.now() % 100000,
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

  // Detect shared link and show welcome modal (with delay to ensure scene loads first)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const isShared = searchParams.get('shared') === 'true';
    const hasMovie = searchParams.get('movie');
    
    if (isShared && puzzle && loaded && view) {
      setIsSharedLink(true);
      console.log('🔗 Shared link detected, waiting for scene initialization...');
      // Longer delay to ensure the scene, geometry, and camera are fully initialized
      const timer = setTimeout(() => {
        setShowSharedWelcome(true);
        console.log('✅ Welcome modal shown for:', hasMovie ? 'movie' : 'puzzle');
      }, 1000); // Increased to 1 second to ensure scene is ready
      
      return () => clearTimeout(timer);
    }
  }, [location.search, puzzle, loaded, view]);

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
    // Don't check completion during movie playback or automated mode
    if (showMoviePlayer || loadedMovie || showAutoSolve) {
      return;
    }
    
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
      setShowCompletionCelebration(true); // Show congrats modal first
      
      // Set up reveal slider
      setRevealMax(placed.size);
      setRevealK(placed.size); // Show all by default
    } else if (!complete && isComplete) {
      setIsComplete(false);
      setShowCompletionCelebration(false);
      setRevealMax(0);
      setRevealK(0);
    }
  }, [placed, cells, isComplete, showMoviePlayer, loadedMovie, showAutoSolve]);

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
    setSelectedUid(null);
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
      
      // Serialize placed pieces for reconstruction
      const placedPieces = Array.from(placed.values()).map(piece => ({
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
          solution_type: 'manual',
          final_geometry: solutionGeometry,
          placed_pieces: placedPieces, // For movie playback
          actions: solveActions, // Save tracked actions for movie generation
          solve_time_ms: solveTimeMs,
          move_count: moveCount,
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
            // Enable reveal slider for after construction
            setRevealMax(pieces.length);
            setRevealK(pieces.length); // Show all initially after construction
            console.log(`🎬 Starting animated construction: ${pieces.length} pieces`);
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
    setAutoSolution(null);
    setAutoConstructionIndex(0);
    console.log('🛑 Auto-solve stopped');
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
  const handleActivateEffect = (effectId: string, config: TurnTableConfig | RevealConfig | GravityEffectConfig | null): any => {
    if (!effectContext) {
      console.error('❌ Cannot activate effect: EffectContext not available');
      return null;
    }

    try {
      const effectDef = getEffect(effectId);
      if (!effectDef || !effectDef.constructor) {
        console.error(`❌ Effect not found or no constructor: ${effectId}`);
        return null;
      }

      const instance = new effectDef.constructor();
      instance.init(effectContext);
      
      if (config) {
        instance.setConfig(config);
      }
      
      // Set up completion callback to show challenge
      console.log('🔍 Setting up effect completion. currentChallenge:', currentChallengeRef.current);
      if (instance.setOnComplete) {
        instance.setOnComplete(() => {
          console.log('🎬 Effect completed, checking for challenge...');
          console.log('🔍 currentChallenge at completion:', currentChallengeRef.current);
          if (currentChallengeRef.current) {
            console.log('🎯 Showing challenge overlay');
            setTimeout(() => {
              console.log('🎯 Actually calling setShowChallengeOverlay(true)');
              setShowChallengeOverlay(true);
            }, 1000); // Delay for effect
          } else {
            console.log('⚠️ No challenge to show');
          }
        });
      } else {
        console.log('⚠️ Effect does not support setOnComplete');
      }
      
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
      blobType: blob.type
    });
    setRecordedBlob(blob);
    setShowCreditsModal(true);
    console.log('🎬 SolvePage: Credits modal state set to true');
  };

  // Handle credits save (after recording completes)
  const handleCreditsSubmit = async (credits: CreditsData) => {
    console.log('💾 Credits submitted:', credits);
    setShowCreditsModal(false);
    
    if (!recordedBlob) {
      console.error('❌ No recorded blob available');
      return;
    }
    
    try {
      // Download the video
      const url = URL.createObjectURL(recordedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${credits.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Store challenge for playback
      currentChallengeRef.current = {
        text: credits.challengeText,
        title: credits.title
      };
      setHasChallenge(true);
      console.log('💾 Stored challenge:', currentChallengeRef.current);
      
      // Save movie to database
      await saveMovieToDatabase(credits);
      
      // Re-setup completion callback with the new challenge data
      if (activeEffectInstance && activeEffectInstance.setOnComplete) {
        // Save existing TransportBar callback
        const transportBarCallback = activeEffectInstance.onComplete;
        
        activeEffectInstance.setOnComplete(() => {
          console.log('🎬 Effect completed (updated callback), checking for challenge...');
          console.log('🔍 currentChallenge at completion:', currentChallengeRef.current);
          if (currentChallengeRef.current) {
            console.log('🎯 Showing challenge overlay');
            setTimeout(() => {
              console.log('🎯 Actually calling setShowChallengeOverlay(true)');
              setShowChallengeOverlay(true);
            }, 1000);
          }
          
          // Call TransportBar callback too
          if (transportBarCallback) {
            transportBarCallback();
          }
        });
        console.log('✅ Updated effect completion callback with challenge data');
      }
      
      // Show success modal
      setSavedMovieData({
        title: credits.title,
        challengeText: credits.challengeText,
        fileSize: recordedBlob.size
      });
      setShowSuccessModal(true);
      
      // Clean up
      setRecordedBlob(null);
      
    } catch (err) {
      console.error('❌ Failed to save movie:', err);
      alert('Failed to save movie');
    }
  };
  
  // Save movie metadata to database
  const saveMovieToDatabase = async (credits: CreditsData) => {
    if (!puzzle || !activeEffectId || !activeEffectInstance || !currentSolutionId) {
      console.warn('⚠️ Missing required data for database save (need solution_id)');
      return;
    }
    
    try {
      console.log('💾 Saving movie to database...');
      
      // Get effect configuration
      const effectConfig = activeEffectInstance.getConfig ? activeEffectInstance.getConfig() : {};
      const durationSec = effectConfig.durationSec || 20;
      
      // Get solve stats
      const solveTimeMs = solveStartTime ? Date.now() - solveStartTime : null;
      
      const movieData = {
        puzzle_id: puzzle.id,
        solution_id: currentSolutionId, // Required!
        title: credits.title,
        description: credits.description || '',
        challenge_text: credits.challengeText,
        creator_name: 'Puzzle Master', // TODO: Get from auth when available
        effect_type: activeEffectId,
        effect_config: effectConfig,
        credits_config: {
          showPuzzleName: credits.showPuzzleName,
          showEffectType: credits.showEffectType
        },
        duration_sec: durationSec,
        file_size_bytes: recordedBlob?.size || 0,
        solve_time_ms: solveTimeMs,
        move_count: moveCount,
        pieces_placed: placed.size,
        puzzle_mode: mode === 'oneOfEach' ? 'One of Each' : mode === 'unlimited' ? 'Unlimited' : 'Single Piece',
        is_public: true
      };
      
      const { data, error } = await supabase
        .from('movies')
        .insert(movieData)
        .select()
        .single();
      
      if (error) {
        console.error('❌ Database save failed:', error);
        // Don't throw - movie was still downloaded successfully
        return;
      }
      
      console.log('✅ Movie saved to database!', data);
      
    } catch (err) {
      console.error('❌ Failed to save movie to database:', err);
      // Don't throw - movie was still downloaded successfully
    }
  };

  // ...

  useEffect(() => {
    if (!activeEffectInstance || solveMode !== 'movie') return;

    let animationId: number;
    
    const tick = () => {
      const time = performance.now() / 1000;
      activeEffectInstance.tick(time);
      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [activeEffectInstance, solveMode]);
  
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
  
  // Save original state when entering movie mode
  useEffect(() => {
    if (solveMode === 'movie' && placed.size > 0) {
      // Save the current solved state before any effects are applied
      originalPlacedRef.current = new Map(placed);
      console.log('💾 Original solved state saved:', placed.size, 'pieces');
    }
  }, [solveMode, placed.size]);
  
  // Cleanup effect on mode switch
  useEffect(() => {
    if (solveMode !== 'movie' && activeEffectInstance) {
      handleClearEffect();
    }
  }, [solveMode]);
  
  // Close effects dropdown when clicking outside
  useEffect(() => {
    if (!showEffectsDropdown) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is outside the dropdown
      const dropdownEl = document.querySelector('[data-dropdown="effects"]');
      if (dropdownEl && !dropdownEl.contains(target)) {
        console.log('🎬 Closing dropdown (clicked outside)');
        setShowEffectsDropdown(false);
      }
    };
    
    // Add delay to avoid closing from the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      console.log('🎬 Click-outside listener added');
    }, 100);
    
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
        {/* Left: Mode Selector Dropdown (hidden during movie playback) */}
        {!loadedMovie && (
          <div className="header-left" style={{ position: 'relative' }}>
            <select
              value={solveMode}
              onChange={(e) => {
                const newMode = e.target.value as SolveMode;
                if (newMode === 'movie' && !currentSolutionId) {
                  return; // Prevent switching to movie mode without solution
                }
                setSolveMode(newMode);
                if (newMode === 'automated' && !autoSolution && !isAutoSolving) {
                  handleAutoSolve();
                }
              }}
              disabled={isAutoSolving}
              style={{
                padding: '0.5rem 2rem 0.5rem 0.75rem',
                background: solveMode === 'movie' ? '#9c27b0' : '#4caf50',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.95rem',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                appearance: 'none',
                minWidth: '140px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'white\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.5rem center'
              }}
            >
              <option value="manual">👤 Manual ▼</option>
              <option value="automated" disabled={isAutoSolving}>
                {isAutoSolving ? '⏳ Solving...' : '🤖 Automated ▼'}
              </option>
              <option value="movie" disabled={!currentSolutionId}>
                🎬 Movie {!currentSolutionId ? '🔒' : '▼'}
              </option>
            </select>
          </div>
        )}
        
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
              {/* Effects Dropdown */}
              <select
                value={activeEffectId || ''}
                onChange={(e) => {
                  const effectType = e.target.value;
                  if (!effectType) return;
                  
                  // Clear existing effect before switching
                  if (activeEffectInstance && activeEffectId !== effectType) {
                    handleClearEffect();
                  }
                  
                  // Open the appropriate modal
                  if (effectType === 'turntable') setShowTurnTableModal(true);
                  else if (effectType === 'reveal') setShowRevealModal(true);
                  else if (effectType === 'gravity') setShowGravityModal(true);
                }}
                style={{
                  padding: '0.5rem 2rem 0.5rem 0.75rem',
                  background: activeEffectId ? '#9c27b0' : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  appearance: 'none',
                  minWidth: '150px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'white\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.5rem center'
                }}
              >
                <option value="" disabled style={{ color: '#999' }}>Select Effect... ▼</option>
                <option value="turntable" style={{ color: '#000', background: '#fff' }}>🔄 Turntable ▼</option>
                <option value="reveal" style={{ color: '#000', background: '#fff' }}>✨ Reveal ▼</option>
                <option value="gravity" style={{ color: '#000', background: '#fff' }}>🌍 Gravity ▼</option>
              </select>
              
              {/* Transport Bar Controls - Integrated */}
              {activeEffectInstance && (
                <TransportBar
                  activeEffectId={activeEffectId}
                  isLoaded={loaded}
                  activeEffectInstance={activeEffectInstance}
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
              containerOpacity={loadedMovie ? 0.15 : (hideContainerCellsDuringMovie ? 0 : (autoSolution ? 0 : 0.45))}
              containerColor="#ffffff"
              containerRoughness={0.35}
              puzzleMode={mode}
              onCycleOrientation={undefined}
              onPlacePiece={undefined}
              onDeleteSelectedPiece={solveMode === 'movie' ? undefined : undefined}
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
            
            
            {/* Reveal and Explosion Sliders - Conditional visibility */}
            {/* Manual mode: always visible | Automated mode: only when solution found | Movie mode: hidden */}
            {loaded && (!showAutoSolve || autoSolution) && !showMoviePlayer && solveMode !== 'movie' && (
              <div style={{
                position: 'absolute',
                bottom: '60px',
                right: '10px',
                left: 'auto',
                background: 'rgba(0, 0, 0, 0.85)',
                backdropFilter: 'blur(10px)',
                color: 'white',
                padding: '10px',
                borderRadius: '8px',
                width: 'calc(100vw - 20px)',
                maxWidth: '220px',
                maxHeight: 'calc(100vh - 140px)',
                overflowY: 'auto',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: '12px',
                zIndex: 50,
                boxSizing: 'border-box'
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ marginBottom: '4px', fontWeight: 600 }}>
                    Reveal: {(revealMax > 0 || autoSolution) ? `${revealK} / ${autoSolution?.length || revealMax}` : 'All'}
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
                  <div style={{ fontSize: '10px', color: '#bbb', marginTop: '2px' }}>
                    {(revealMax > 0 || autoSolution) ? 'Show pieces in placement order' : 'Available when solved'}
                  </div>
                </div>
                
                <div style={{ marginTop: '4px' }}>
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
                  <div style={{ fontSize: '10px', color: '#bbb', marginTop: '2px' }}>
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
                
                <div style={{ fontSize: '56px', marginBottom: '16px' }}>🎉</div>
                <div style={{ fontSize: '28px', fontWeight: 700, marginBottom: '24px', color: '#ffffff' }}>
                  Congratulations!
                </div>
                <div style={{ 
                  fontSize: '16px', 
                  fontWeight: 'normal', 
                  lineHeight: '2', 
                  textAlign: 'left',
                  background: 'rgba(0,0,0,0.2)',
                  padding: '20px',
                  borderRadius: '8px',
                  marginBottom: '24px',
                  minWidth: '280px',
                  color: '#ffffff'
                }}>
                  <div><strong>📅 Date:</strong> {new Date().toLocaleDateString()}</div>
                  <div><strong>🕐 Time:</strong> {new Date().toLocaleTimeString()}</div>
                  <div><strong>⏱️ Duration:</strong> {solveStartTime ? Math.floor((Date.now() - solveStartTime) / 1000) : 0}s</div>
                  <div><strong>🎯 Moves:</strong> {moveCount}</div>
                  <div><strong>🧩 Pieces Placed:</strong> {placed.size}</div>
                  <div><strong>📦 Cells Filled:</strong> {cells.length}</div>
                </div>
                <button
                  onClick={() => {
                    setShowCompletionCelebration(false);
                    setShowSaveModal(true);
                  }}
                  style={{
                    padding: '14px 32px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    background: 'linear-gradient(135deg, #4caf50, #45a049)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)',
                    transition: 'transform 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
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
        title={loadedMovie ? "🎬 Movie Gallery - About" : "Solve Mode - How to Play"}
        onClose={() => setShowInfoModal(false)}
      >
        {loadedMovie ? (
          // Movie playback mode info
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.95rem' }}>
            <p style={{ margin: 0 }}><strong>🎬 What are Movies?</strong></p>
            <p style={{ margin: 0 }}>Movies showcase puzzle solutions with stunning visual effects like gravity drops, turntable spins, and reveal animations!</p>
            
            <p style={{ margin: 0, marginTop: '0.5rem' }}><strong>🎯 How to Create Movies</strong></p>
            <ol style={{ margin: 0, paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li><strong>Solve a Puzzle:</strong> Complete any puzzle in Manual or Automated mode</li>
              <li><strong>Switch to Movie Mode:</strong> Select "Movie" from the mode dropdown</li>
              <li><strong>Choose an Effect:</strong> Pick Turntable, Reveal, or Gravity</li>
              <li><strong>Configure & Record:</strong> Customize settings and hit record</li>
              <li><strong>Share:</strong> Save your movie and share it with the community!</li>
            </ol>
            
            <div style={{ 
              marginTop: '1rem', 
              padding: '0.75rem', 
              background: '#f3e5f5', 
              borderLeft: '3px solid #9c27b0',
              borderRadius: '4px',
              fontSize: '0.875rem',
              color: '#6a1b9a'
            }}>
              <strong>💡 Tip:</strong> Accept the challenge at the end of this movie to try solving the puzzle yourself!
            </div>
            
            <p style={{ margin: 0, marginTop: '0.5rem' }}><strong>🎮 Controls</strong></p>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <li>▶️ <strong>Play:</strong> Replay the movie effect</li>
              <li>🖱️ <strong>Orbit:</strong> Click and drag to rotate the view</li>
              <li>🏆 <strong>Challenge:</strong> Accept to try solving it yourself</li>
            </ul>
          </div>
        ) : (
          // Regular solve mode info
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
        )}
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
          // Persist to localStorage
          localStorage.setItem('solve.autoSolveSettings', JSON.stringify(newSettings));
          console.log('✅ Auto-solve settings saved to localStorage');
          setShowEngineSettings(false);
        }}
      />

      {/* Environment Settings Modal (3D Scene) */}
      {showEnvSettings && (
        <SettingsModal
          settings={envSettings}
          onSettingsChange={(newSettings) => {
            console.log('🔄 Settings updated (NOT saved yet):', {
              metalness: newSettings.material?.metalness,
              roughness: newSettings.material?.roughness
            });
            // Update state for real-time preview, but DON'T save yet
            setEnvSettingsState(newSettings);
          }}
          onClose={() => {
            // ONLY save when user closes modal
            console.log('💾 Saving settings to localStorage on modal close');
            settingsService.current.saveSettings(envSettingsState);
            console.log('✅ Environment settings saved');
            setShowEnvSettings(false);
          }}
        />
      )}

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
        onClose={() => {
          setShowCreditsModal(false);
          setRecordedBlob(null);
        }}
        onSave={handleCreditsSubmit}
        puzzleName={puzzle?.name || 'Puzzle'}
        effectType={activeEffectId || 'effect'}
        recordedBlob={recordedBlob || undefined}
      />
      
      {/* Success Modal */}
      <MovieSuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        movieTitle={savedMovieData?.title || 'Movie'}
        challengeText={savedMovieData?.challengeText || ''}
        fileSize={savedMovieData?.fileSize || 0}
        effectType={activeEffectId || 'effect'}
      />
      
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
      
      {/* Movie Player */}
      {showMoviePlayer && (
        <MoviePlayer
          actions={solveActions}
          totalPieces={Math.floor(cells.length / 4)}
          puzzleName={puzzle?.name || 'Puzzle Solution'}
          puzzleMode={mode}
          moveCount={moveCount}
          onClose={() => {
            // Restore original state
            if (originalPlacedRef.current.size > 0) {
              setPlaced(new Map(originalPlacedRef.current));
              setRevealK(originalPlacedRef.current.size);
              setExplosionFactor(0);
            }
            // Reset movie-specific states
            setHideContainerCellsDuringMovie(false);
            setTurntableRotation(0);
            setShowMoviePlayer(false);
          }}
          onPlaybackFrame={(frame) => {
            // Handle playback frame updates
            console.log('🎬 Playback frame:', frame);
            
            // Hide/show container cells based on frame setting
            if (frame.hideContainerCells !== undefined) {
              setHideContainerCellsDuringMovie(frame.hideContainerCells);
            }
            
            // Update turntable rotation
            if (frame.turntableRotation !== undefined) {
              setTurntableRotation(frame.turntableRotation);
            }
            
            if (frame.mode === 'action-replay') {
              // Action replay: Reconstruct solution step by step
              // Show only the pieces up to current step
              const placeActions = solveActions.filter(a => a.type === 'PLACE_PIECE');
              const actionsToShow = placeActions.slice(0, frame.currentStep);
              
              // Reconstruct placed pieces from actions
              const replayPieces = new Map<string, PlacedPiece>();
              actionsToShow.forEach((action, index) => {
                if (action.data.cells && action.data.pieceId && action.data.orientation) {
                  const uid = action.data.uid || `replay-${index}`;
                  const piece: PlacedPiece = {
                    uid,
                    pieceId: action.data.pieceId,
                    orientationId: String(action.data.orientation),
                    anchorSphereIndex: 0,
                    cells: action.data.cells,
                    placedAt: action.timestamp,
                  };
                  replayPieces.set(uid, piece);
                }
              });
              
              // Update placed pieces to show replay state
              setPlaced(replayPieces);
              
              // Set reveal to show all replay pieces
              setRevealK(replayPieces.size);
              setExplosionFactor(0);
              
            } else if (frame.mode === 'reveal-animation' || frame.mode === 'explosion-combo') {
              // Update reveal slider
              if (frame.revealK !== undefined) {
                setRevealK(frame.revealK);
              }
              
              // Update explosion factor for combo mode
              if (frame.explosionFactor !== undefined) {
                setExplosionFactor(frame.explosionFactor);
              }
            }
          }}
        />
      )}

      {/* Shared Welcome Modal */}
      <SharedWelcomeModal
        isOpen={showSharedWelcome}
        onClose={() => setShowSharedWelcome(false)}
        type={loadedMovie ? 'movie' : 'puzzle'}
        puzzleName={puzzle?.name}
        creatorName={puzzle?.creator_name}
        sphereCount={cells?.length}
        movieTitle={loadedMovie?.title}
        effectType={loadedMovie?.effect_type}
      />
    </div>
  );
}

export default SolvePage;
