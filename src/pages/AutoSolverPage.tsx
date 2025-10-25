import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { useActiveState } from '../context/ActiveStateContext';
import AutoSolverCanvas, { type AutoSolverCanvasHandle } from '../components/AutoSolverCanvas';

// koos.shape@1 format
interface KoosShape {
  schema: 'koos.shape';
  version: 1;
  id: string;
  lattice: string;
  cells: [number, number, number][];
}

// Auto Solver modules
import { InfoModal } from '../components/InfoModal';
import { EngineSettingsModal } from '../components/EngineSettingsModal';
import { computeOrientationFromContainer } from './auto-solver/pipeline/loadAndOrient';
import { buildShapePreviewGroup } from './auto-solver/pipeline/shapePreview';
import type { ContainerJSON, OrientationRecord } from './auto-solver/types';
import { createKoosSolution } from '../services/solutionCanonical';
import { uploadContractSolution } from '../api/contracts';
import { supabase } from '../lib/supabase';

// Solution Viewer modules for reveal and explosion
import { computeRevealOrder, applyRevealK, applyExplosion } from './solution-viewer/pipeline/build';
import type { PieceOrderEntry } from './solution-viewer/types';

// Solution Viewer pipeline for rendering placements
import { orientSolutionWorld } from './solution-viewer/pipeline/orient';
import { buildSolutionGroup } from './solution-viewer/pipeline/build';
import type { SolutionJSON } from './solution-viewer/types';

// Engine 2
import { engine2Solve, engine2Precompute, type Engine2RunHandle } from '../engines/engine2';
import type { PieceDB } from '../engines/dfs2';
import type { Engine2Settings } from '../engines/engine2';
import type { StatusV2 } from '../engines/types';
import { loadAllPieces } from '../engines/piecesLoader';

// Import Studio styles
import '../styles/shape.css';

type IJK = [number, number, number];

