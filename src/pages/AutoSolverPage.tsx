import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Auto Solver modules
import { LoadShapeModal } from '../components/LoadShapeModal';
import { EngineSettingsModal } from '../components/EngineSettingsModal';
import { computeOrientationFromContainer } from './auto-solver/pipeline/loadAndOrient';
import { buildShapePreviewGroup } from './auto-solver/pipeline/shapePreview';
import { createEngineRenderContext, applyEngineEvent } from './auto-solver/pipeline/renderStatus';
import { createMockEngineClient, type EngineClient } from './auto-solver/engine/engineClient';
import type { EngineEvent } from './auto-solver/engine/engineTypes';
import type { ContainerJSON, OrientationRecord } from './auto-solver/types';
import type { ShapeFile, ShapeListItem } from '../services/ShapeFileService';

// Import Studio styles
import '../styles/shape.css';
// Mock engine events for testing
const MOCK_EVENTS: EngineEvent[] = [
  { type: 'started', engine: 'engine1', config: { maxDepth: 32 } },
  { type: 'progress', progress: { nodes: 120, depth: 3, placed: 1, elapsedMs: 220 } },
  { type: 'placement_add',
    placement: { pieceId: 'A', cells_ijk: [[0,0,0],[1,0,0],[0,1,0],[0,0,1]] } },
  { type: 'progress', progress: { nodes: 340, depth: 4, placed: 2, elapsedMs: 540 } },
  { type: 'placement_add',
    placement: { pieceId: 'B', cells_ijk: [[1,1,0],[1,0,1],[0,1,1],[1,1,1]] } },
  { type: 'partial_solution',
    placements: [
      { pieceId: 'A', cells_ijk: [[0,0,0],[1,0,0],[0,1,0],[0,0,1]] },
      { pieceId: 'B', cells_ijk: [[1,1,0],[1,0,1],[0,1,1],[1,1,1]] }
    ]
  }
];

const AutoSolverPage: React.FC = () => {
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
  const [engineClient, setEngineClient] = useState<EngineClient | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ nodes: 0, depth: 0, placed: 0, elapsedMs: 0 });
  const [isMobile, setIsMobile] = useState(false);
  
  const engineContextRef = useRef<ReturnType<typeof createEngineRenderContext> | null>(null);
  
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

    // Reset engine state
    if (engineClient) {
      engineClient.dispose();
      setEngineClient(null);
    }
    if (engineContextRef.current && sceneRef.current) {
      sceneRef.current.remove(engineContextRef.current.root);
      engineContextRef.current = null;
    }
    setIsRunning(false);
    setProgress({ nodes: 0, depth: 0, placed: 0, elapsedMs: 0 });
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
    setShowEngineSettings(true);
  };

  // Start/pause engine
  const toggleEngine = () => {
    if (!orientationRecord) {
      alert('Please load a shape first');
      return;
    }

    if (!engineClient) {
      // Create engine client and context
      const client = createMockEngineClient(MOCK_EVENTS);
      const context = createEngineRenderContext(orientationRecord);
      
      // Add engine root to scene
      if (sceneRef.current) {
        sceneRef.current.add(context.root);
      }
      
      engineContextRef.current = context;
      
      // Listen to events
      client.onEvent((event: EngineEvent) => {
        if (engineContextRef.current) {
          applyEngineEvent(engineContextRef.current, event);
        }
        if (event.type === 'progress') {
          setProgress(event.progress);
        }
      });
      
      setEngineClient(client);
      client.start();
      setIsRunning(true);
    } else {
      if (isRunning) {
        engineClient.pause();
        setIsRunning(false);
      } else {
        engineClient.start();
        setIsRunning(true);
      }
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
            {(currentShapeName || progress.placed > 0) && (
              <div style={{ fontSize: "0.875rem", color: "#666", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {currentShapeName && (
                  <div>Loaded: {currentShapeName}</div>
                )}
                {progress.placed > 0 && (
                  <div>Placed: {progress.placed} | Nodes: {progress.nodes} | Depth: {progress.depth} | Time: {(progress.elapsedMs / 1000).toFixed(1)}s</div>
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
                >
                  <option value="Engine 1">Engine 1</option>
                  <option value="Engine 2">Engine 2</option>
                  <option value="Engine 3">Engine 3</option>
                </select>
              </div>

              <button 
                className="btn"
                style={{ height: "2.5rem", minHeight: "2.5rem", opacity: !orientationRecord ? 0.5 : 1 }}
                onClick={toggleEngine}
                disabled={!orientationRecord}
              >
                {isRunning ? '⏸️  Pause' : '▶️  Start'}
              </button>
              
              {currentShapeName && (
                <span className="muted">
                  Loaded: {currentShapeName}
                </span>
              )}
              
              {progress.placed > 0 && (
                <span style={{ color: "#666", fontSize: "14px" }}>
                  Placed: {progress.placed} | Nodes: {progress.nodes} | Depth: {progress.depth} | Time: {(progress.elapsedMs / 1000).toFixed(1)}s
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
