// Auto Solve Page - Dedicated page for automated puzzle solving
// Extracted from SolvePage.tsx - Blueprint v2 single responsibility pattern
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { IJK } from '../../types/shape';
import { ijkToXyz } from '../../lib/ijk';
import SceneCanvas from '../../components/SceneCanvas';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { supabase } from '../../lib/supabase';
import { usePuzzleLoader } from './hooks/usePuzzleLoader';
import { useOrientationService } from './hooks/useOrientationService';
import { useEngine2Solver } from './hooks/useEngine2Solver';
import { useGPUSolver } from './hooks/useGPUSolver';
import { useCompletionAutoSave } from './hooks/useCompletionAutoSave';
import { useAuth } from '../../context/AuthContext';
import { StudioSettingsService } from '../../services/StudioSettingsService';
import { EngineSettingsModal, type GPUSettings } from '../../components/EngineSettingsModal';
import { PresetSelectorModal } from '../../components/PresetSelectorModal';
import { InfoModal } from '../../components/InfoModal';
import { AutoSolveInfoHubModal } from './components/AutoSolveInfoHubModal';
import { AutoSolveHowToModal } from './components/AutoSolveHowToModal';
import { AutoSolveAboutPuzzleModal } from './components/AutoSolveAboutPuzzleModal';
import { Notification } from '../../components/Notification';
import { AutoSolveHeader } from './components/AutoSolveHeader';
import { AutoSolveSlidersPanel } from './components/AutoSolveSlidersPanel';
import { AutoSolveStatusCard } from './components/AutoSolveStatusCard';
import { AutoSolveSuccessModal } from './components/AutoSolveSuccessModal';
import { useDraggable } from '../../hooks/useDraggable';
import '../../styles/shape.css';

// Auto-solve Engine 2
import { engine2Solve, engine2Precompute, type Engine2RunHandle, type Engine2Settings } from '../../engines/engine2';
import type { PieceDB } from '../../engines/dfs2';
import type { StatusV2 } from '../../engines/types';
import { loadAllPieces } from '../../engines/piecesLoader';

// Stats logging
import { appendAutoSolveRun, downloadAutoSolveRunsCSV, clearAutoSolveRuns, type AutoSolveRunStats } from '../../utils/autoSolveStatsLogger';
import { AutoSolveResultsModal } from '../../components/AutoSolveResultsModal';
import { getAnonSessionId } from '../../utils/anonSession';
import { getPuzzleStats, type PuzzleStats } from '../../api/puzzleStats';
import { PuzzleStatsPanel } from '../../components/PuzzleStatsPanel';

// Environment settings
import { StudioSettings, DEFAULT_STUDIO_SETTINGS } from '../../types/studio';
import { ENVIRONMENT_PRESETS } from '../../constants/environmentPresets';

// Search space stats
import { computeSearchSpaceStats, type SearchSpaceStats } from '../../engines/engine2/searchSpace';

// Piece placement type
type PlacedPiece = {
  uid: string;
  pieceId: string;
  orientationId: string;
  anchorSphereIndex: 0 | 1 | 2 | 3;
  cells: IJK[];
  placedAt: number;
};