const AutoSolverPage: React.FC = () => {
  console.log('🎬 AutoSolverPage: Component mounted/rendered (DFS2 version)');
  
  const navigate = useNavigate();
  const { activeState, setActiveState } = useActiveState();
  
  // Query for pyramid shapes on mount
  useEffect(() => {
    async function findPyramidShapes() {
      console.log('🔍 Searching for pyramid shapes in Supabase...');
      
      // Search for shapes with "20 cell" and "pyramid" in name
      const { data, error } = await supabase
        .from('shapes')
        .select('*')
        .or('name.ilike.%20 cell%pyramid%,name.ilike.%pyramid%20 cell%');
      
      if (error) {
        console.error('❌ Error querying shapes:', error);
      } else {
        console.log(`✅ Found ${data?.length || 0} pyramid shapes:`, data);
      }
      
      // Broader search for all shapes with "pyramid"
      const { data: allPyramids, error: err2 } = await supabase
        .from('shapes')
        .select('id, name, created_at')
        .ilike('name', '%pyramid%')
        .order('created_at', { ascending: false });
      
      if (!err2 && allPyramids) {
        console.log(`📋 All shapes containing "pyramid" (${allPyramids.length}):`, allPyramids);
      }
    }
    
    findPyramidShapes();
  }, []);
  const canvasRef = useRef<AutoSolverCanvasHandle>(null);
  
  // State
  const [showEngineSettings, setShowEngineSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [menuDragging, setMenuDragging] = useState(false);
  const [menuDragOffset, setMenuDragOffset] = useState({ x: 0, y: 0 });
  const [currentShapeName, setCurrentShapeName] = useState<string | null>(null);
  const [orientationRecord, setOrientationRecord] = useState<OrientationRecord | null>(null);
  const [shapePreviewGroup, setShapePreviewGroup] = useState<THREE.Group | null>(null);
  const [solutionGroup, setSolutionGroup] = useState<THREE.Group | null>(null);
  
  // Track shape ID for solution shapeRef
  const [shapeRef, setShapeRef] = useState<string | null>(null);
  
  // Store first oriented solution for consistent rendering
  const baseOrientedSolutionRef = useRef<any>(null);
  
  // Track current solution group in scene (for immediate cleanup)
  const solutionGroupRef = useRef<THREE.Group | null>(null);
  
  // DFS Engine state
  const [, setEngineReady] = useState(false);
  const [containerCells, setContainerCells] = useState<IJK[]>([]);
  const [piecesDb, setPiecesDb] = useState<PieceDB>(new Map());
  const [status, setStatus] = useState<StatusV2 | undefined>(undefined);
  const [isRunning, setIsRunning] = useState(false);
  const [solutionsFound, setSolutionsFound] = useState(0);
  const engineHandleRef = useRef<Engine2RunHandle | null>(null);
  
  // Solution save state
  const [showSaveSolutionModal, setShowSaveSolutionModal] = useState(false);
  const [latestSolution, setLatestSolution] = useState<{ pieceId: string; ori: number; t: IJK }[] | null>(null);
  const revealTimeoutRef = useRef<number | null>(null);
  
  // Solution reveal state - when set, blocks all search rendering
  const [revealingSolution, setRevealingSolution] = useState<{ pieceId: string; ori: number; t: IJK }[] | null>(null);
  const [revealedPieces, setRevealedPieces] = useState<number>(0);
  
  // Notification state - now a modal instead of toast
  const [showSolutionSavedModal, setShowSolutionSavedModal] = useState(false);
  const [solutionStats, setSolutionStats] = useState<{
    solutionName: string;
    alreadyExists: boolean;
    totalSolutions: number;
    userStats: Array<{ username: string; count: number }>;
  } | null>(null);
  
  // Modal drag state
  const [modalPosition, setModalPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  
  // Reveal slider state
  const [revealOrder, setRevealOrder] = useState<PieceOrderEntry[]>([]);
  const [revealK, setRevealK] = useState<number>(0);
  const [revealMax, setRevealMax] = useState<number>(0);
  
  // Explosion slider state
  const [explosionFactor, setExplosionFactor] = useState<number>(0); // 0 = assembled, 1 = 3x exploded
  
  // Engine 2 settings with new defaults (load from localStorage if available)
  const [settings, setSettings] = useState<Engine2Settings>(() => {
    // Try to load from localStorage first
    try {
      const saved = localStorage.getItem('autosolverEngineSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('📂 Loaded engine settings from localStorage');
        // Merge with defaults to ensure all required fields exist
        const now = new Date();
        const timeSeed = now.getHours() * 10000 + now.getMinutes() * 100 + now.getSeconds();
        return {
          maxSolutions: parsed.maxSolutions ?? 10,
          timeoutMs: parsed.timeoutMs ?? 0,
          moveOrdering: parsed.moveOrdering ?? "mostConstrainedCell",
          pruning: parsed.pruning ?? { connectivity: false, multipleOf4: false, colorResidue: false, neighborTouch: false },
          statusIntervalMs: parsed.statusIntervalMs ?? 1000,
          seed: parsed.seed ?? timeSeed,
          randomizeTies: parsed.randomizeTies ?? true,
          stallByPieces: parsed.stallByPieces ?? {
            nMinus1Ms: 2000,
            nMinus2Ms: 4000,
            nMinus3Ms: 5000,
            nMinus4Ms: 6000,
            nMinusOtherMs: 10000,
            action: "reshuffle",
            depthK: 2,
            maxShuffles: 8,
          },
          tailSwitch: parsed.tailSwitch ?? {
            enable: true,
            tailSize: 20,
            enumerateAll: true,
            enumerateLimit: 25,
          },
          visualRevealDelayMs: parsed.visualRevealDelayMs ?? 50,
          pauseOnSolution: parsed.pauseOnSolution ?? true,
          saveSolutions: parsed.saveSolutions ?? false,
          savePath: parsed.savePath ?? "",
        };
      }
    } catch (err) {
      console.warn('Failed to load settings from localStorage, using defaults:', err);
    }
    
    // Fallback to defaults if localStorage load failed
    const now = new Date();
    const timeSeed = now.getHours() * 10000 + now.getMinutes() * 100 + now.getSeconds();
    
    return {
      maxSolutions: 10,
      timeoutMs: 0,
      moveOrdering: "mostConstrainedCell",
      pruning: { connectivity: false, multipleOf4: false, colorResidue: false, neighborTouch: false },
      statusIntervalMs: 1000, // Fixed internal value
      seed: timeSeed,
      randomizeTies: true,
      stallByPieces: {
        nMinus1Ms: 2000,
        nMinus2Ms: 4000,
        nMinus3Ms: 5000,
        nMinus4Ms: 6000,
        nMinusOtherMs: 10000,
        action: "reshuffle",
        depthK: 2,
        maxShuffles: 8,
      },
      tailSwitch: {
        enable: true,
        tailSize: 20,
        enumerateAll: true,
        enumerateLimit: 25,
      },
      visualRevealDelayMs: 50, // For status updates
      solutionRevealDelayMs: 150, // For solution display
    };
  });

  
  // Auto-disable tail solver if shape is too small
  useEffect(() => {
    if (containerCells.length === 0) return; // No shape loaded yet
    
    const tailSize = settings.tailSwitch?.tailSize ?? 20;
    const minCellsForTail = 2 * tailSize;
    
    if (containerCells.length < minCellsForTail) {
      // Shape too small for tail solver - disable it
      if (settings.tailSwitch?.enable !== false) {
        console.log(`⚠️ Auto-disabling tail solver: shape has ${containerCells.length} cells < ${minCellsForTail} (2 × tailSize=${tailSize})`);
        setSettings(prev => ({
          ...prev,
          tailSwitch: {
            ...prev.tailSwitch,
            enable: false,
          },
        }));
      }
    } else {
      // Shape large enough - ensure tail solver is enabled
      if (settings.tailSwitch?.enable !== true) {
        console.log(`✅ Auto-enabling tail solver: shape has ${containerCells.length} cells ≥ ${minCellsForTail} (2 × tailSize=${tailSize})`);
        setSettings(prev => ({
          ...prev,
          tailSwitch: {
            ...prev.tailSwitch,
            enable: true,
          },
        }));
      }
    }
  }, [containerCells, settings.tailSwitch?.tailSize]);
  
  // Cleanup reveal timeout on unmount
  useEffect(() => {
    return () => {
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current);
      }
    };
  }, []);
  
  // Handle solution reveal animation
  useEffect(() => {
    if (!revealingSolution) return;
    
    console.log('🎬 Starting reveal animation for', revealingSolution.length, 'pieces');
    
    const REVEAL_DELAY = 400; // ms between pieces
    
    // CRITICAL: Clear the scene completely and wait
    console.log('🧹 Clearing scene for reveal animation...');
    
    if (canvasRef.current?.scene && solutionGroupRef.current) {
      console.log('🗑️ Removing old solution group from scene');
      canvasRef.current.scene.remove(solutionGroupRef.current);
      
      // Dispose of all resources
      solutionGroupRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
      solutionGroupRef.current = null;
      console.log('✅ Scene cleared, waiting before rebuild...');
    }
    
    // Longer delay to ensure scene is completely clear and visible to user
    setTimeout(() => {
      console.log('🔨 Building solution for reveal animation');
      
      // Double-check scene is clear
      if (solutionGroupRef.current) {
        console.warn('⚠️ Solution group still exists, forcing removal');
        if (canvasRef.current?.scene) {
          canvasRef.current.scene.remove(solutionGroupRef.current);
        }
        solutionGroupRef.current = null;
      }
      
      // Build full solution ONCE with all pieces hidden initially
      renderCurrentStack(revealingSolution, false, true);
      
      // Get the solution group that was just created (re-check after render)
      const revealGroup = solutionGroupRef.current as THREE.Group | null;
      if (!revealGroup || !revealGroup.children) {
        console.error('❌ No solution group found for reveal after renderCurrentStack');
        return;
      }
      
      console.log(`📦 Solution group has ${revealGroup.children.length} children`);
      
      // Hide all pieces initially (recursively hide all descendants)
      revealGroup.children.forEach((child: any, idx: number) => {
        console.log(`👻 Hiding piece ${idx + 1}: ${child.name}`);
        child.visible = false;
        // Also hide all children (spheres and bonds)
        child.traverse((obj: any) => {
          obj.visible = false;
        });
      });
      
      // Reveal pieces one by one by toggling visibility
      // Start delays from NOW (100ms after setTimeout started)
      const startTime = Date.now();
      revealingSolution.forEach((_, index) => {
        window.setTimeout(() => {
          if (revealGroup.children[index]) {
            const elapsed = Date.now() - startTime;
            console.log(`✨ [${elapsed}ms] Revealing piece ${index + 1}/${revealingSolution.length}: ${revealGroup.children[index].name}`);
            revealGroup.children[index].visible = true;
            // Also reveal all children (spheres and bonds)
            revealGroup.children[index].traverse((obj: any) => {
              obj.visible = true;
            });
          } else {
            console.error(`❌ No child at index ${index}`);
          }
        }, index * REVEAL_DELAY);
      });
    }, 100);
    
    // Auto-save after all pieces revealed
    const modalTimeout = window.setTimeout(async () => {
      console.log('✅ Reveal complete, auto-saving solution');
      console.log('📋 Check params:', { 
        hasLatestSolution: !!latestSolution, 
        hasCurrentShapeName: !!currentShapeName,
        latestSolutionLength: latestSolution?.length,
        shapeName: currentShapeName
      });
      
      // Auto-save the solution
      if (latestSolution && currentShapeName) {
        console.log('🚀 Calling autoSaveSolution...');
        await autoSaveSolution(latestSolution, currentShapeName);
      } else {
        console.error('❌ Cannot auto-save: missing latestSolution or currentShapeName');
      }
      
      setRevealingSolution(null); // Clear reveal state
      setRevealedPieces(0);
    }, revealingSolution.length * REVEAL_DELAY + 100); // Small buffer after last piece reveals
    
    revealTimeoutRef.current = modalTimeout;
    
  }, [revealingSolution, latestSolution, currentShapeName]);
  
  // Apply reveal slider changes
  useEffect(() => {
    if (!solutionGroupRef.current || revealOrder.length === 0 || revealingSolution) return;
    
    console.log(`👁️ AutoSolver: Applying reveal K=${revealK}/${revealMax}`);
    applyRevealK(solutionGroupRef.current, revealOrder, revealK);
    
    // Trigger re-render
    if (canvasRef.current) {
      canvasRef.current.triggerRender();
    }
  }, [revealK, revealOrder, revealMax, revealingSolution]);
  
  // Apply explosion slider changes
  useEffect(() => {
    if (!solutionGroupRef.current || revealOrder.length === 0 || revealingSolution) return;
    
    console.log(`💥 AutoSolver: Applying explosion factor=${explosionFactor.toFixed(2)}`);
    applyExplosion(solutionGroupRef.current, revealOrder, explosionFactor);
    
    // Trigger re-render
    if (canvasRef.current) {
      canvasRef.current.triggerRender();
    }
  }, [explosionFactor, revealOrder, revealingSolution]);
  
  // Load pieces database on mount
  useEffect(() => {
    console.log('📦 AutoSolver: Loading pieces from file...');
    loadAllPieces()
      .then(db => {
        console.log(`✅ AutoSolver: Loaded ${db.size} pieces`);
        setPiecesDb(db);
        setEngineReady(true);
      })
      .catch(err => {
        console.error('❌ Failed to load pieces:', err);
      });
  }, []);

  // CONTRACT: Solve - Auto-load shape from activeState on mount
  useEffect(() => {
    if (!activeState || containerCells.length > 0) return; // Skip if no state or already loaded
    
    console.log("⚙️ Auto Solver: ActiveState available", {
      shapeRef: activeState.shapeRef.substring(0, 24) + '...',
      placements: activeState.placements.length
    });
    
    // Fetch and load shape automatically
    const autoLoadShape = async () => {
      try {
        console.log("🔄 Auto Solver: Auto-loading shape from activeState...");
        
        // Import the API to fetch shape
        const { supabase } = await import('../lib/supabase');
        
        // Get signed URL for shape
        const { data: urlData, error: urlError } = await supabase.storage
          .from('shapes')
          .createSignedUrl(`${activeState.shapeRef}.shape.json`, 300);
        
        if (urlError) throw urlError;
        
        // Fetch shape
        const response = await fetch(urlData.signedUrl);
        if (!response.ok) throw new Error('Failed to fetch shape');
        
        const shape = await response.json() as KoosShape;
        
        // Validate format
        if (shape.schema !== 'koos.shape' || shape.version !== 1) {
          throw new Error('Invalid shape format');
        }
        
        console.log("✅ Auto Solver: Auto-loaded shape from activeState");
        
        // Load the shape (will also seed with placements if any)
        onShapeLoaded(shape);
        
      } catch (error) {
        console.error("❌ Auto Solver: Failed to auto-load shape:", error);
        // Don't show error to user - they can still browse manually
      }
    };
    
    autoLoadShape();
  }, [activeState, containerCells.length]); // Re-run if activeState changes

  // Handle shape loading (koos.shape@1 only)
  const onShapeLoaded = async (shape: KoosShape, providedShapeName?: string) => {
    console.log('🔄 AutoSolver: NEW SHAPE LOADED - Resetting all state...');
    console.log(`   Shape ID: ${shape.id.substring(0, 24)}...`);
    console.log(`   Cells: ${shape.cells.length}`);
    
    // Store shapeRef and use provided shape name or generate fallback
    setShapeRef(shape.id);
    const shapeName = providedShapeName || `Shape_${shape.cells.length}cells`;
    
    // === COMPLETE STATE RESET ===
    
    // 1. Stop and clear any running engine
    if (engineHandleRef.current) {
      console.log('🛑 Canceling running engine...');
      engineHandleRef.current.cancel();
      engineHandleRef.current = null;
    }
    setIsRunning(false);
    setStatus(undefined);
    setSolutionsFound(0);
    
    // 2. Clear scene (remove all 3D objects)
    if (canvasRef.current?.scene) {
      console.log('🧹 Clearing scene...');
      
      // Remove previous preview
      if (shapePreviewGroup) {
        console.log('  Removing shape preview...');
        canvasRef.current.scene.remove(shapePreviewGroup);
        setShapePreviewGroup(null);
      }
      
      // Remove previous solution
      if (solutionGroup) {
        console.log('  Removing solution group...');
        canvasRef.current.scene.remove(solutionGroup);
        solutionGroupRef.current = null;  // Clear ref immediately
        setSolutionGroup(null);
      }
      
      // Extra safety: Remove all non-light objects from scene
      const objectsToRemove: THREE.Object3D[] = [];
      canvasRef.current.scene.traverse((obj: THREE.Object3D) => {
        if (obj !== canvasRef.current?.scene && 
            !(obj instanceof THREE.Light) && 
            !(obj instanceof THREE.Camera)) {
          objectsToRemove.push(obj);
        }
      });
      
      objectsToRemove.forEach(obj => {
        if (obj.parent) {
          console.log(`  Removing orphaned object: ${obj.type}`);
          obj.parent.remove(obj);
        }
      });
      
      console.log(`✅ Scene cleared: ${objectsToRemove.length} objects removed`);
    }
    
    // 3. Store new container cells for DFS engine
    const cells: IJK[] = shape.cells;
    setContainerCells(cells);
    console.log(`✅ Container cells stored: ${cells.length}`);
    
    // Reset orientation and solution references for new shape
    baseOrientedSolutionRef.current = null;
    solutionGroupRef.current = null;

    // 4. Convert koos.shape@1 to ContainerJSON
    const containerJSON: ContainerJSON = {
      cells_ijk: shape.cells,
      name: shape.id.substring(0, 16) + '...'
    };

    // 5. Compute orientation for new shape
    const orient = computeOrientationFromContainer(containerJSON, shape.id);
    setOrientationRecord(orient);
    console.log('✅ Orientation computed');

    // 6. Build and display new blue shape preview
    const { group } = buildShapePreviewGroup(containerJSON, orient);
    
    if (canvasRef.current?.scene) {
      canvasRef.current.scene.add(group);
      setShapePreviewGroup(group);
      
      // Fit camera to new shape
      canvasRef.current.fitToObject(group);
      console.log('✅ Preview rendered and camera fitted');
    }

    // 7. Update UI state
    setCurrentShapeName(shapeName);
    console.log(`✅ Shape name set: ${shapeName}`);
    
    // 8. Pieces database will be loaded separately
    console.log('✅ AutoSolver: Reset complete, ready for new solve!');
  };

  // Fit camera to object (delegated to canvas)
  // Removed - now using canvasRef.current.fitToObject()

  // Open settings modal
  const openSettings = () => {
    setShowEngineSettings(true);
  };

  // Play/Pause/Cancel DFS Engine
  const onPlay = () => {
    console.log('▶️ AutoSolver: Play button pressed');
    console.log(`📦 Container cells: ${containerCells.length}, Pieces DB: ${piecesDb.size} pieces`);
    
    if (!containerCells.length || piecesDb.size === 0) {
      console.warn('⚠️ AutoSolver: Missing container or pieces');
      alert('Please load a shape first. Pieces database is being set up...');
      // For now, create minimal placeholder pieces
      const placeholderPieces: PieceDB = new Map();
      // Add a simple 4-cell piece for testing
      placeholderPieces.set('A', [{ id: 0, cells: [[0,0,0], [1,0,0], [0,1,0], [0,0,1]] }]);
      placeholderPieces.set('B', [{ id: 0, cells: [[0,0,0], [1,0,0], [1,1,0], [0,1,0]] }]);
      setPiecesDb(placeholderPieces);
      setEngineReady(true);
      return;
    }

    // Fresh run
    if (!engineHandleRef.current) {
      console.log(`🚀 AutoSolver: Starting NEW Engine 2 run...`);
      console.log(`⚙️ Settings:`, settings);
      console.log(`📦 Container: ${containerCells.length} cells`);
      console.log(`🧩 Pieces: ${piecesDb.size} types loaded`);
      
      // Reset solution counter for fresh run
      setSolutionsFound(0);
      
      // Compute view transform from orientation record (for Engine 2)
      const viewTransform = orientationRecord ? {
        worldFromIJK: orientationRecord.M_worldFromIJK.elements as unknown as number[][],
        sphereRadiusWorld: 1.0, // Will be computed from first placement
      } : undefined;
      
      let handle: Engine2RunHandle;
      
      // Always use Engine 2
        console.log('🔧 About to call engine2Precompute...');
        const pre = engine2Precompute({ cells: containerCells, id: currentShapeName || 'container' }, piecesDb);
        console.log(`✅ Precompute done: ${pre.N} cells, ${pre.pieces.size} pieces`);
        
        console.log('🔧 About to call engine2Solve...');
        handle = engine2Solve(pre, {
          ...settings,
          view: viewTransform,
        }, {
          onStatus: (s) => {
            setStatus(s);
            
            // Don't render during solution reveal animation
            if (revealingSolution) return;
            
            // Render current search state (already throttled to statusIntervalMs)
            if (s.stack && s.stack.length > 0) {
              renderCurrentStack(s.stack.map(p => ({ pieceId: p.pieceId, ori: p.ori, t: [...p.t] as IJK })));
            }
          },
          onSolution: (placements) => {
            console.log(`🎉 Solution found with ${placements.length} pieces!`);
            
            // Engine pauses automatically if pauseOnSolution is true
            if (settings.pauseOnSolution ?? true) {
              setIsRunning(false);
            }
            
            // Store latest solution for potential cloud save
            const solution = placements.map(p => ({ pieceId: p.pieceId, ori: p.ori, t: [...p.t] as IJK }));
            setLatestSolution(solution);
            
            // Force status update to show complete solution in HUD
            const totalPieces = placements.length;
            setStatus({
              placed: totalPieces,
              depth: totalPieces,
              nodes: status?.nodes ?? 0,
              elapsedMs: status?.elapsedMs ?? 0,
              clear: false,
              stack: placements.map(p => ({ pieceId: p.pieceId, ori: p.ori, t: p.t })),
              bestPlaced: totalPieces,
              totalPiecesTarget: totalPieces,
              nodesPerSec: (status as any)?.nodesPerSec ?? 0,
            } as any);
            
            // Update solution count
            setSolutionsFound(prev => prev + 1);
            
            // Clear scene and start reveal by setting state
            if (canvasRef.current?.scene && solutionGroupRef.current) {
              canvasRef.current.scene.remove(solutionGroupRef.current);
              solutionGroupRef.current = null;
            }
            
            // Start reveal by setting state - this blocks all onStatus renders
            setRevealingSolution(solution);
            setRevealedPieces(0);
          },
          onDone: (summary) => {
            console.log('✅ Engine2 Done:', summary);
            setIsRunning(false);
            engineHandleRef.current = null;
          }
        });
        
        console.log('🔄 Engine2 handle created, starting cooperative loop...');
      
      engineHandleRef.current = handle;
    } else {
      // Resume
      console.log('▶️ AutoSolver: Resuming DFS from paused state...');
      console.log(`   Current stack depth: ${status?.depth ?? 'unknown'}`);
      console.log(`   Solutions found so far: ${solutionsFound}`);
      engineHandleRef.current.resume();
    }
    
    setIsRunning(true);
  };

  const onPause = () => {
    engineHandleRef.current?.pause();
    setIsRunning(false);
  };

  // Cancel function (if needed in future)
  // const onCancel = () => {
  //   engineHandleRef.current?.cancel();
  //   engineHandleRef.current = null;
  //   setIsRunning(false);
  //   setStatus(undefined);
  // };

  // Format elapsed time intelligently
  const formatElapsedTime = (ms: number): string => {
    const seconds = ms / 1000;
    
    if (seconds < 60) {
      // Under 1 minute: show seconds
      return `${seconds.toFixed(1)}s`;
    } else if (seconds < 3600) {
      // 1 minute to 1 hour: show minutes
      const minutes = seconds / 60;
      return `${minutes.toFixed(1)}m`;
    } else {
      // Over 1 hour: show hours
      const hours = seconds / 3600;
      return `${hours.toFixed(1)}h`;
    }
  };

  // Render current DFS stack as solution
  const renderCurrentStack = (stack: { pieceId: string; ori: number; t: IJK }[], fitCamera: boolean = false, forceRender: boolean = false) => {
    // CRITICAL: Block all rendering during solution reveal animation (unless forced)
    if (revealingSolution && !forceRender) {
      console.log('⛔ renderCurrentStack blocked - reveal in progress');
      return;
    }
    
    if (!canvasRef.current?.scene) return;
    if (stack.length === 0) return;
    
    console.log('🎨 renderCurrentStack: Converting DFS stack to SolutionJSON...');
    
    // CRITICAL: Remove previous solution group immediately using ref (not state)
    if (solutionGroupRef.current) {
      console.log('🧹 Clearing previous solution group from scene');
      canvasRef.current.scene.remove(solutionGroupRef.current);
      solutionGroupRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else if (obj.material) {
            obj.material.dispose();
          }
        }
      });
      solutionGroupRef.current = null;
      setSolutionGroup(null);
    }
    
    // Remove preview group if exists
    if (shapePreviewGroup && canvasRef.current?.scene) {
      canvasRef.current.scene.remove(shapePreviewGroup);
      setShapePreviewGroup(null);
    }
    
    // Convert to SolutionJSON format with actual cells_ijk
    const placements = stack.map(p => {
      // Get piece orientations from database
      const orientations = piecesDb.get(p.pieceId);
      if (!orientations || !orientations[p.ori]) {
        console.warn(`⚠️ Missing piece data: ${p.pieceId} ori ${p.ori}`);
        return {
          piece: p.pieceId,
          ori: p.ori,
          t: [p.t[0], p.t[1], p.t[2]] as [number, number, number],
          cells_ijk: []
        };
      }
      
      // Get the specific orientation cells and translate them
      const oriCells = orientations[p.ori].cells;
      const translatedCells = oriCells.map(c => [
        c[0] + p.t[0],
        c[1] + p.t[1],
        c[2] + p.t[2]
      ] as [number, number, number]);
      
      console.log(`  ${p.pieceId}[${p.ori}] @ (${p.t}): ${translatedCells.length} cells`);
      
      return {
        piece: p.pieceId,
        ori: p.ori,
        t: [p.t[0], p.t[1], p.t[2]] as [number, number, number],
        cells_ijk: translatedCells
      };
    });
    
    const solutionJSON: SolutionJSON = {
      version: 1,
      containerCidSha256: currentShapeName || 'container',
      lattice: 'fcc',
      piecesUsed: {},
      placements,
      sid_state_sha256: 'dfs',
      sid_route_sha256: 'dfs',
      sid_state_canon_sha256: 'dfs',
      mode: 'search',
      solver: { engine: 'dfs', seed: 0, flags: {} }
    };

    try {
      console.log('🔨 Building solution group...');
      
      // Always compute orientation for current solution
      // This ensures consistent placement regardless of stack state
      const oriented = orientSolutionWorld(solutionJSON);
      
      // Store first orientation for reference
      if (!baseOrientedSolutionRef.current) {
        baseOrientedSolutionRef.current = { centroid: oriented.centroid.clone() };
        console.log('📍 Stored base orientation');
      }
      
      const { root, pieceMeta } = buildSolutionGroup(oriented);
      console.log(`✅ Solution group built with ${root.children.length} children`);
      
      // Compute reveal order for slider
      const order = computeRevealOrder(pieceMeta);
      setRevealOrder(order);
      setRevealMax(order.length);
      setRevealK(order.length); // Show all by default
      
      // Hide all pieces initially
      root.children.forEach(child => {
        child.visible = false;
      });
      
      // Add new solution to scene and track it immediately in ref
      canvasRef.current!.scene!.add(root);
      solutionGroupRef.current = root;  // Immediate tracking for next cleanup
      setSolutionGroup(root);
      
      // Fit camera if requested (for complete solutions, not intermediate status)
      if (fitCamera && canvasRef.current) {
        canvasRef.current.fitToObject(root);
      }
      
      // Animate pieces appearing one by one with configurable delay
      const delayMs = settings.visualRevealDelayMs ?? 150;
      root.children.forEach((child, index) => {
        setTimeout(() => {
          child.visible = true;
          // Trigger render update after each piece appears
          if (canvasRef.current) {
            canvasRef.current.triggerRender();
          }
        }, index * delayMs);
      });
      
      console.log('✅ Solution added to scene with animated reveal');
    } catch (error) {
      console.error('❌ Failed to render stack:', error);
    }
  };

  // Start/pause engine (legacy wrapper)
  const toggleEngine = () => {
    if (isRunning) {
      onPause();
    } else {
      onPlay();
    }
  };

  // Auto-save solution with stats
  const autoSaveSolution = async (solution: { pieceId: string; ori: number; t: IJK }[], shapeName: string) => {
    if (!solution || !containerCells || !shapeRef) {
      console.log('⚠️ Cannot auto-save: missing required data');
      return;
    }
    
    try {
      console.log('💾 Auto-saving solution...');
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      const username = user?.email || 'Unknown User';
      
      // Convert engine placements to koos.state@1 format
      const placements = solution.map(p => ({
        pieceId: p.pieceId.toUpperCase(),
        anchorIJK: p.t as [number, number, number],
        orientationIndex: p.ori
      }));
      
      // Create koos.state@1 solution with computed ID
      const koosSolution = await createKoosSolution(shapeRef, placements);
      
      // Check if solution already exists
      const { data: existingCheck } = await supabase
        .from('contracts_solutions')
        .select('id')
        .eq('id', koosSolution.id)
        .maybeSingle();
      
      let alreadyExists = false;
      let solutionName = '';
      
      if (existingCheck) {
        console.log('ℹ️ Solution already exists in database');
        alreadyExists = true;
        solutionName = 'Duplicate Solution';
      } else {
        // Query all solutions for this shape with metadata
        const { data: allSolutions } = await supabase
          .from('contracts_solutions')
          .select('id, metadata')
          .eq('shape_id', shapeRef); // Note: database column is shape_id
        
        // Count solutions
        const solutionCount = (allSolutions || []).length + 1;
        solutionName = `${shapeName} Solution ${solutionCount}`;
        
        // Upload with metadata
        await uploadContractSolution({
          id: koosSolution.id,
          shapeRef: koosSolution.shapeRef,
          placements: koosSolution.placements,
          isFull: placements.length > 0,
          name: solutionName,
          metadata: {
            username,
            foundAt: new Date().toISOString(),
            shapeName
          }
        });
        
        console.log(`✅ Solution saved: "${solutionName}" by ${username}`);
        
        // Update activeState
        setActiveState({
          schema: 'koos.state',
          version: 1,
          shapeRef: koosSolution.shapeRef,
          placements: koosSolution.placements
        });
      }
      
      // Query stats for this shape grouped by user
      const { data: shapeSolutions } = await supabase
        .from('contracts_solutions')
        .select('metadata')
        .eq('shape_id', shapeRef); // Note: database column is shape_id, not shape_ref
      
      // Group by username
      const userCounts = new Map<string, number>();
      (shapeSolutions || []).forEach(sol => {
        const user = sol.metadata?.username || 'Unknown User';
        userCounts.set(user, (userCounts.get(user) || 0) + 1);
      });
      
      const userStats = Array.from(userCounts.entries())
        .map(([username, count]) => ({ username, count }))
        .sort((a, b) => b.count - a.count);
      
      // Show stats modal
      const stats = {
        solutionName,
        alreadyExists,
        totalSolutions: (shapeSolutions || []).length,
        userStats
      };
      console.log('📊 Setting solution stats:', stats);
      setSolutionStats(stats);
      setShowSolutionSavedModal(true);
      console.log('✅ Modal should now be visible');
      
    } catch (err: any) {
      console.error('❌ Failed to auto-save solution:', err);
    }
  };

  // Save solution to cloud in koos.state@1 format
  const handleSaveSolution = async () => {
    if (!latestSolution || !containerCells || !shapeRef) {
      console.error('❌ Missing required data for save:', { latestSolution, containerCells, shapeRef });
      alert('Cannot save: missing shape or solution data');
      return;
    }
    
    const solutionName = prompt('Enter a name for this solution:', `${currentShapeName || 'Solution'} - ${new Date().toLocaleDateString()}`);
    if (!solutionName) {
      setShowSaveSolutionModal(false);
      return; // User canceled
    }
    
    try {
      console.log('💾 Saving solution in koos.state@1 format...');
      
      // Convert engine placements to koos.state@1 format
      const placements = latestSolution.map(p => ({
        pieceId: p.pieceId.toUpperCase(),
        anchorIJK: p.t as [number, number, number],
        orientationIndex: p.ori
      }));
      
      // Create koos.state@1 solution with computed ID
      const koosSolution = await createKoosSolution(shapeRef, placements);
      
      console.log(`✅ Solution ID: ${koosSolution.id.substring(0, 24)}...`);
      console.log(`   ShapeRef: ${shapeRef.substring(0, 24)}...`);
      console.log(`   Placements: ${placements.length}`);
      
      // Upload to contracts_solutions table
      await uploadContractSolution({
        id: koosSolution.id,
        shapeRef: koosSolution.shapeRef,
        placements: koosSolution.placements,
        isFull: placements.length > 0, // Assume full if any placements
        name: solutionName
      });
      
      console.log('✅ Solution saved to cloud in koos.state@1 format');
      
      // CONTRACT: Solve - After write, set activeState so View/Puzzle can use it
      setActiveState({
        schema: 'koos.state',
        version: 1,
        shapeRef: koosSolution.shapeRef,
        placements: koosSolution.placements
      });
      console.log('✅ Auto Solver: ActiveState updated with saved solution');
      
      alert(`Solution "${solutionName}" saved!\nID: ${koosSolution.id.substring(0, 24)}...\nView it in the Solution Viewer.`);
      setShowSaveSolutionModal(false);
    } catch (err: any) {
      console.error('❌ Failed to save solution:', err);
      alert('Failed to save solution: ' + err.message);
    }
  };

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
      bottom: 0
    }}>
      {/* Header - Compact three-zone design */}
      <div className="shape-header">
        <div className="header-left">
          <button className="pill pill--chrome" onClick={() => navigate('/')} title="Home">
            ⌂
          </button>
        </div>

        <div className="header-center">
          <button className="pill pill--ghost" onClick={() => navigate('/shape')} title="Return to Shape Page">
            Back to Shape
          </button>

          {orientationRecord && (
            <>
              <button className="pill pill--ghost" onClick={openSettings} title="Solver settings">
                Settings
              </button>

              <button 
                className="pill pill--primary" 
                onClick={toggleEngine}
                title={isRunning ? "Pause solver" : "Start solver"}
              >
                {isRunning ? 'Pause' : 'Start'}
              </button>
            </>
          )}
        </div>

        <div className="header-right">
          <button className="pill pill--chrome" onClick={() => setShowInfo(true)} title="About this page">
            ℹ
          </button>
        </div>
      </div>

      {/* Engine Settings Modal */}
      <EngineSettingsModal
        open={showEngineSettings}
        onClose={() => setShowEngineSettings(false)}
        engineName="Engine 2"
        currentSettings={settings}
        onSave={(newSettings) => {
          console.log('💾 Saving engine settings:', newSettings);
          setSettings(newSettings);
        }}
      />
      
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <AutoSolverCanvas 
          ref={canvasRef} 
          shapeName={currentShapeName || undefined}
          solutionsFound={solutionsFound}
          statusText={status && status.placed && status.placed > 0 ? (
            `Placed: ${status.placed} | Nodes: ${status.nodes ?? 0} | Time: ${formatElapsedTime(status.elapsedMs ?? 0)}` +
            ((status as any).nodesPerSec > 0 ? ` | ${((status as any).nodesPerSec / 1000).toFixed(1)}K/s` : '') +
            ((status as any).bestPlaced > 0 ? ` | Best: ${(status as any).bestPlaced}/${(status as any).totalPiecesTarget || '?'}` : '')
          ) : undefined}
        />
        
        {/* HUD Chips */}
        {currentShapeName && (
          <div className="hud-chip" style={{ left: '12px' }}>
            Shape: {currentShapeName}
          </div>
        )}
        {orientationRecord && (
          <div className="hud-chip" style={{ left: 'auto', right: '12px' }}>
            Status: {isRunning ? 'Solving…' : solutionsFound > 0 ? 'Done' : 'Idle'}
          </div>
        )}
      </div>

      {/* Solution Dock - Reveal & Explosion Sliders */}
      {revealMax > 0 && !revealingSolution && (
        <div className="solution-dock">
          <div className="dock-inner">
            <div className="slider-group">
              <label className="dock-label">Reveal</label>
              <input
                type="range"
                className="dock-slider"
                min={1}
                max={revealMax}
                step={1}
                value={revealK}
                onChange={(e) => setRevealK(parseInt(e.target.value, 10))}
                aria-label="Reveal Solution"
              />
            </div>
            <div className="slider-group">
              <label className="dock-label">Explosion</label>
              <input
                type="range"
                className="dock-slider"
                min={0}
                max={100}
                step={1}
                value={explosionFactor * 100}
                onChange={(e) => setExplosionFactor(parseInt(e.target.value, 10) / 100)}
                aria-label="Explosion Amount"
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Save Solution Modal */}
      {showSaveSolutionModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setShowSaveSolutionModal(false)}>
          <div style={{
            background: '#fff',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '90%',
            width: '400px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem' }}>Solution Found! 🎉</h2>
            <p style={{ margin: '0 0 1.5rem 0', color: '#666' }}>
              Would you like to save this solution to the cloud?
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                className="btn"
                onClick={() => setShowSaveSolutionModal(false)}
                style={{ background: '#f0f0f0', color: '#333' }}
              >
                Skip
              </button>
              <button
                className="btn"
                onClick={handleSaveSolution}
                style={{ background: '#007bff', color: '#fff' }}
              >
                Save to Cloud
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Modal */}
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title="Automated Solver"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.95rem' }}>
          <p style={{ margin: 0 }}>• <strong>Back to Shape</strong> – return to load or change shapes</p>
          <p style={{ margin: 0 }}>• <strong>Settings</strong> – adjust solver engine and parameters</p>
          <p style={{ margin: 0 }}>• <strong>Start</strong> – begin solving (Pause/Resume if needed)</p>
          <p style={{ margin: 0 }}>• <strong>Reveal & Explosion</strong> – appear after a solution is found for inspection</p>
          <p style={{ margin: 0 }}>• Solutions save automatically; view them later in Studio</p>
          <div style={{ 
            marginTop: '1rem', 
            padding: '0.75rem', 
            background: '#f0f9ff', 
            borderLeft: '3px solid #2196F3',
            borderRadius: '4px',
            fontSize: '0.875rem',
            color: '#1e40af'
          }}>
            💡 <strong>Tip:</strong> Use Shape Page to edit or reload your shape before solving.
          </div>
        </div>
      </InfoModal>

      {/* Solution Saved Stats Modal */}
      {showSolutionSavedModal && solutionStats && (() => {
        console.log('🔍 Rendering modal with stats:', solutionStats);
        return true;
      })() && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            pointerEvents: isDragging ? 'none' : 'auto'
          }}
        >
          <div 
            style={{
              position: modalPosition ? 'fixed' : 'relative',
              left: modalPosition?.x || 'auto',
              top: modalPosition?.y || 'auto',
              transform: modalPosition ? 'none' : 'none',
              background: '#fff',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              pointerEvents: 'auto'
            }}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).tagName !== 'BUTTON') {
                setIsDragging(true);
                const rect = e.currentTarget.getBoundingClientRect();
                setDragStart({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top
                });
              }
            }}
            onMouseMove={(e) => {
              if (isDragging && dragStart) {
                setModalPosition({
                  x: e.clientX - dragStart.x,
                  y: e.clientY - dragStart.y
                });
              }
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', cursor: 'default' }}>
              <h2 style={{ margin: 0, fontSize: '1.75rem' }}>
                {solutionStats.alreadyExists ? '⚠️ Duplicate Solution' : '✅ Solution Saved!'}
              </h2>
              <button
                onClick={() => setShowSolutionSavedModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  color: '#666'
                }}
              >
                ×
              </button>
            </div>

            {!solutionStats.alreadyExists && (
              <p style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', fontWeight: 'bold', color: '#2196F3' }}>
                {solutionStats.solutionName}
              </p>
            )}

            {solutionStats.alreadyExists && (
              <p style={{ margin: '0 0 1.5rem 0', color: '#ff9800' }}>
                This solution already exists in the database.
              </p>
            )}

            <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem' }}>
                📊 Solutions for {currentShapeName}
              </h3>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 'bold' }}>
                Total: {solutionStats.totalSolutions}
              </p>
              
              <div style={{ marginTop: '1rem' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', fontSize: '0.95rem' }}>By User:</p>
                {solutionStats.userStats.map((stat, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.5rem',
                    background: '#fff',
                    marginBottom: '0.25rem',
                    borderRadius: '4px'
                  }}>
                    <span>{stat.username}</span>
                    <span style={{ fontWeight: 'bold', color: '#2196F3' }}>{stat.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              className="btn"
              onClick={() => setShowSolutionSavedModal(false)}
              style={{
                width: '100%',
                background: '#2196F3',
                color: '#fff',
                padding: '0.75rem',
                fontSize: '1rem'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Menu Modal */}
      {showMenuModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
          onMouseMove={(e) => {
            if (menuDragging) {
              setMenuPosition({
                x: e.clientX - menuDragOffset.x,
                y: e.clientY - menuDragOffset.y
              });
            }
          }}
          onMouseUp={() => setMenuDragging(false)}
        >
          <div 
            style={{
              position: menuPosition.x === 0 && menuPosition.y === 0 ? 'relative' : 'fixed',
              left: menuPosition.x === 0 && menuPosition.y === 0 ? 'auto' : `${menuPosition.x}px`,
              top: menuPosition.y === 0 && menuPosition.y === 0 ? 'auto' : `${menuPosition.y}px`,
              background: '#fff',
              borderRadius: '12px',
              padding: '0',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              cursor: menuDragging ? 'grabbing' : 'default',
              pointerEvents: 'auto'
            }}
          >
            {/* Draggable Header */}
            <div 
              style={{
                padding: '1rem 2rem',
                cursor: 'grab',
                userSelect: 'none',
                borderBottom: '1px solid #dee2e6',
                borderRadius: '12px 12px 0 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseDown={(e) => {
                setMenuDragging(true);
                const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                setMenuDragOffset({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top
                });
              }}
            >
              <div style={{ fontSize: '2rem' }}>☰</div>
            </div>
            
            <div style={{ padding: '1rem 2rem 2rem 2rem' }}>
            <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.5rem', textAlign: 'center' }}>Menu</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                className="btn"
                onClick={() => {
                  setShowMenuModal(false);
                  navigate('/shape');
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  justifyContent: 'flex-start'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>🧩</span>
                <span>Go to Shape Page</span>
              </button>
              
              <button
                className="btn"
                onClick={() => {
                  setShowMenuModal(false);
                  openSettings();
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  justifyContent: 'flex-start'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>⚙️</span>
                <span>Engine Settings</span>
              </button>
              
              {solutionsFound > 0 && (
                <button
                  className="btn"
                  onClick={() => {
                    setShowMenuModal(false);
                    navigate('/studio');
                  }}
                  style={{
                    width: '100%',
                    padding: '1rem',
                    fontSize: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    background: '#9c27b0',
                    color: '#fff',
                    border: 'none',
                    justifyContent: 'flex-start'
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>🎥</span>
                  <span>Content Studio</span>
                </button>
              )}

              <button
                className="btn"
                onClick={() => {
                  setShowMenuModal(false);
                  setShowInfo(true);
                }}
                style={{
                  width: '100%',
                  padding: '1rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  justifyContent: 'flex-start'
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>💡</span>
                <span>Help & Information</span>
              </button>

              <button
                className="btn"
                onClick={() => setShowMenuModal(false)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  fontSize: '0.95rem',
                  background: 'transparent',
                  color: '#6c757d',
                  border: '1px solid #dee2e6'
                }}
              >
                Close
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutoSolverPage;
