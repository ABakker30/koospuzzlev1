import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Auto Solver modules
import { LoadShapeModal } from '../components/LoadShapeModal';
import { EngineSettingsModal } from '../components/EngineSettingsModal';
import { computeOrientationFromContainer } from './auto-solver/pipeline/loadAndOrient';
import { buildShapePreviewGroup } from './auto-solver/pipeline/shapePreview';
import type { ContainerJSON, OrientationRecord } from './auto-solver/types';
import type { ShapeFile, ShapeListItem } from '../services/ShapeFileService';

// Solution Viewer pipeline for rendering placements
import { orientSolutionWorld } from './solution-viewer/pipeline/orient';
import { buildSolutionGroup } from './solution-viewer/pipeline/build';
import type { SolutionJSON } from './solution-viewer/types';

// DFS Engine (DFS2 - clean pausable version)
import { dfs2Precompute, dfs2Solve, type PieceDB, type DFS2RunHandle } from '../engines/dfs2';
import { engine2Solve, engine2Precompute, type Engine2RunHandle } from '../engines/engine2';
import type { Engine2Settings } from '../engines/engine2';
import type { StatusV2 } from '../engines/types';
import { loadAllPieces } from '../engines/piecesLoader';

// Import Studio styles
import '../styles/shape.css';

type IJK = [number, number, number];