export const AutoSolvePage: React.FC = () => {
  const navigate = useNavigate();
  const { id: puzzleId } = useParams<{ id: string }>();
  const { puzzle, loading, error } = usePuzzleLoader(puzzleId);
  const {
    service: orientationService,
    loading: orientationsLoading,
    error: orientationsError,
  } = useOrientationService();
  
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
  
  // Auto-solve state
  const [showEngineSettings, setShowEngineSettings] = useState(false);
  const [piecesDb, setPiecesDb] = useState<PieceDB | null>(null);
  const [autoSolution, setAutoSolution] = useState<PlacedPiece[] | null>(null);
  const [autoConstructionIndex, setAutoConstructionIndex] = useState(0);
  const [autoSolveIntermediatePieces, setAutoSolveIntermediatePieces] = useState<PlacedPiece[]>([]);
  
  // Engine 2 settings with localStorage persistence
  const [engineSettings, setEngineSettings] = useState<Engine2Settings>(() => {
    // Detect mobile devices for performance optimization
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const defaultStatusInterval = isMobile ? 1000 : 250; // Slower updates on mobile
    
    const stored = localStorage.getItem('solve.autoSolveSettings');
    if (stored) {
      try {
        const settings = JSON.parse(stored);
        // Ensure statusIntervalMs is set appropriately for device
        if (!settings.statusIntervalMs) {
          settings.statusIntervalMs = defaultStatusInterval;
        }
        return settings;
      } catch {
        return { timeoutMs: 60000, statusIntervalMs: defaultStatusInterval };
      }
    }
    return { timeoutMs: 60000, statusIntervalMs: defaultStatusInterval };
  });

  // GPU solver settings with localStorage persistence
  const [gpuSettings, setGpuSettings] = useState<GPUSettings>(() => {
    const stored = localStorage.getItem('solve.gpuSettings');
    console.log('🎮 Loading GPU settings from localStorage:', stored);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        console.log('🎮 Parsed GPU settings:', parsed);
        return parsed;
      } catch {
        console.log('🎮 Failed to parse GPU settings, using defaults');
        return { enabled: false, prefixDepth: 4, threadBudget: 100000 };
      }
    }
    console.log('🎮 No GPU settings in localStorage, using defaults');
    return { enabled: false, prefixDepth: 4, threadBudget: 100000 };
  });
  
  // Ref to hold pending seed for Exhaustive mode (bypasses React state closure)
  const pendingSeedRef = useRef<number | null>(null);

  // Ref to hold one-shot engine setting overrides (bypasses React state closure)
  const pendingEngineSettingsOverrideRef = useRef<Partial<Engine2Settings> | null>(null);
  
  // Auth context for user ID (Phase 3: DB Integration)
  const { user } = useAuth();
  
  // Environment settings
  const settingsService = useRef(new StudioSettingsService());
  const [envSettings, setEnvSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<string>('metallic-light');
  // Info Hub modal system (auto-show on first load)
  const [showInfoHub, setShowInfoHub] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [showAboutPuzzle, setShowAboutPuzzle] = useState(false);
  const [showHowToAutoSolve, setShowHowToAutoSolve] = useState(false);
  
  // UI state
  const [notification, setNotification] = useState<string | null>(null);
  const [notificationType, setNotificationType] = useState<'info' | 'warning' | 'error' | 'success'>('info');
  const [autoSolutionStats, setAutoSolutionStats] = useState<any>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [currentSolutionId, setCurrentSolutionId] = useState<string | null>(null);
  
  // Reveal slider state
  const [revealK, setRevealK] = useState<number>(0);
  const [revealMax, setRevealMax] = useState<number>(0);
  
  // Explosion slider state
  const [explosionFactor, setExplosionFactor] = useState<number>(0); // 0 = assembled, 1 = exploded
  
  // Animation speed for solution playback (fixed at 1.0 for now)
  const autoConstructionSpeed = 1.0;
  
  // Load settings from database when user logs in (Phase 3: DB Integration)
  useEffect(() => {
    if (user?.id) {
      console.log('🔄 [AutoSolvePage] Loading settings from DB for user:', user.id);
      settingsService.current.loadSettingsFromDB(user.id).then(dbSettings => {
        if (dbSettings) {
          console.log('✅ [AutoSolvePage] DB settings loaded');
          setEnvSettings(dbSettings);
        }
      });
    }
  }, [user?.id]);

  // Save settings to database when they change (Phase 3: DB Integration)
  useEffect(() => {
    if (user?.id) {
      console.log('💾 [AutoSolvePage] Saving settings to DB');
      settingsService.current.saveSettingsToDB(user.id, envSettings);
    }
  }, [envSettings, user?.id]);

  // Run context tracking for stats logging (Task 2)
  const runStartMsRef = useRef<number>(0);
  const runModeRef = useRef<'exhaustive' | 'balanced' | 'fast'>('balanced');
  const runSeedRef = useRef<number>(0);
  const runTimeoutSecRef = useRef<number>(0);
  const runTailSizeRef = useRef<number>(60);
  const runTailEnableRef = useRef<boolean>(true);
  const runRestartCountRef = useRef<number>(0); // TODO: expose in StatusV2
  const runTailTriggeredRef = useRef<boolean>(false); // TODO: expose in StatusV2
  const runNodesAtSolutionRef = useRef<number | null>(null);
  const runTimeToSolutionMsRef = useRef<number | null>(null);
  const runLoggedRef = useRef<boolean>(false); // Prevent double logging
  const runIdRef = useRef<string>(''); // Correlate callbacks to current run
  const lastStatusRef = useRef<any>(null); // Authoritative latest status
  const solutionFoundThisRunRef = useRef<boolean>(false); // Track if onSolution fired
  const solverRunDbIdRef = useRef<string | null>(null); // Task 6: DB row ID for linking to solution
  
  // Results modal state (Task 4)
  const [lastRunResult, setLastRunResult] = useState<AutoSolveRunStats | null>(null);
  const [showResults, setShowResults] = useState(false);
  
  // Puzzle stats (community effort)
  const [puzzleStats, setPuzzleStats] = useState<PuzzleStats | null>(null);
  const [puzzleStatsLoading, setPuzzleStatsLoading] = useState(false);
  
  // Search space stats (for combinatorics display)
  const [searchSpaceStats, setSearchSpaceStats] = useState<SearchSpaceStats | null>(null);
  
  // Calculate piece sets needed based on puzzle size (1 set = 25 pieces × 4 spheres = 100 cells)
  const setsNeeded = useMemo(() => {
    if (!puzzle?.geometry?.length) return 1;
    return Math.ceil(puzzle.geometry.length / 100);
  }, [puzzle?.geometry?.length]);
  
  // Build piece inventory for multi-set puzzles
  const pieceInventory = useMemo(() => {
    if (setsNeeded <= 1 || !piecesDb) return undefined;
    
    // Each piece type gets 'setsNeeded' copies
    const inventory: Record<string, number> = {};
    for (const pieceId of piecesDb.keys()) {
      inventory[pieceId] = setsNeeded;
    }
    console.log(`📦 Multi-set puzzle: ${setsNeeded} sets, ${Object.keys(inventory).length * setsNeeded} total pieces`);
    return inventory;
  }, [setsNeeded, piecesDb]);
  
  // Draggable panels
  const successModalDraggable = useDraggable();

  // Load puzzle and setup scene
  useEffect(() => {
    if (!puzzle) return;
    
    console.log('📦 Loading puzzle for auto-solve:', puzzle.name);
    
    try {
      const geometry = puzzle.geometry;
      setCells(geometry);
      
      const v = computeViewTransforms(geometry, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
      setView(v);
      setLoaded(true);
      
      console.log(`✅ Puzzle loaded: ${geometry.length} cells`);
    } catch (err) {
      console.error('Failed to load puzzle:', err);
      setNotification('Failed to load puzzle geometry');
      setNotificationType('error');
    }
  }, [puzzle]);
  
  // Load pieces database for auto-solve
  useEffect(() => {
    if (!loaded) return;
    
    loadAllPieces().then(db => {
      console.log('✅ Pieces database loaded');
      setPiecesDb(db);
      
      // Compute search space stats (for combinatorics display)
      if (puzzle?.geometry && db) {
        try {
          // Convert geometry to [i,j,k] array format if needed
          const cellsArray: any = puzzle.geometry.map((c: any) => 
            Array.isArray(c) ? c : [c.i, c.j, c.k]
          );
          
          const stats = computeSearchSpaceStats(
            { cells: cellsArray, id: puzzle.id },
            db,
            {
              mode: 'unique',
              totalPieces: Math.floor(puzzle.geometry.length / 4),
            }
          );
          console.log('📊 [AutoSolvePage] Search space stats computed:', stats.upperBounds.fixedInventoryNoOverlap.sci);
          setSearchSpaceStats(stats);
        } catch (err) {
          console.error('❌ Failed to compute search space stats:', err);
        }
      }
    }).catch(err => {
      console.error('❌ Failed to load pieces:', err);
      setNotification('Failed to load pieces database');
      setNotificationType('error');
    });
  }, [loaded, puzzle]);

  // Fetch puzzle stats (community effort) - refetch when modal opens
  useEffect(() => {
    if (!puzzle?.id || !showInfo) return;
    
    const fetchStats = async () => {
      setPuzzleStatsLoading(true);
      try {
        const stats = await getPuzzleStats(puzzle.id);
        setPuzzleStats(stats);
        console.log('📊 Loaded puzzle stats:', stats);
      } catch (error) {
        console.error('Failed to load puzzle stats:', error);
        setPuzzleStats(null);
      } finally {
        setPuzzleStatsLoading(false);
      }
    };
    
    fetchStats();
  }, [puzzle?.id, showInfo]); // Refetch when modal opens

  // Convert Engine 2 placement to PlacedPiece format
  const convertPlacementToPieces = async (
    placement: any[]
  ): Promise<PlacedPiece[]> => {
    const { GoldOrientationService } = await import('../../services/GoldOrientationService');
    const svc = new GoldOrientationService();
    await svc.load();
    
    const pieces: PlacedPiece[] = [];
    
    for (const p of placement) {
      const orientations = svc.getOrientations(p.pieceId);
      if (!orientations || p.ori >= orientations.length) continue;
      
      const orientation = orientations[p.ori];
      const anchor: IJK = { i: p.t[0], j: p.t[1], k: p.t[2] };
      
      // Calculate actual cells by adding anchor to orientation offsets
      const cells: IJK[] = orientation.ijkOffsets.map((offset: any) => ({
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

  // Handle a new solution placement from the engine
  const handleEngineSolution = async (placement: any[]) => {
    // Convert to pieces
    const pieces = await convertPlacementToPieces(placement);
    setAutoSolution(pieces);
    setAutoConstructionIndex(0);

    // Prepare stats for success modal (ID will be set when saved)
    setAutoSolutionStats({
      solutionId: null,
      pieceCount: pieces.length,
      cellCount: pieces.flatMap(p => p.cells).length,
      savedAt: new Date().toLocaleString(),
    });
  };

  const resetSolutionState = () => {
    setAutoSolution(null);
    setAutoConstructionIndex(0);
    setAutoSolveIntermediatePieces([]);
    setAutoSolutionStats(null);
  };

  // Task 2: Initialize run context when run starts
  const handleRunStart = (settings: Engine2Settings): { runId: string } => {
    // Generate unique run ID (fallback for older browsers without crypto.randomUUID)
    try {
      runIdRef.current = crypto.randomUUID();
    } catch {
      runIdRef.current = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    const currentRunId = runIdRef.current;
    
    console.log('📊 Run started - initializing context, runId:', currentRunId);
    runStartMsRef.current = performance.now();
    runLoggedRef.current = false;
    lastStatusRef.current = null;
    solutionFoundThisRunRef.current = false;
    
    // Capture settings for this run
    runSeedRef.current = settings.seed ?? 0;
    runTimeoutSecRef.current = (settings.timeoutMs ?? 0) / 1000;
    runTailSizeRef.current = settings.tailSwitch?.tailSize ?? 60;
    runTailEnableRef.current = settings.tailSwitch?.enable ?? true;
    runRestartCountRef.current = 0; // TODO: get from StatusV2
    runTailTriggeredRef.current = false; // TODO: get from StatusV2
    runNodesAtSolutionRef.current = null;
    runTimeToSolutionMsRef.current = null;
    
    // Infer mode from settings (simple heuristic)
    if (settings.randomizeTies === false && settings.shuffleStrategy === 'none') {
      runModeRef.current = 'exhaustive';
    } else if (settings.randomizeTies === true && settings.shuffleStrategy !== 'none') {
      runModeRef.current = 'fast';
    } else {
      runModeRef.current = 'balanced';
    }
    
    return { runId: currentRunId };
  };

  // Task 3: Log stats when run ends
  const handleRunDone = (runId: string, summary: any) => {
    // Bug fix 3: Ignore callbacks from stale/wrong runs
    if (runId !== runIdRef.current) {
      console.log('📊 Ignoring onDone from stale run:', runId, 'current:', runIdRef.current);
      return;
    }
    
    if (runLoggedRef.current) {
      console.log('📊 Run already logged, skipping');
      return;
    }
    
    console.log('📊 DONE summary:', summary);
    
    // Source of truth mapping (fixes 1-3):
    // - stopReason: summary.reason (authoritative from engine)
    // - success: summary.solutions > 0 (not UI state)
    // - nodes/elapsedMs: summary values (not stale UI)
    // - bestPlaced: lastStatusRef with fallbacks
    const stats: AutoSolveRunStats = {
      timestampIso: new Date().toISOString(),
      puzzleId: puzzle?.id ?? 'unknown',
      puzzleName: puzzle?.name ?? 'Unknown',
      mode: runModeRef.current,
      seed: runSeedRef.current,
      timeoutSec: runTimeoutSecRef.current,
      
      // Fix 1: Use authoritative success from engine
      success: (summary.solutions ?? 0) > 0,
      stopReason: summary.reason ?? 'complete',
      
      // Fix 4: Time to solution captured at onSolution moment
      timeToSolutionMs: runTimeToSolutionMsRef.current,
      
      // Fix 2: Use authoritative engine values, not stale UI state
      elapsedMs: Math.round(summary.elapsedMs ?? 0),
      nodes: summary.nodes ?? 0,
      
      // Fix 4: Nodes at solution captured at onSolution moment
      nodesToSolution: runNodesAtSolutionRef.current,
      
      // Fix 3: Use bestPlaced from lastStatusRef (with fallbacks)
      bestPlaced: lastStatusRef.current?.bestPlaced ?? lastStatusRef.current?.placed ?? 0,
      totalPiecesTarget: lastStatusRef.current?.totalPiecesTarget ?? Math.floor((puzzle?.geometry?.length ?? 100) / 4),
      
      // Fix 5: Make tail optional until reliably tracked
      tailTriggered: lastStatusRef.current?.tailTriggered ?? false,
      tailSize: runTailSizeRef.current,
      restartCount: lastStatusRef.current?.restartCount ?? runRestartCountRef.current,
      
      // Settings from run context
      shuffleStrategy: engineSettings.shuffleStrategy ?? 'none',
      randomizeTies: engineSettings.randomizeTies ?? false,
      
      // Fix 2: Compute speed from authoritative summary values
      nodesPerSecAvg: summary.elapsedMs > 0 ? Math.round((summary.nodes / summary.elapsedMs) * 1000) : 0,
      
      // GPU solver: total solutions found
      solutionsFound: summary.solutions ?? 0,
    };
    
    appendAutoSolveRun(stats);
    runLoggedRef.current = true;
    
    // Task 5: Insert telemetry to Supabase
    insertSolverRunTelemetry(stats).catch(err => {
      console.error('Failed to insert solver_runs telemetry:', err);
      // Don't block UI on telemetry failure
    });
    
    // Show results modal
    setLastRunResult(stats);
    setShowResults(true);
  };

  // Task 5: Insert solver_runs row on run completion
  const insertSolverRunTelemetry = async (stats: AutoSolveRunStats): Promise<void> => {
    try {
      // Get user session (authenticated or anonymous)
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;
      const anonSessionId = userId ? null : getAnonSessionId();

      // Cap large numbers to PostgreSQL integer max (2,147,483,647)
      const INT_MAX = 2147483647;
      const capInt = (n: number) => Math.min(Math.round(n), INT_MAX);

      const { data, error } = await supabase
        .from('solver_runs')
        .insert({
          puzzle_id: puzzle?.id ?? null,
          solution_id: null, // Will be updated in Task 6 if solution saved
          user_id: userId,
          anon_session_id: anonSessionId,

          app_version: '50.14.0', // From package.json
          engine_name: 'engine2',

          mode: stats.mode,
          seed: Math.round(stats.seed),
          timeout_ms: Math.round(stats.timeoutSec * 1000),
          tail_enable: stats.tailSize > 0,
          tail_size: Math.round(stats.tailSize),
          shuffle_strategy: stats.shuffleStrategy,
          randomize_ties: stats.randomizeTies,

          success: stats.success,
          stop_reason: stats.stopReason === 'solution' ? 'complete' : stats.stopReason,
          solutions_found: stats.success ? 1 : 0,

          elapsed_ms: capInt(stats.elapsedMs),
          time_to_solution_ms: stats.timeToSolutionMs ? capInt(stats.timeToSolutionMs) : null,
          nodes_total: capInt(stats.nodes),
          nodes_to_solution: stats.nodesToSolution ? capInt(stats.nodesToSolution) : null,
          best_placed: Math.round(stats.bestPlaced),
          total_pieces_target: Math.round(stats.totalPiecesTarget),
          tail_triggered: stats.tailTriggered,
          restart_count: capInt(stats.restartCount),
        })
        .select('id')
        .single();

      if (error) {
        console.error('❌ Telemetry insert error:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        console.error('❌ Attempted insert data:', {
          puzzle_id: puzzle?.id,
          user_id: userId,
          anon_session_id: anonSessionId,
          mode: stats.mode,
          stop_reason: stats.stopReason,
        });
        return;
      }

      // Task 6: Store DB row ID for later linking to solution
      if (data?.id) {
        solverRunDbIdRef.current = data.id;
        console.log('✅ Telemetry logged, solver_run_id:', data.id);
      }
    } catch (error) {
      console.error('❌ Exception inserting telemetry:', error);
    }
  };

  // Task 4: Results modal actions
  const handleRunAgain = () => {
    // Generate new seed and start
    const newSeed = Date.now() % 1000000;
    setEngineSettings({ ...engineSettings, seed: newSeed });
    setShowResults(false);
    setTimeout(() => {
      handleAutoSolve();
    }, 100);
  };

  const handleSwitchMode = (mode: 'exhaustive' | 'balanced' | 'fast') => {
    // Open settings modal - user will configure and run
    setShowResults(false);
    setShowEngineSettings(true);
    // TODO: Could preset mode in modal if we add mode state there
  };

  // Track status updates for authoritative values
  const handleStatus = (runId: string, status: any) => {
    if (runId === runIdRef.current) {
      lastStatusRef.current = status;
    }
  };

  // Track when solution is found for this run
  const handleSolutionFound = (runId: string) => {
    if (runId === runIdRef.current) {
      solutionFoundThisRunRef.current = true;
      runNodesAtSolutionRef.current = lastStatusRef.current?.nodes ?? null;
      runTimeToSolutionMsRef.current = performance.now() - runStartMsRef.current;
    }
  };

  const handleClearStats = () => {
    if (window.confirm('Clear all auto-solve statistics? This cannot be undone.')) {
      clearAutoSolveRuns();
      setNotification('Statistics cleared');
      setNotificationType('info');
    }
  };

  // CPU Solver (Engine 2)
  const cpuSolver = useEngine2Solver({
    puzzle,
    loaded,
    piecesDb,
    engineSettings,
    pieceInventory, // Multi-set puzzle support
    onSolutionFound: handleEngineSolution,
    onResetSolution: resetSolutionState,
    notify: (message, type) => {
      setNotification(message);
      setNotificationType(type);
    },
    onRunStart: handleRunStart,
    onRunDone: handleRunDone,
    onStatus: handleStatus,
    onSolution: handleSolutionFound,
    pendingSeedRef,
    pendingSettingsOverrideRef: pendingEngineSettingsOverrideRef,
  });

  // GPU Solver
  const gpuSolver = useGPUSolver({
    puzzle,
    loaded,
    piecesDb,
    engineSettings: {
      prefixDepth: gpuSettings.prefixDepth,
      targetPrefixCount: gpuSettings.prefixCount ?? 100000,
      threadBudget: gpuSettings.threadBudget,
      useMRV: gpuSettings.useMRV ?? true,
      maxSolutions: engineSettings.maxSolutions ?? 1,
      timeoutMs: engineSettings.timeoutMs ?? 0,
      statusIntervalMs: engineSettings.statusIntervalMs ?? 250,
      fallbackToCPU: true,
      view: engineSettings.view,
    },
    onSolutionFound: handleEngineSolution,
    onResetSolution: resetSolutionState,
    notify: (message, type) => {
      setNotification(message);
      setNotificationType(type);
    },
    onRunStart: (_settings) => {
      // Adapt GPU settings to Engine2Settings format for run tracking
      return handleRunStart(engineSettings);
    },
    onRunDone: handleRunDone,
    onStatus: handleStatus,
    onSolution: handleSolutionFound,
  });

  // Debug: Log which solver will be used
  console.log('🔧 Solver selection:', gpuSettings.enabled ? 'GPU' : 'CPU', 'gpuSettings:', gpuSettings);

  // Unified solver interface - switches based on GPU enabled
  const {
    isAutoSolving,
    autoSolveStatus,
    autoSolutionsFound,
    handleAutoSolve,
    handleStopAutoSolve,
    handleResumeAutoSolve,
  } = gpuSettings.enabled ? {
    isAutoSolving: gpuSolver.isAutoSolving,
    autoSolveStatus: gpuSolver.autoSolveStatus as any,
    autoSolutionsFound: gpuSolver.autoSolutionsFound,
    handleAutoSolve: gpuSolver.handleAutoSolve,
    handleStopAutoSolve: gpuSolver.handleStopAutoSolve,
    handleResumeAutoSolve: gpuSolver.handleResumeAutoSolve,
  } : {
    isAutoSolving: cpuSolver.isAutoSolving,
    autoSolveStatus: cpuSolver.autoSolveStatus,
    autoSolutionsFound: cpuSolver.autoSolutionsFound,
    handleAutoSolve: cpuSolver.handleAutoSolve,
    handleStopAutoSolve: cpuSolver.handleStopAutoSolve,
    handleResumeAutoSolve: cpuSolver.handleResumeAutoSolve,
  };

  // Auto-save solution with thumbnail using same pattern as ManualSolvePage
  // CRITICAL: Only pass animated pieces (up to autoConstructionIndex) so thumbnail
  // is captured after animation completes, not immediately when solution is found
  const animatedPieces = autoSolution?.slice(0, autoConstructionIndex) || [];
  const { hasSetCompleteRef: _hasSetCompleteRef } = useCompletionAutoSave({
    puzzle,
    cells,
    placed: new Map(animatedPieces.map(p => [p.uid, p])),
    solveStartTime: autoSolutionStats?.startTime || null,
    moveCount: 0, // Auto-solve doesn't track moves
    solveActions: [],
    getSolveStats: () => ({
      total_moves: 0,
      undo_count: 0,
      hints_used: 0,
      solvability_checks_used: 0,
      duration_ms: autoSolutionStats?.solveTimeMs || 0,
    }),
    setIsComplete: () => {}, // Auto-solve handles completion differently
    setSolveEndTime: () => {},
    setRevealK: () => {},
    setShowCompletionCelebration: () => {},
    setCurrentSolutionId,
    setShowSuccessModal,
    setNotification,
    setNotificationType,
    maxSolutions: engineSettings.maxSolutions ?? 1,
  });


  // Solution playback animation
  useEffect(() => {
    if (!autoSolution || autoConstructionIndex >= autoSolution.length) return;
    
    const interval = setInterval(() => {
      setAutoConstructionIndex(prev => Math.min(prev + 1, autoSolution.length));
    }, 200 / autoConstructionSpeed);
    
    return () => clearInterval(interval);
  }, [autoSolution, autoConstructionIndex, autoConstructionSpeed]);

  // Note: Success modal is triggered by useCompletionAutoSave hook after animation completes
  // No need for duplicate trigger here

  // Keep reveal slider in sync with current solution
  useEffect(() => {
    if (autoSolution && autoSolution.length > 0) {
      setRevealMax(autoSolution.length);
      setRevealK(autoSolution.length); // show all initially
    } else {
      setRevealMax(0);
      setRevealK(0);
    }
  }, [autoSolution]);

  // Update intermediate pieces when auto-solve status changes (real-time progress)
  useEffect(() => {
    if (
      !isAutoSolving ||
      !autoSolveStatus?.stack ||
      !orientationService
    ) {
      setAutoSolveIntermediatePieces([]);
      return;
    }

    try {
      const svc = orientationService;
      const pieces: PlacedPiece[] = [];

      for (const p of autoSolveStatus.stack!) {
        const orientations = svc.getOrientations(p.pieceId);
        if (!orientations || p.ori >= orientations.length) {
          console.warn(
            `⚠️ Missing orientations for ${p.pieceId} ori ${p.ori}`
          );
          continue;
        }

        const orientation = orientations[p.ori];
        const anchor: IJK = { i: p.t[0], j: p.t[1], k: p.t[2] };

        const cells: IJK[] = orientation.ijkOffsets.map(
          (offset: any) => ({
            i: anchor.i + offset.i,
            j: anchor.j + offset.j,
            k: anchor.k + offset.k,
          })
        );

        // Validate cells before adding
        const hasInvalidCell = cells.some(c => 
          !isFinite(c.i) || !isFinite(c.j) || !isFinite(c.k)
        );
        
        if (hasInvalidCell) {
          console.warn(`⚠️ Skipping piece ${p.pieceId} with invalid cells:`, cells);
          continue;
        }

        // Check for duplicate cells within this piece
        const cellKeys = new Set<string>();
        let hasDuplicate = false;
        for (const cell of cells) {
          const key = `${cell.i},${cell.j},${cell.k}`;
          if (cellKeys.has(key)) {
            console.warn(`⚠️ Piece ${p.pieceId} has duplicate cell: ${key}`);
            hasDuplicate = true;
            break;
          }
          cellKeys.add(key);
        }
        
        if (hasDuplicate) {
          continue;
        }

        pieces.push({
          pieceId: p.pieceId,
          orientationId: orientation.orientationId,
          anchorSphereIndex: 0,
          cells,
          uid: `intermediate-${p.pieceId}-${pieces.length}`,
          placedAt: Date.now() + pieces.length,
        });
      }

      setAutoSolveIntermediatePieces(pieces);
    } catch (error) {
      console.error('Failed to convert stack to pieces:', error);
    }
  }, [isAutoSolving, autoSolveStatus, orientationService]);

  // Visible pieces for rendering (respects animation, intermediate search state, and reveal slider)
  const visiblePieces = useMemo(() => {
    // If we have a final solution, show it (with animation)
    if (autoSolution) {
      const animated = autoSolution.slice(0, autoConstructionIndex);
      if (revealMax > 0) {
        return animated.slice(0, revealK);
      }
      return animated;
    }
    
    // Otherwise, show intermediate search state in real-time
    if (isAutoSolving && autoSolveIntermediatePieces.length > 0) {
      return autoSolveIntermediatePieces;
    }
    
    return [];
  }, [autoSolution, autoConstructionIndex, revealK, revealMax, isAutoSolving, autoSolveIntermediatePieces]);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        color: '#fff'
      }}>
        Loading puzzle...
      </div>
    );
  }

  if (error || !puzzle) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        color: '#fff',
        gap: '1rem'
      }}>
        <div>❌ {error || 'Puzzle not found'}</div>
        <button 
          className="pill"
          onClick={() => navigate('/gallery')}
          style={{ background: 'rgba(255,255,255,0.1)' }}
        >
          ← Gallery
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Canvas - Full Screen Behind Everything */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
        {loaded && view && (
          <SceneCanvas
            cells={cells}
            view={view}
            editMode={false}
            mode="add"
            onCellsChange={() => {}}
            placedPieces={visiblePieces}
            hidePlacedPieces={false}
            explosionFactor={explosionFactor}
            alwaysShowContainer={true}
            settings={envSettings}
            visibility={{
              xray: false,
              emptyOnly: false,
              sliceY: { center: 0.5, thickness: 1.0 }
            }}
            containerOpacity={envSettings.emptyCells?.linkToEnvironment ? envSettings.material.opacity : (envSettings.emptyCells?.customMaterial?.opacity ?? 0.45)}
            containerColor={envSettings.emptyCells?.linkToEnvironment ? envSettings.material.color : (envSettings.emptyCells?.customMaterial?.color ?? "#ffffff")}
            containerRoughness={envSettings.emptyCells?.linkToEnvironment ? envSettings.material.roughness : (envSettings.emptyCells?.customMaterial?.roughness ?? 0.35)}
            puzzleMode="oneOfEach"
            onSelectPiece={() => {}}
          />
        )}
      </div>

      {/* Header - On Top */}
      <AutoSolveHeader
        isAutoSolving={isAutoSolving}
        hasPiecesDb={!!piecesDb}
        setsNeeded={setsNeeded}
        cellCount={puzzle?.geometry?.length}
        onSolveClick={() => {
          if (isAutoSolving) {
            handleStopAutoSolve();
          } else {
            const now = new Date();
            const timeSeed = now.getHours() * 10000 + now.getMinutes() * 100 + now.getSeconds();
            console.log('🔀 SEED:', timeSeed);
            const nextShuffleStrategy = engineSettings.shuffleStrategy === 'none'
              ? 'initial'
              : engineSettings.shuffleStrategy;
            pendingEngineSettingsOverrideRef.current = {
              seed: timeSeed,
              shuffleStrategy: nextShuffleStrategy,
            };
            setEngineSettings(prev => ({
              ...prev,
              seed: timeSeed,
              shuffleStrategy: nextShuffleStrategy,
            }));
            handleResumeAutoSolve();
          }
        }}
        onOpenEngineSettings={() => setShowEngineSettings(true)}
        onOpenEnvSettings={() => setShowSettings(true)}
        onOpenInfo={() => setShowInfoHub(true)}
        onGoHome={() => navigate('/gallery')}
      />

      {/* Solve Button - Bottom Center */}
      <div style={{
        position: 'fixed',
        bottom: revealMax > 0 ? '100px' : '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        transition: 'bottom 0.3s ease'
      }}>
        <button
          onClick={() => {
            if (isAutoSolving) {
              handleStopAutoSolve();
            } else {
              console.log('🚀 Solve clicked! GPU enabled:', gpuSettings.enabled);
              const now = new Date();
              const timeSeed = now.getHours() * 10000 + now.getMinutes() * 100 + now.getSeconds();
              console.log('🔀 SEED:', timeSeed);
              const nextShuffleStrategy = engineSettings.shuffleStrategy === 'none'
                ? 'initial'
                : engineSettings.shuffleStrategy;
              pendingEngineSettingsOverrideRef.current = {
                seed: timeSeed,
                shuffleStrategy: nextShuffleStrategy,
              };
              setEngineSettings(prev => ({
                ...prev,
                seed: timeSeed,
                shuffleStrategy: nextShuffleStrategy,
              }));
              handleResumeAutoSolve();
            }
          }}
          disabled={!piecesDb}
          style={{
            background: isAutoSolving ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff',
            fontWeight: 700,
            border: '1px solid rgba(255, 255, 255, 0.2)',
            fontSize: '18px',
            padding: '14px 32px',
            borderRadius: '8px',
            cursor: piecesDb ? 'pointer' : 'not-allowed',
            opacity: piecesDb ? 1 : 0.5,
            minWidth: '140px',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 12px rgba(0, 0,  0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          {isAutoSolving ? '⏹ Stop' : '🔍 Solve'}
        </button>
      </div>

      {/* Reveal / Explosion Controls - Bottom Bar */}
      <AutoSolveSlidersPanel
        revealK={revealK}
        revealMax={revealMax}
        explosionFactor={explosionFactor}
        onChangeRevealK={value => setRevealK(value)}
        onChangeExplosionFactor={value => setExplosionFactor(value)}
      />

      {/* Solver Status Display */}
      <AutoSolveStatusCard
        status={autoSolveStatus}
        solutionsFound={autoSolutionsFound}
        isAutoSolving={isAutoSolving}
        setsNeeded={setsNeeded}
      />

      {/* Success Modal */}
      <AutoSolveSuccessModal
          isOpen={showSuccessModal}
          stats={autoSolutionStats}
          onClose={() => setShowSuccessModal(false)}
          draggableRef={successModalDraggable.ref}
          draggableStyle={successModalDraggable.style}
        draggableHeaderStyle={successModalDraggable.headerStyle}
      />

      {/* Engine Settings Modal - No backdrop */}
      {showEngineSettings && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          pointerEvents: 'none'
        }}>
          <div style={{ pointerEvents: 'auto' }}>
            <EngineSettingsModal
              open={showEngineSettings}
              engineName={gpuSettings.enabled ? "GPU Solver" : "Engine 2"}
              currentSettings={engineSettings}
              onClose={() => setShowEngineSettings(false)}
              onSave={(newSettings, newGpuSettings) => {
                setEngineSettings(newSettings);
                localStorage.setItem('solve.autoSolveSettings', JSON.stringify(newSettings));
                
                // Save GPU settings if provided
                if (newGpuSettings) {
                  setGpuSettings(newGpuSettings);
                  localStorage.setItem('solve.gpuSettings', JSON.stringify(newGpuSettings));
                  console.log('🎮 GPU settings saved:', newGpuSettings);
                }
                
                setShowEngineSettings(false);
                console.log('💾 Auto-solve settings saved:', newSettings);
              }}
              puzzleId={puzzle?.id}
              puzzleGeometry={puzzle?.geometry}
              pieceDB={piecesDb}
              puzzleStats={puzzle && piecesDb ? {
                puzzleName: puzzle.name,
                containerCells: puzzle.geometry.length,
                totalSpheres: puzzle.sphere_count,
                pieceTypeCount: piecesDb.size,
              } : undefined}
              initialGpuSettings={gpuSettings}
            />
          </div>
        </div>
      )}

      {/* Environment Preset Selector Modal */}
      <PresetSelectorModal
        isOpen={showSettings}
        currentPreset={currentPreset}
        onClose={() => setShowSettings(false)}
        onSelectPreset={(settings, presetKey) => {
          setEnvSettings(settings);
          setCurrentPreset(presetKey);
          settingsService.current.saveSettings(settings);
        }}
      />

      {/* Info Modal */}
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title="Auto-Solve Page"
      >
        <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#4b5563' }}>
          <p><strong>Automated Puzzle Solving</strong></p>
          <p>This page uses the Engine 2 solver to automatically find solutions to the puzzle.</p>
          <ul style={{ marginLeft: '20px' }}>
            <li>Click <strong>Start Auto-Solve</strong> to begin searching</li>
            <li>Use <strong>Engine Settings</strong> to configure timeout and algorithms</li>
            <li>Solutions are automatically saved to the database</li>
            <li>Use the <strong>Speed</strong> slider to control playback speed</li>
            <li>Click <strong>Next Solution</strong> to find additional solutions</li>
          </ul>
        </div>
        
        {/* Search Space Combinatorics */}
        {searchSpaceStats && (
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: '#f3f4f6',
            borderRadius: '6px',
          }}>
            <p style={{ margin: 0, fontWeight: 600 }}>
              📊 Search Space Complexity
            </p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '12px' }}>
              <strong>Upper bound (no overlap):</strong>{' '}
              <code style={{ fontSize: '13px', fontWeight: 600 }}>
                {searchSpaceStats.upperBounds.fixedInventoryNoOverlap.sci}
              </code>
            </p>
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '11px', color: '#6b7280' }}>
              ~10^{Math.floor(searchSpaceStats.upperBounds.fixedInventoryNoOverlap.log10)} combinations
              ({searchSpaceStats.totalPlacements.toLocaleString()} total placements)
            </p>
          </div>
        )}
        
        {/* Community Puzzle Stats */}
        <PuzzleStatsPanel 
          stats={puzzleStats} 
          loading={puzzleStatsLoading}
        />
      </InfoModal>

      {/* Auto Solve Info Hub Modal System */}
      <AutoSolveInfoHubModal
        isOpen={showInfoHub}
        onClose={() => setShowInfoHub(false)}
        onOpenPuzzleDetails={() => setShowAboutPuzzle(true)}
        onOpenHowToAutoSolve={() => setShowHowToAutoSolve(true)}
      />

      <AutoSolveAboutPuzzleModal
        isOpen={showAboutPuzzle}
        onClose={() => setShowAboutPuzzle(false)}
        puzzle={puzzle}
        searchSpaceStats={searchSpaceStats}
      />

      <AutoSolveHowToModal
        isOpen={showHowToAutoSolve}
        onClose={() => setShowHowToAutoSolve(false)}
      />

      {/* Results Modal (Task 4) */}
      <AutoSolveResultsModal
        open={showResults}
        onClose={() => setShowResults(false)}
        result={lastRunResult}
        onRunAgain={handleRunAgain}
        onSwitchMode={handleSwitchMode}
        onExportCSV={downloadAutoSolveRunsCSV}
        onClearStats={handleClearStats}
      />

      {/* Notification */}
      {notification && (
        <Notification
          message={notification}
          type={notificationType}
          onClose={() => setNotification(null)}
        />
      )}
    </>
  );
};
