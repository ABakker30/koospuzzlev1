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
import { EngineSettingsModal } from '../../components/EngineSettingsModal';
import { SettingsModal } from '../../components/SettingsModal';
import { InfoModal } from '../../components/InfoModal';
import { Notification } from '../../components/Notification';
import { useDraggable } from '../../hooks/useDraggable';
import '../../styles/shape.css';

// Auto-solve Engine 2
import { engine2Solve, engine2Precompute, type Engine2RunHandle, type Engine2Settings } from '../../engines/engine2';
import type { PieceDB } from '../../engines/dfs2';
import type { StatusV2 } from '../../engines/types';
import { loadAllPieces } from '../../engines/piecesLoader';

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
  const [isAutoSolving, setIsAutoSolving] = useState(false);
  const [autoSolveStatus, setAutoSolveStatus] = useState<StatusV2 | null>(null);
  const [autoSolution, setAutoSolution] = useState<PlacedPiece[] | null>(null);
  const [autoConstructionIndex, setAutoConstructionIndex] = useState(0);
  const [autoSolutionsFound, setAutoSolutionsFound] = useState(0);
  const [autoSolveIntermediatePieces, setAutoSolveIntermediatePieces] = useState<PlacedPiece[]>([]);
  const engineHandleRef = useRef<Engine2RunHandle | null>(null);
  const savingInProgressRef = useRef<boolean>(false);
  
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
  
  // Slider panel collapsed state
  const [sliderPanelCollapsed, setSliderPanelCollapsed] = useState(false);
  
  // Animation speed for solution playback (fixed at 1.0 for now)
  const autoConstructionSpeed = 1.0;
  
  // Draggable panels
  const slidersDraggable = useDraggable();
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

  // Start auto-solve
  const handleAutoSolve = async () => {
    if (!puzzle || !piecesDb || !loaded) {
      setNotification('Puzzle or pieces not loaded');
      setNotificationType('warning');
      return;
    }
    
    if (engineHandleRef.current) {
      console.log('⚠️ Auto-solve already in progress');
      return;
    }
    
    console.log('🤖 Starting auto-solve with Engine 2');
    setIsAutoSolving(true);
    setAutoSolution(null);
    setAutoConstructionIndex(0);
    setAutoSolveStatus(null);
    setAutoSolutionsFound(0);
    savingInProgressRef.current = false;
    
    const containerCells: [number, number, number][] = 
      puzzle.geometry.map(cell => [cell.i, cell.j, cell.k]);
    
    try {
      // Precompute
      console.log('🔧 Precomputing...');
      const pre = engine2Precompute(
        { cells: containerCells, id: puzzle.id },
        piecesDb
      );
      
      console.log('✅ Precompute complete');
      
      // Solve
      console.log('🔧 Starting solve...');
      const handle = engine2Solve(
        pre,
        engineSettings,
        {
          onStatus: (status: StatusV2) => {
            setAutoSolveStatus(status);
            console.log(`🤖 Auto-solve status: depth=${status.depth}, nodes=${status.nodes}, placed=${status.placed}`);
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
            
            // Pause solver
            if (engineHandleRef.current) {
              engineHandleRef.current.pause();
            }
            setIsAutoSolving(false);
            
            // Convert to pieces
            const pieces = await convertPlacementToPieces(placement);
            setAutoSolution(pieces);
            setAutoConstructionIndex(0);
            setAutoSolutionsFound(prev => prev + 1);
            
            // Set reveal slider max
            setRevealMax(pieces.length);
            setRevealK(pieces.length); // Show all initially
            
            console.log(`🎬 Starting animated construction: ${pieces.length} pieces`);
            
            // Prepare stats for success modal (don't auto-save yet)
            setAutoSolutionStats({
              solutionId: null, // Will be set when user saves
              pieceCount: pieces.length,
              cellCount: pieces.flatMap(p => p.cells).length,
              savedAt: new Date().toLocaleString()
            });
            
            // Don't show modal yet - wait for construction to complete
            savingInProgressRef.current = false;
          }
        }
      );
      
      engineHandleRef.current = handle;
      handle.resume();
    } catch (error: any) {
      console.error('❌ Auto-solve failed:', error);
      setNotification(`Auto-solve error: ${error.message}`);
      setNotificationType('error');
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
    setAutoSolveStatus(null);
  };

  // Resume to find next solution
  const handleResumeAutoSolve = () => {
    if (engineHandleRef.current) {
      console.log('🔄 Resuming auto-solve to find next solution...');
      setIsAutoSolving(true);
      setAutoSolution(null);
      setAutoConstructionIndex(0);
      engineHandleRef.current.resume();
    } else {
      handleAutoSolve();
    }
  };

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
      const { data, error } = await supabase
        .from('solutions')
        .insert({
          puzzle_id: puzzle.id,
          solver_name: 'Engine 2 (Auto)',
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
      
      return data.id;
    } catch (err) {
      console.error('❌ Failed to save solution:', err);
      setNotification('Failed to save solution');
      setNotificationType('error');
      return null;
    }
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
        savingInProgressRef.current = false; // Reset after construction
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [autoConstructionIndex, autoSolution, autoSolutionStats]);

  // Load GoldOrientationService once
  const orientationServiceRef = useRef<any>(null);
  
  useEffect(() => {
    const loadService = async () => {
      if (orientationServiceRef.current) return;
      const { GoldOrientationService } = await import('../../services/GoldOrientationService');
      const svc = new GoldOrientationService();
      await svc.load();
      orientationServiceRef.current = svc;
    };
    loadService();
  }, []);

  // Update intermediate pieces when auto-solve status changes (real-time progress)
  useEffect(() => {
    if (!isAutoSolving || !autoSolveStatus?.stack || !orientationServiceRef.current) {
      setAutoSolveIntermediatePieces([]);
      return;
    }
    
    try {
      const svc = orientationServiceRef.current;
      const pieces: PlacedPiece[] = [];
      
      for (const p of autoSolveStatus.stack!) {
        const orientations = svc.getOrientations(p.pieceId);
        if (!orientations || p.ori >= orientations.length) {
          console.warn(`⚠️ Missing orientations for ${p.pieceId} ori ${p.ori}`);
          continue;
        }
        
        const orientation = orientations[p.ori];
        const anchor: IJK = { i: p.t[0], j: p.t[1], k: p.t[2] };
        
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
          uid: `intermediate-${p.pieceId}-${pieces.length}`,
          placedAt: Date.now() + pieces.length
        });
      }
      
      setAutoSolveIntermediatePieces(pieces);
    } catch (error) {
      console.error('Failed to convert stack to pieces:', error);
    }
  }, [isAutoSolving, autoSolveStatus]);

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
        {/* Left: Empty spacer for consistent layout */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }} />

        {/* Center: Auto-solve controls */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
          {/* Solve Button */}
          <button
            onClick={() => {
              if (isAutoSolving) {
                handleStopAutoSolve();
              } else if (autoSolution && engineHandleRef.current) {
                handleResumeAutoSolve();
              } else {
                handleAutoSolve();
              }
            }}
            disabled={!piecesDb}
            title={
              isAutoSolving 
                ? "Stop solver" 
                : "Find solution"
            }
            style={{ 
              background: isAutoSolving ? '#f44336' : '#4caf50',
              color: '#fff',
              fontWeight: 600,
              border: 'none',
              borderRadius: '8px',
              padding: '8px 20px',
              fontSize: '14px',
              cursor: piecesDb ? 'pointer' : 'not-allowed',
              opacity: piecesDb ? 1 : 0.5,
              minWidth: '120px',
              boxShadow: 'none'
            }}
          >
            {isAutoSolving ? '⏹ Stop Solver' : '🔍 Solve'}
          </button>
          
          {/* Engine Settings Button */}
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
        </div>

        {/* Right: Info, Settings, Manual Solve & Gallery */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          alignItems: 'center',
          justifyContent: 'flex-end'
        }}>
          {/* Info Button */}
          <button
            className="pill"
            onClick={() => setShowInfo(true)}
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
            onClick={() => setShowSettings(true)}
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
          
          {/* Manual Solve Button */}
          <button
            className="pill"
            onClick={() => navigate(`/manual/${puzzle?.id}`)}
            title="Manual Solve"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
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
            🧩
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
      <div style={{ flex: 1, position: 'relative', marginTop: '64px', overflow: 'hidden' }}>
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

        {/* Reveal / Explosion Sliders - Bottom Right */}
        {(revealMax > 0 || explosionFactor > 0) && (
          <div
            ref={slidersDraggable.ref}
            style={{
              position: 'fixed',
              bottom: sliderPanelCollapsed ? 'max(8px, env(safe-area-inset-bottom))' : '20px',
              right: sliderPanelCollapsed ? 'max(8px, env(safe-area-inset-right))' : '20px',
              background: 'rgba(0, 0, 0, 0.85)',
              borderRadius: '8px',
              padding: '12px 12px 0',
              minWidth: sliderPanelCollapsed ? '60px' : '240px',
              maxWidth: sliderPanelCollapsed ? '60px' : 'min(240px, 90vw)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              zIndex: 1000,
              userSelect: 'none',
              transition: 'min-width 0.2s ease, max-width 0.2s ease, right 0.3s ease, bottom 0.3s ease',
              touchAction: 'none',
              ...(sliderPanelCollapsed ? {} : slidersDraggable.style),
              cursor: sliderPanelCollapsed ? 'pointer' : 'move'
            }}>
            {/* Draggable Handle with Collapse Button */}
            <div style={{
              padding: '8px 15px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              userSelect: 'none',
              ...slidersDraggable.headerStyle
            }}>
              <div style={{
                width: '40px',
                height: '4px',
                background: 'rgba(255, 255, 255, 0.3)',
                borderRadius: '2px',
                flex: 1
              }} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSliderPanelCollapsed(!sliderPanelCollapsed);
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  setSliderPanelCollapsed(!sliderPanelCollapsed);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: 'none',
                  borderRadius: '4px',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#fff',
                  fontSize: '14px',
                  marginLeft: '8px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent'
                }}
                title={sliderPanelCollapsed ? 'Expand' : 'Collapse'}
              >
                {sliderPanelCollapsed ? '▲' : '▼'}
              </button>
            </div>
            
            {/* Sliders Content */}
            {!sliderPanelCollapsed && (
              <div 
                style={{ padding: '0 15px 15px' }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
              {/* Reveal Slider */}
              {revealMax > 0 && (
                <div 
                  style={{ marginBottom: '15px' }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  <div style={{ 
                    color: '#fff', 
                    marginBottom: '8px', 
                    fontSize: '13px',
                    fontWeight: 500
                  }}>
                    Reveal
                  </div>
                <input
                  type="range"
                  min={1}
                  max={revealMax}
                  step={1}
                  value={revealK}
                  onChange={(e) => setRevealK(parseInt(e.target.value, 10))}
                  style={{ 
                    width: '100%',
                    cursor: 'pointer'
                  }}
                />
              </div>
            )}
            
            {/* Explosion Slider */}
            <div
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div style={{ 
                color: '#fff', 
                marginBottom: '8px', 
                fontSize: '13px',
                fontWeight: 500
              }}>
                Explosion
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={explosionFactor * 100}
                onChange={(e) => setExplosionFactor(parseInt(e.target.value, 10) / 100)}
                style={{ 
                  width: '100%',
                  cursor: 'pointer'
                }}
              />
            </div>
              </div>
            )}
          </div>
        )}

        {/* Solver Status Display */}
        {autoSolveStatus && isAutoSolving && (
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(0,0,0,0.8)',
            padding: '16px',
            borderRadius: '12px',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.1)',
            minWidth: '250px',
            zIndex: 1000
          }}>
            <div style={{ fontSize: '14px', color: '#fff', marginBottom: '8px', fontWeight: 600 }}>
              🔍 Solver Status
            </div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div>Depth: {autoSolveStatus.depth}</div>
              <div>Nodes: {autoSolveStatus.nodes?.toLocaleString()}</div>
              {(autoSolveStatus as any).nodesPerSec && (
                <div style={{ fontSize: '11px', opacity: 0.8 }}>
                  {((autoSolveStatus as any).nodesPerSec).toFixed(0)} n/s
                </div>
              )}
              {autoSolutionsFound > 0 && (
                <div style={{ color: '#10b981', fontWeight: 600, marginTop: '4px' }}>
                  ✅ {autoSolutionsFound} solution{autoSolutionsFound > 1 ? 's' : ''} found
                </div>
              )}
            </div>
          </div>
        )}

        {/* Success Modal - matches ManualSolvePage style */}
        {showSuccessModal && autoSolutionStats && (
          <div
            ref={successModalDraggable.ref}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              background: 'linear-gradient(135deg, #1e88e5, #42a5f5)',
              color: 'white',
              padding: '32px 40px',
              borderRadius: '16px',
              fontSize: '20px',
              fontWeight: 'bold',
              textAlign: 'center',
              boxShadow: '0 12px 40px rgba(30, 136, 229, 0.5)',
              zIndex: 2000,
              maxWidth: '400px',
              minWidth: '320px',
              ...successModalDraggable.style
            }}>
            {/* Draggable handle */}
            <div
              style={{
                position: 'absolute',
                top: '8px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '60px',
                height: '4px',
                background: 'rgba(255, 255, 255, 0.4)',
                borderRadius: '2px',
                ...successModalDraggable.headerStyle
              }}
            />
            
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
              Solution Found!
            </div>
            <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px', opacity: 0.95 }}>
              Puzzle Solved by Engine 2
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
                ✨ Auto-Solve Complete!
              </div>
              <div><strong>🧩 Pieces:</strong> {autoSolutionStats.pieceCount}</div>
              <div><strong>📦 Cells:</strong> {autoSolutionStats.cellCount}</div>
              {autoSolutionStats.solutionId && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.3)' }}>
                  <strong>💾 Solution ID:</strong> {autoSolutionStats.solutionId.slice(0, 8)}...
                </div>
              )}
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
              🎬 Create a movie or continue solving
            </div>
            
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button
                onClick={async () => {
                  // Save solution before making movie
                  const solutionId = await handleSaveSolution();
                  if (solutionId) {
                    setShowSuccessModal(false);
                    setShowMovieTypeModal(true);
                  }
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
      </InfoModal>

      {/* Movie Type Selection Modal */}
      {showMovieTypeModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'transparent',
          backdropFilter: 'none',
          zIndex: 2001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          <div
            ref={movieTypeModalDraggable.ref}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              padding: '32px 40px',
              borderRadius: '16px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 12px 40px rgba(102, 126, 234, 0.5)',
              position: 'fixed',
              pointerEvents: 'auto',
              ...movieTypeModalDraggable.style
            }}>
            {/* Draggable handle */}
            <div
              style={{
                position: 'absolute',
                top: '8px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '60px',
                height: '4px',
                background: 'rgba(255, 255, 255, 0.4)',
                borderRadius: '2px',
                ...movieTypeModalDraggable.headerStyle
              }}
            />
            
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
                onClick={() => {
                  if (!currentSolutionId) return;
                  setShowMovieTypeModal(false);
                  navigate(`/movies/turntable/${currentSolutionId}?mode=create`);
                }}
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
                onClick={() => {
                  if (!currentSolutionId) return;
                  setShowMovieTypeModal(false);
                  navigate(`/movies/reveal/${currentSolutionId}?mode=create`);
                }}
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
                onClick={() => {
                  if (!currentSolutionId) return;
                  setShowMovieTypeModal(false);
                  navigate(`/movies/gravity/${currentSolutionId}?mode=create`);
                }}
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