const AutoSolverPage: React.FC = () => {
  console.log('🎬 AutoSolverPage: Component mounted/rendered (DFS2 version)');
  
  const navigate = useNavigate();
  const mountRef = useRef<HTMLDivElement>(null);
  
  // Three.js refs (Solution Viewer pattern)
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<OrbitControls>();
  
  // State
  const [showLoad, setShowLoad] = useState(false);
  const [showEngineSettings, setShowEngineSettings] = useState(false);
  const [selectedEngine, setSelectedEngine] = useState<string>('Engine 1');
  const [currentShapeName, setCurrentShapeName] = useState<string | null>(null);
  const [orientationRecord, setOrientationRecord] = useState<OrientationRecord | null>(null);
  const [shapePreviewGroup, setShapePreviewGroup] = useState<THREE.Group | null>(null);
  const [solutionGroup, setSolutionGroup] = useState<THREE.Group | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
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
  const engineHandleRef = useRef<DFS2RunHandle | Engine2RunHandle | null>(null);
  
  // Engine settings (use Engine2Settings which is superset of DFS2Settings)
  const [settings, setSettings] = useState<Engine2Settings>({
    maxSolutions: 1,
    timeoutMs: 0,
    moveOrdering: "mostConstrainedCell",
    pruning: { connectivity: true, multipleOf4: true },
    statusIntervalMs: 250,
    // Engine 2 specific (defaults that can be overridden)
    seed: 12345,
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
    visualRevealDelayMs: 150,
  });
  
  // Initialize Three.js (Solution Viewer pattern)
  useEffect(() => {
    if (!mountRef.current) return;

    console.log('🎬 AutoSolver: Initializing Three.js (Solution Viewer pattern)');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Black background

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;

    // Enhanced lighting (Solution Viewer pattern)
    const ambient = new THREE.AmbientLight(0x202040, 0.75);
    scene.add(ambient);

    const directionalLights = [
      { position: [15, 20, 10], intensity: 3.0, castShadow: true },
      { position: [-12, 15, -8], intensity: 2.0, castShadow: false },
      { position: [10, -8, 12], intensity: 1.5, castShadow: false },
      { position: [-8, -5, -10], intensity: 1.25, castShadow: false }
    ];

    directionalLights.forEach(({ position, intensity, castShadow }) => {
      const light = new THREE.DirectionalLight(0xffffff, intensity);
      light.position.set(position[0], position[1], position[2]);
      if (castShadow) {
        light.castShadow = true;
        light.shadow.mapSize.width = 2048;
        light.shadow.mapSize.height = 2048;
        light.shadow.camera.near = 0.1;
        light.shadow.camera.far = 50;
        light.shadow.camera.left = -20;
        light.shadow.camera.right = 20;
        light.shadow.camera.top = 20;
        light.shadow.camera.bottom = -20;
      }
      scene.add(light);
    });

    // Shadow plane
    const shadowPlaneGeo = new THREE.PlaneGeometry(100, 100);
    const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // Mount to DOM
    mountRef.current.appendChild(renderer.domElement);

    // Store refs
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    // Render-on-demand
    let needsRender = true;
    const render = () => {
      if (needsRender && sceneRef.current && cameraRef.current && rendererRef.current) {
        controls.update();
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        needsRender = false;
      }
      requestAnimationFrame(render);
    };
    render();

    const requestRender = () => { needsRender = true; };
    controls.addEventListener('change', requestRender);

    // Handle window resize
    const onResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      renderer.dispose();
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Detect mobile on mount
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
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

  // Handle shape loading
  const onShapeLoaded = (file: ShapeFile, picked?: ShapeListItem) => {
    const shapeName = picked?.name || file.name || 'local file';
    console.log('🔄 AutoSolver: NEW SHAPE LOADED - Resetting all state...');
    console.log(`   Shape: ${shapeName}`);
    console.log(`   Cells: ${file.cells.length}`);
    
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
    if (sceneRef.current) {
      console.log('🧹 Clearing scene...');
      
      // Remove previous preview
      if (shapePreviewGroup) {
        console.log('  Removing shape preview...');
        sceneRef.current.remove(shapePreviewGroup);
        setShapePreviewGroup(null);
      }
      
      // Remove previous solution
      if (solutionGroup) {
        console.log('  Removing solution group...');
        sceneRef.current.remove(solutionGroup);
        solutionGroupRef.current = null;  // Clear ref immediately
        setSolutionGroup(null);
      }
      
      // Extra safety: Remove all non-light objects from scene
      const objectsToRemove: THREE.Object3D[] = [];
      sceneRef.current.traverse((obj) => {
        if (obj !== sceneRef.current && 
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
    const cells = ((file as any).cells_ijk ?? file.cells) as IJK[];
    setContainerCells(cells);
    console.log(`✅ Container cells stored: ${cells.length}`);
    
    // Reset orientation and solution references for new shape
    baseOrientedSolutionRef.current = null;
    solutionGroupRef.current = null;

    // 4. Convert ShapeFile to ContainerJSON
    const containerJSON: ContainerJSON = {
      cells_ijk: file.cells as [number, number, number][],
      name: picked?.name || file.name
    };

    // 5. Compute orientation for new shape
    const orient = computeOrientationFromContainer(containerJSON, picked?.id || 'local');
    setOrientationRecord(orient);
    console.log('✅ Orientation computed');

    // 6. Build and display new blue shape preview
    const { group } = buildShapePreviewGroup(containerJSON, orient);
    
    if (sceneRef.current) {
      sceneRef.current.add(group);
      setShapePreviewGroup(group);
      
      // Fit camera to new shape
      fitToObject(group);
      console.log('✅ Preview rendered and camera fitted');
    }

    // 7. Update UI state
    setCurrentShapeName(shapeName);
    setShowLoad(false);
    
    // 8. Pieces database will be loaded separately
    console.log('✅ AutoSolver: Reset complete, ready for new solve!');
  };

  // Fit camera to object
  const fitToObject = (object: THREE.Object3D) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const box = new THREE.Box3().setFromObject(object);
    
    // Validate bounding box
    if (box.isEmpty()) {
      console.warn('⚠️ fitToObject: Empty bounding box, skipping camera update');
      return;
    }
    
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Validate center and size
    if (!isFinite(center.x) || !isFinite(center.y) || !isFinite(center.z)) {
      console.warn('⚠️ fitToObject: Invalid center coordinates, skipping camera update');
      return;
    }

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0 || !isFinite(maxDim)) {
      console.warn('⚠️ fitToObject: Invalid dimensions, skipping camera update');
      return;
    }
    
    const distance = maxDim * 2;

    cameraRef.current.position.set(
      center.x + distance * 0.7,
      center.y + distance * 0.7,
      center.z + distance * 0.7
    );

    controlsRef.current.target.copy(center);
    controlsRef.current.update();

    if (rendererRef.current && sceneRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  // Handle engine selection
  const handleEngineChange = (engineName: string) => {
    setSelectedEngine(engineName);
    
    // For Engine 1 (DFS), mark as ready
    if (engineName === 'Engine 1') {
      setEngineReady(true);
    }
    
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
      console.log(`🚀 AutoSolver: Starting NEW ${selectedEngine} run...`);
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
      
      let handle: DFS2RunHandle | Engine2RunHandle;
      
      if (selectedEngine === 'Engine 2') {
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
            
            // Render current search state (already throttled to statusIntervalMs)
            if (s.stack && s.stack.length > 0) {
              renderCurrentStack(s.stack);
            }
          },
          onSolution: (placements) => {
            // Engine pauses automatically if pauseOnSolution is true
            // Reflect that in UI state
            if (settings.pauseOnSolution ?? true) {
              setIsRunning(false);
            }
            
            // Update solution count and render
            setSolutionsFound(prev => {
              const newCount = prev + 1;
              console.log(`🎉 Solution #${newCount} found!`, placements);
              console.log(`   Pieces: ${placements.map(p => p.pieceId).join(',')}`);
              
              // Render final solution
              renderSolution(placements);
              
              return newCount;
            });
          },
          onDone: (summary) => {
            console.log('✅ Engine2 Done:', summary);
            setIsRunning(false);
            engineHandleRef.current = null;
          }
        });
        
        console.log('🔄 Engine2 handle created, starting cooperative loop...');
      } else {
        // Default to Engine 1 (DFS2)
        console.log('🔧 About to call dfs2Precompute...');
        const pre = dfs2Precompute({ cells: containerCells, id: currentShapeName || 'container' }, piecesDb);
        console.log(`✅ Precompute done: ${pre.N} cells, ${pre.pieces.size} pieces`);
        
        console.log('🔧 About to call dfs2Solve...');
        handle = dfs2Solve(pre, settings, {
          onStatus: (s) => {
            setStatus(s);
            
            // Render current search state (already throttled to statusIntervalMs)
            if (s.stack && s.stack.length > 0) {
              renderCurrentStack(s.stack);
            }
          },
          onSolution: (placements) => {
            // Engine pauses automatically if pauseOnSolution is true
            // Reflect that in UI state
            if (settings.pauseOnSolution ?? true) {
              setIsRunning(false);
            }
            
            // Update solution count and render
            setSolutionsFound(prev => {
              const newCount = prev + 1;
              console.log(`🎉 Solution #${newCount} found!`, placements);
              console.log(`   Pieces: ${placements.map(p => p.pieceId).join(',')}`);
              
              // Render final solution
              renderSolution(placements);
              
              return newCount;
            });
          },
          onDone: (summary) => {
            console.log('✅ DFS Done:', summary);
            setIsRunning(false);
            engineHandleRef.current = null;
          }
        });
        
        console.log('🔄 DFS handle created, starting cooperative loop...');
      }
      
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
  const renderCurrentStack = (stack: { pieceId: string; ori: number; t: IJK }[], fitCamera: boolean = false) => {
    if (!sceneRef.current) return;
    if (stack.length === 0) return;
    
    console.log('🎨 renderCurrentStack: Converting DFS stack to SolutionJSON...');
    
    // CRITICAL: Remove previous solution group immediately using ref (not state)
    if (solutionGroupRef.current) {
      console.log('🧹 Clearing previous solution group from scene');
      sceneRef.current.remove(solutionGroupRef.current);
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
    if (shapePreviewGroup) {
      sceneRef.current.remove(shapePreviewGroup);
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
      
      const { root } = buildSolutionGroup(oriented);
      console.log(`✅ Solution group built with ${root.children.length} children`);
      
      // Hide all pieces initially
      root.children.forEach(child => {
        child.visible = false;
      });
      
      // Add new solution to scene and track it immediately in ref
      sceneRef.current.add(root);
      solutionGroupRef.current = root;  // Immediate tracking for next cleanup
      setSolutionGroup(root);
      
      // Fit camera if requested (for complete solutions, not intermediate status)
      if (fitCamera) {
        fitToObject(root);
      }
      
      // Animate pieces appearing one by one with configurable delay
      const delayMs = settings.visualRevealDelayMs ?? 150;
      root.children.forEach((child, index) => {
        setTimeout(() => {
          child.visible = true;
          // Trigger render update after each piece appears
          if (rendererRef.current && cameraRef.current && sceneRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
          }
        }, index * delayMs);
      });
      
      console.log('✅ Solution added to scene with animated reveal');
    } catch (error) {
      console.error('❌ Failed to render stack:', error);
    }
  };

  const renderSolution = (placements: { pieceId: string; ori: number; t: IJK }[]) => {
    renderCurrentStack(placements, true);  // Fit camera for complete solutions
  };

  // Start/pause engine (legacy wrapper)
  const toggleEngine = () => {
    if (isRunning) {
      onPause();
    } else {
      onPlay();
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
      {/* Header */}
      <div style={{ 
        padding: isMobile ? ".5rem .75rem" : ".75rem 1rem", 
        borderBottom: "1px solid #eee", 
        background: "#fff"
      }}>
        {isMobile ? (
          /* Mobile: Two lines */
          <>
            {/* Mobile Line 1: Browse | Controls | Home */}
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "space-between",
              marginBottom: "0.5rem"
            }}>
              <button 
                className="btn" 
                style={{ height: "2.5rem", minHeight: "2.5rem" }} 
                onClick={() => setShowLoad(true)}
              >
                Browse Shape
              </button>

              <div style={{ position: "relative" }}>
                <select
                  className="btn"
                  style={{ height: "2.5rem", minHeight: "2.5rem", paddingRight: "1.5rem" }}
                  value={selectedEngine}
                  onChange={(e) => handleEngineChange(e.target.value)}
                  onClick={() => setShowEngineSettings(true)}
                >
                  <option value="Engine 1">Engine 1</option>
                  <option value="Engine 2">Engine 2</option>
                  <option value="Engine 3">Engine 3</option>
                </select>
              </div>

              <button 
                className="btn" 
                onClick={toggleEngine}
                disabled={!orientationRecord}
                style={{ height: "2.5rem", minHeight: "2.5rem", opacity: !orientationRecord ? 0.5 : 1 }}
              >
                {isRunning ? '⏸️  Pause' : '▶️  Start'}
              </button>
              
              <button 
                className="btn" 
                onClick={() => navigate('/')}
                style={{ 
                  height: "2.5rem",
                  minHeight: "2.5rem",
                  width: "2.5rem", 
                  minWidth: "2.5rem", 
                  padding: "0", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  fontFamily: "monospace", 
                  fontSize: "1.4em" 
                }}
                title="Home"
              >
                ⌂
              </button>
            </div>
            
            {/* Mobile Line 2: Status and Progress */}
            {(currentShapeName || solutionsFound > 0 || (status && status.placed && status.placed > 0)) && (
              <div style={{ fontSize: "0.875rem", color: "#666", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {currentShapeName && (
                  <div>Loaded: {currentShapeName}</div>
                )}
                {solutionsFound > 0 && (
                  <div style={{ color: "#0a0", fontWeight: "bold" }}>✅ Solutions: {solutionsFound}</div>
                )}
                {status && status.placed && status.placed > 0 && (
                  <div>
                    Placed: {status.placed} | Nodes: {status.nodes ?? 0} | Time: {formatElapsedTime(status.elapsedMs ?? 0)}
                    {(status as any).nodesPerSec > 0 && <span style={{ color: "#888" }}> | {((status as any).nodesPerSec / 1000).toFixed(1)}K/s</span>}
                    {(status as any).bestPlaced > 0 && <span style={{ color: "#0af" }}> | Best: {(status as any).bestPlaced}/{(status as any).totalPiecesTarget || '?'}</span>}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Desktop: Single line */
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <button 
                className="btn" 
                style={{ height: "2.5rem", minHeight: "2.5rem" }}
                onClick={() => setShowLoad(true)}
              >
                Browse Shape
              </button>

              <div style={{ position: "relative" }}>
                <select
                  className="btn"
                  style={{ height: "2.5rem", minHeight: "2.5rem", paddingRight: "1.5rem" }}
                  value={selectedEngine}
                  onChange={(e) => handleEngineChange(e.target.value)}
                  onClick={() => setShowEngineSettings(true)}
                >
                  <option value="Engine 1">Engine 1</option>
                  <option value="Engine 2">Engine 2</option>
                  <option value="Engine 3">Engine 3</option>
                </select>
              </div>
              
              <button 
                className="btn" 
                onClick={toggleEngine}
                disabled={!orientationRecord}
                style={{ opacity: !orientationRecord ? 0.5 : 1 }}
              >
                {isRunning ? '⏸️  Pause' : '▶️  Start'}
              </button>
              {currentShapeName && (
                <span className="muted">
                  Loaded: {currentShapeName}
                </span>
              )}
              
              {solutionsFound > 0 && (
                <span style={{ color: "#0a0", fontWeight: "bold", fontSize: "14px" }}>
                  ✅ Solutions: {solutionsFound}
                </span>
              )}
              
              {status && status.placed && status.placed > 0 && (
                <span style={{ color: "#666", fontSize: "14px" }}>
                  Placed: {status.placed} | Nodes: {status.nodes ?? 0} | Time: {formatElapsedTime(status.elapsedMs ?? 0)}
                  {(status as any).nodesPerSec > 0 && <span style={{ color: "#888" }}> | {((status as any).nodesPerSec / 1000).toFixed(1)}K/s</span>}
                  {(status as any).bestPlaced > 0 && <span style={{ color: "#0af" }}> | Best: {(status as any).bestPlaced}/{(status as any).totalPiecesTarget || '?'}</span>}
                </span>
              )}
            </div>

            {/* Right aligned icon buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button 
                className="btn" 
                onClick={() => navigate('/')}
                style={{ 
                  height: "2.5rem",
                  minHeight: "2.5rem",
                  width: "2.5rem", 
                  minWidth: "2.5rem", 
                  padding: "0", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  fontFamily: "monospace", 
                  fontSize: "1.4em" 
                }}
                title="Home"
              >
                ⌂
              </button>
            </div>
          </div>
        )}
        
        {/* Load Shape Modal */}
        <LoadShapeModal
          open={showLoad}
          onLoaded={onShapeLoaded}
          onClose={() => setShowLoad(false)}
        />

        {/* Engine Settings Modal */}
        <EngineSettingsModal
          open={showEngineSettings}
          onClose={() => setShowEngineSettings(false)}
          engineName={selectedEngine}
          currentSettings={settings}
          onSave={(newSettings) => {
            console.log('💾 Saving engine settings:', newSettings);
            setSettings(newSettings);
          }}
        />
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div
          ref={mountRef}
          style={{ 
            width: "100%", 
            height: "100%", 
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 1
          }}
        />

        {/* Instructions */}
        {!orientationRecord && (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none"
          }}>
            <div style={{ textAlign: "center" }}>
              <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#111827", marginBottom: "0.5rem" }}>Auto Solver</h2>
              <p style={{ color: "#6b7280", marginBottom: "1rem" }}>Click Browse Shape to load a container and start solving</p>
              <div style={{ fontSize: "0.875rem", color: "#9ca3af" }}>
                <p>• Load a shape to see the solving process</p>
                <p>• Drag to orbit, scroll to zoom</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AutoSolverPage;
