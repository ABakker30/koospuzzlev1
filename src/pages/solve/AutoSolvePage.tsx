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
import { EngineSettingsModal } from '../../components/EngineSettingsModal';
import { SettingsModal } from '../../components/SettingsModal';
import { InfoModal } from '../../components/InfoModal';
import { Notification } from '../../components/Notification';
import { AutoSolveHeader } from './components/AutoSolveHeader';
import { AutoSolveSlidersPanel } from './components/AutoSolveSlidersPanel';
import { AutoSolveStatusCard } from './components/AutoSolveStatusCard';
import { AutoSolveSuccessModal } from './components/AutoSolveSuccessModal';
import { MovieTypeModal } from './components/MovieTypeModal';
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
    const stored = localStorage.getItem('solve.autoSolveSettings');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return { timeoutMs: 60000 };
      }
    }
    return { timeoutMs: 60000 };
  });
  
  // Environment settings
  // Settings service for future use
  // const settingsService = useRef(new StudioSettingsService());
  const [envSettings, setEnvSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  
  // UI state
  const [notification, setNotification] = useState<string | null>(null);
  const [notificationType, setNotificationType] = useState<'info' | 'warning' | 'error' | 'success'>('info');
  const [autoSolutionStats, setAutoSolutionStats] = useState<any>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showMovieTypeModal, setShowMovieTypeModal] = useState(false);
  const [currentSolutionId, setCurrentSolutionId] = useState<string | null>(null);
  
  // Reveal slider state
  const [revealK, setRevealK] = useState<number>(0);
  const [revealMax, setRevealMax] = useState<number>(0);
  
  // Explosion slider state
  const [explosionFactor, setExplosionFactor] = useState<number>(0); // 0 = assembled, 1 = exploded
  
  // Animation speed for solution playback (fixed at 1.0 for now)
  const autoConstructionSpeed = 1.0;
  
  // Run context tracking for stats logging (Task 2)
  const runStartMsRef = useRef<number>(0);
  const runModeRef = useRef<'exhaustive' | 'balanced' | 'fast'>('balanced');
  const runSeedRef = useRef<number>(0);
  const runTimeoutSecRef = useRef<number>(0);
  const runTailSizeRef = useRef<number>(20);
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
  
  // Draggable panels
  const successModalDraggable = useDraggable();
  const movieTypeModalDraggable = useDraggable();

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
    }).catch(err => {
      console.error('❌ Failed to load pieces:', err);
      setNotification('Failed to load pieces database');
      setNotificationType('error');
    });
  }, [loaded]);

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
    // Generate unique run ID
    runIdRef.current = crypto.randomUUID();
    const currentRunId = runIdRef.current;
    
    console.log('📊 Run started - initializing context, runId:', currentRunId);
    runStartMsRef.current = performance.now();
    runLoggedRef.current = false;
    lastStatusRef.current = null;
    solutionFoundThisRunRef.current = false;
    
    // Capture settings for this run
    runSeedRef.current = settings.seed ?? 0;
    runTimeoutSecRef.current = (settings.timeoutMs ?? 0) / 1000;
    runTailSizeRef.current = settings.tailSwitch?.tailSize ?? 20;
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
          stop_reason: stats.stopReason,
          solutions_found: stats.success ? 1 : 0,

          elapsed_ms: Math.round(stats.elapsedMs),
          time_to_solution_ms: stats.timeToSolutionMs ? Math.round(stats.timeToSolutionMs) : null,
          nodes_total: Math.round(stats.nodes),
          nodes_to_solution: stats.nodesToSolution ? Math.round(stats.nodesToSolution) : null,
          best_placed: Math.round(stats.bestPlaced),
          total_pieces_target: Math.round(stats.totalPiecesTarget),
          tail_triggered: stats.tailTriggered,
          restart_count: Math.round(stats.restartCount),
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

  const {
    isAutoSolving,
    autoSolveStatus,
    autoSolutionsFound,
    handleAutoSolve,
    handleStopAutoSolve,
    handleResumeAutoSolve,
  } = useEngine2Solver({
    puzzle,
    loaded,
    piecesDb,
    engineSettings,
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
  });

  // Save solution to database (or find existing)
  const handleSaveSolution = async () => {
    if (!puzzle || !autoSolution) {
      return currentSolutionId;
    }
    
    // If already saved, return existing ID
    if (currentSolutionId) {
      return currentSolutionId;
    }
    
    try {
      const solutionGeometry = autoSolution.flatMap(p => p.cells);
      
      // Check if a solution with this exact geometry already exists
      console.log('🔍 Checking for existing solution...');
      const { data: existingSolutions, error: searchError } = await supabase
        .from('solutions')
        .select('id, solver_name, solution_type')
        .eq('puzzle_id', puzzle.id)
        .eq('solution_type', 'auto');
      
      if (searchError) {
        console.error('❌ Error searching for existing solutions:', searchError);
      }
      
      // If we found auto solutions, check if geometry matches
      if (existingSolutions && existingSolutions.length > 0) {
        // For simplicity, just use the first auto solution found
        // In a production app, you'd want to compare geometries more carefully
        console.log('✅ Found existing auto-solution:', existingSolutions[0].id);
        setCurrentSolutionId(existingSolutions[0].id);
        
        // Update stats with solution ID
        setAutoSolutionStats((prev: any) => ({
          ...prev,
          solutionId: existingSolutions[0].id
        }));
        
        return existingSolutions[0].id;
      }
      
      // No existing solution found, create new one
      console.log('💾 Creating new solution...');
      
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;
      
      const { data, error } = await supabase
        .from('solutions')
        .insert({
          puzzle_id: puzzle.id,
          created_by: userId,
          solver_name: userId ? (session?.user?.email || 'Engine 2 (Auto)') : 'Engine 2 (Auto)',
          solution_type: 'auto',
          final_geometry: solutionGeometry,
          placed_pieces: autoSolution,
          actions: [],
          solve_time_ms: null,
          move_count: 0,
          notes: 'Automated solution from Engine 2'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      console.log('✅ Auto-solution saved:', data.id);
      setCurrentSolutionId(data.id);
      
      // Update stats with solution ID
      setAutoSolutionStats((prev: any) => ({
        ...prev,
        solutionId: data.id
      }));
      
      // Task 6: Link solver_run to solution
      if (solverRunDbIdRef.current) {
        const { error: linkError } = await supabase
          .from('solver_runs')
          .update({ solution_id: data.id })
          .eq('id', solverRunDbIdRef.current);
        
        if (linkError) {
          console.error('❌ Failed to link solver_run to solution:', linkError);
        } else {
          console.log('✅ Linked solver_run', solverRunDbIdRef.current, 'to solution', data.id);
        }
      }
      
      return data.id;
    } catch (err) {
      console.error('❌ Failed to save solution:', err);
      setNotification('Failed to save solution');
      setNotificationType('error');
      return null;
    }
  };

  const handleMakeMovieClick = async () => {
    // Save solution before making movie
    const solutionId = await handleSaveSolution();
    if (solutionId) {
      setShowSuccessModal(false);
      setShowMovieTypeModal(true);
    }
  };

  const handleMovieTypeSelect = (effectType: 'turntable' | 'reveal' | 'gravity') => {
    if (!currentSolutionId) return;
    setShowMovieTypeModal(false);
    navigate(`/movies/${effectType}/${currentSolutionId}?mode=create`);
  };

  // Solution playback animation
  useEffect(() => {
    if (!autoSolution || autoConstructionIndex >= autoSolution.length) return;
    
    const interval = setInterval(() => {
      setAutoConstructionIndex(prev => Math.min(prev + 1, autoSolution.length));
    }, 500 / autoConstructionSpeed);
    
    return () => clearInterval(interval);
  }, [autoSolution, autoConstructionIndex, autoConstructionSpeed]);

  // Show success modal after construction animation completes + 3 second delay
  useEffect(() => {
    if (!autoSolution || !autoSolutionStats) return;
    
    // Check if construction is complete
    if (autoConstructionIndex >= autoSolution.length && autoConstructionIndex > 0) {
      console.log('🎊 Construction animation complete, waiting 3 seconds before showing modal');
      
      // Wait 3 seconds so user can view the completed solution
      const timer = setTimeout(() => {
        console.log('✨ Showing success modal');
        setShowSuccessModal(true);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [autoConstructionIndex, autoSolution, autoSolutionStats]);

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

      setAutoSolveIntermediatePieces(prevPieces => {
        // Log piece count changes for debugging missing cells
        if (pieces.length !== prevPieces.length) {
          const totalCells = pieces.reduce((sum, p) => sum + p.cells.length, 0);
          console.log(`🔄 Piece count changed: ${prevPieces.length} → ${pieces.length} (${totalCells} cells)`);
          
          // Log which pieces were added/removed
          const oldIds = new Set(prevPieces.map(p => p.pieceId));
          const newIds = new Set(pieces.map(p => p.pieceId));
          const added = pieces.filter(p => !oldIds.has(p.pieceId));
          const removed = prevPieces.filter(p => !newIds.has(p.pieceId));
          if (added.length > 0) console.log(`  ➕ Added:`, added.map(p => p.pieceId));
          if (removed.length > 0) console.log(`  ➖ Removed:`, removed.map(p => p.pieceId));
        }
        return pieces;
      });
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
          ← Back to Gallery
        </button>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh',
      overflow: 'hidden'
    }}>
      <AutoSolveHeader
        isAutoSolving={isAutoSolving}
        hasPiecesDb={!!piecesDb}
        onSolveClick={() => {
          if (isAutoSolving) {
            handleStopAutoSolve();
          } else {
            handleResumeAutoSolve();
          }
        }}
        onOpenEngineSettings={() => setShowEngineSettings(true)}
        onOpenInfo={() => setShowInfo(true)}
        onOpenEnvSettings={() => setShowSettings(true)}
        onGoToManual={() => navigate(`/manual/${puzzle?.id}`)}
        onGoToGallery={() => navigate('/gallery')}
      />

      {/* Main Content */}
      <div style={{ flex: 1, position: 'relative', marginTop: '56px', overflow: 'hidden' }}>
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
        />

        {/* Success Modal */}
        <AutoSolveSuccessModal
          isOpen={showSuccessModal}
          stats={autoSolutionStats}
          onClose={() => setShowSuccessModal(false)}
          onMakeMovie={handleMakeMovieClick}
          draggableRef={successModalDraggable.ref}
          draggableStyle={successModalDraggable.style}
          draggableHeaderStyle={successModalDraggable.headerStyle}
        />
      </div>

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
              engineName="Engine 2"
              currentSettings={engineSettings}
              onClose={() => setShowEngineSettings(false)}
              onSave={(newSettings) => {
                setEngineSettings(newSettings);
                localStorage.setItem('solve.autoSolveSettings', JSON.stringify(newSettings));
                setShowEngineSettings(false);
                console.log('💾 Auto-solve settings saved:', newSettings);
              }}
              puzzleStats={puzzle && piecesDb ? {
                puzzleName: puzzle.name,
                containerCells: puzzle.geometry.length,
                totalSpheres: puzzle.sphere_count,
                pieceTypeCount: piecesDb.size,
              } : undefined}
            />
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          settings={envSettings}
          onClose={() => setShowSettings(false)}
          onSettingsChange={setEnvSettings}
        />
      )}

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
        
        {/* Community Puzzle Stats */}
        <PuzzleStatsPanel 
          stats={puzzleStats} 
          loading={puzzleStatsLoading}
        />
      </InfoModal>

      <MovieTypeModal
        isOpen={showMovieTypeModal}
        onClose={() => setShowMovieTypeModal(false)}
        onSelectType={handleMovieTypeSelect}
        draggableRef={movieTypeModalDraggable.ref}
        draggableStyle={movieTypeModalDraggable.style}
        draggableHeaderStyle={movieTypeModalDraggable.headerStyle}
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
    </div>
  );
};
