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

// DFS Engine
import { dfsPrecompute, dfsSolve, type PieceDB, type DFSSettings, type RunHandle } from '../engines/dfs';
import type { IJK, StatusV2 } from '../engines/types';
import { loadAllPieces } from '../engines/piecesLoader';

// Import Studio styles
import '../styles/shape.css';

const AutoSolverPage: React.FC = () => {
  console.log('🎬 AutoSolverPage: Component mounted/rendered');
  
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
  
  // DFS Engine state
  const [engineReady, setEngineReady] = useState(false);
  const [containerCells, setContainerCells] = useState<IJK[]>([]);
  const [piecesDb, setPiecesDb] = useState<PieceDB>(new Map());
  const [status, setStatus] = useState<StatusV2 | undefined>(undefined);
  const [isRunning, setIsRunning] = useState(false);
  const engineHandleRef = useRef<RunHandle | null>(null);
  
  // Engine settings
  const [settings, setSettings] = useState<DFSSettings>({
    maxSolutions: 1,
    timeoutMs: 0,
    moveOrdering: "mostConstrainedCell",
    pruning: { connectivity: true, multipleOf4: true, boundaryReject: true },
    statusIntervalMs: 250,
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

  // Handle shape loading
  const onShapeLoaded = (file: ShapeFile, picked?: ShapeListItem) => {
    const shapeName = picked?.name || file.name || 'local file';
    console.log('📦 AutoSolver: Shape loaded:', shapeName);
    setCurrentShapeName(shapeName);
    setShowLoad(false);

    // Store container cells for DFS engine
    const cells = ((file as any).cells_ijk ?? file.cells) as IJK[];
    setContainerCells(cells);

    // Convert ShapeFile to ContainerJSON
    const containerJSON: ContainerJSON = {
      cells_ijk: file.cells as [number, number, number][],
      name: picked?.name || file.name
    };

    // Compute orientation
    const orient = computeOrientationFromContainer(containerJSON, picked?.id || 'local');
    setOrientationRecord(orient);

    // Build blue shape preview
    const { group } = buildShapePreviewGroup(containerJSON, orient);
    
    // Remove old preview if exists
    if (shapePreviewGroup && sceneRef.current) {
      sceneRef.current.remove(shapePreviewGroup);
    }
    
    // Add new preview
    if (sceneRef.current) {
      sceneRef.current.add(group);
      setShapePreviewGroup(group);
      
      // Fit camera
      fitToObject(group);
    }

    // Reset state
    if (solutionGroup && sceneRef.current) {
      sceneRef.current.remove(solutionGroup);
      setSolutionGroup(null);
    }
    
    // Cancel any running engine
    if (engineHandleRef.current) {
      engineHandleRef.current.cancel();
      engineHandleRef.current = null;
    }
    setIsRunning(false);
    setStatus(undefined);
    
    // Load default pieces (TODO: make this configurable)
    loadDefaultPieces();
  };
  
  // Load pieces from file
  const loadDefaultPieces = async () => {
    try {
      console.log('📦 AutoSolver: Loading pieces from file...');
      const pieces = await loadAllPieces();
      setPiecesDb(pieces);
      console.log(`✅ AutoSolver: Loaded ${pieces.size} pieces`);
    } catch (error) {
      console.error('❌ AutoSolver: Failed to load pieces:', error);
      // Fallback to minimal placeholder
      const placeholderPieces: PieceDB = new Map();
      placeholderPieces.set('A', [{ id: 0, cells: [[0,0,0], [1,0,0], [0,1,0], [0,0,1]] }]);
      placeholderPieces.set('B', [{ id: 0, cells: [[0,0,0], [1,0,0], [1,1,0], [0,1,0]] }]);
      setPiecesDb(placeholderPieces);
      console.log('⚠️ Using fallback placeholder pieces');
    }
  };

  // Fit camera to object
  const fitToObject = (object: THREE.Object3D) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
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
      console.log('🚀 AutoSolver: Starting NEW DFS run...');
      console.log(`⚙️ Settings:`, settings);
      console.log(`📦 Container: ${containerCells.length} cells`);
      console.log(`🧩 Pieces: ${piecesDb.size} types loaded`);
      
      const pre = dfsPrecompute({ cells: containerCells, id: currentShapeName || 'container' }, piecesDb);
      console.log(`✅ Precompute done: ${pre.N} cells, ${pre.pieces.size} pieces`);
      
      const handle = dfsSolve(pre, settings, {
        onStatus: (s) => {
          if (s.nodes && s.nodes % 1000 === 0) {
            console.log(`📊 Status: nodes=${s.nodes}, depth=${s.depth}, placed=${s.placed}, open=${s.open_cells}`);
          }
          setStatus(s);
          
          // Render current solution state if stack exists
          if (s.stack && s.stack.length > 0 && s.stack.length % 5 === 0) {
            renderCurrentStack(s.stack);
          }
        },
        onSolution: (placements) => {
          console.log('🎉 Solution found!', placements);
          // Render final solution
          renderSolution(placements);
        },
        onDone: (summary) => {
          console.log('✅ DFS Done:', summary);
          setIsRunning(false);
          engineHandleRef.current = null;
        }
      });
      
      console.log('🔄 DFS handle created, starting cooperative loop...');
      engineHandleRef.current = handle;
    } else {
      // Resume
      console.log('▶️ AutoSolver: Resuming DFS...');
      engineHandleRef.current.resume();
    }
    
    setIsRunning(true);
  };

  const onPause = () => {
    engineHandleRef.current?.pause();
    setIsRunning(false);
  };

  const onCancel = () => {
    engineHandleRef.current?.cancel();
    engineHandleRef.current = null;
    setIsRunning(false);
    setStatus(undefined);
  };

  // Render current DFS stack as solution
  const renderCurrentStack = (stack: { pieceId: string; ori: number; t: IJK }[]) => {
    if (stack.length === 0) return;
    
    console.log('🎨 renderCurrentStack: Converting DFS stack to SolutionJSON...');
    
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
      const oriented = orientSolutionWorld(solutionJSON);
      const { root } = buildSolutionGroup(oriented);
      
      // Remove old solution if exists
      if (solutionGroup && sceneRef.current) {
        sceneRef.current.remove(solutionGroup);
      }
      
      // Remove preview
      if (shapePreviewGroup && sceneRef.current) {
        sceneRef.current.remove(shapePreviewGroup);
        setShapePreviewGroup(null);
      }
      
      // Add new solution
      if (sceneRef.current) {
        sceneRef.current.add(root);
        setSolutionGroup(root);
        fitToObject(root);
      }
    } catch (error) {
      console.warn('⚠️ Failed to render stack:', error);
    }
  };

  const renderSolution = (placements: { pieceId: string; ori: number; t: IJK }[]) => {
    renderCurrentStack(placements);
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
            {(currentShapeName || (status && status.placed && status.placed > 0)) && (
              <div style={{ fontSize: "0.875rem", color: "#666", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {currentShapeName && (
                  <div>Loaded: {currentShapeName}</div>
                )}
                {status && status.placed && status.placed > 0 && (
                  <div>Placed: {status.placed} | Nodes: {status.nodes ?? 0} | Depth: {status.depth ?? 0} | Time: {((status.elapsedMs ?? 0) / 1000).toFixed(1)}s</div>
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
              
              {status && status.placed && status.placed > 0 && (
                <span style={{ color: "#666", fontSize: "14px" }}>
                  Placed: {status.placed} | Nodes: {status.nodes ?? 0} | Depth: {status.depth ?? 0} | Time: {((status.elapsedMs ?? 0) / 1000).toFixed(1)}s
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
