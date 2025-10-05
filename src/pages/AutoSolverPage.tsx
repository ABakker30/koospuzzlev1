// src/pages/AutoSolverPage.tsx
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
import { loadStatusJson, statusToEvents } from './auto-solver/engine/statusConverter';
import type { EngineEvent } from './auto-solver/engine/engineTypes';
import type { ContainerJSON, OrientationRecord } from './auto-solver/types';
import type { ShapeFile, ShapeListItem } from '../services/ShapeFileService';

// Import Studio styles
import '../styles/shape.css';

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
  const [orientationRecord, setOrientationRecord] = useState<OrientationRecord | null>(null);
  const [shapePreviewGroup, setShapePreviewGroup] = useState<THREE.Group | null>(null);
  const [engineClient, setEngineClient] = useState<EngineClient | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ nodes: 0, depth: 0, placed: 0, elapsedMs: 0 });
  
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

  // Handle shape loading
  const onShapeLoaded = (file: ShapeFile, picked?: ShapeListItem) => {
    console.log('📦 AutoSolver: Shape loaded:', picked?.name || 'local file');
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
    const { group, R } = buildShapePreviewGroup(containerJSON, orient);
    
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

  // Start/pause engine
  const toggleEngine = async () => {
    if (!orientationRecord) {
      alert('Please load a shape first');
      return;
    }

    if (!engineClient) {
      try {
        // Load status from sample file
        console.log('🔄 AutoSolver: Loading status from sample file...');
        const status = await loadStatusJson('/data/.status/status.json');
        console.log('✅ AutoSolver: Status loaded:', status);
        
        // Convert status to events
        const events = statusToEvents(status);
        console.log(`🎬 AutoSolver: Converted to ${events.length} events`);
        
        // Hide blue shape preview when engine starts
        if (shapePreviewGroup) {
          shapePreviewGroup.visible = false;
          console.log('👻 AutoSolver: Hidden blue shape preview');
        }
        
        // Remove any existing engine context
        if (engineContextRef.current && sceneRef.current) {
          sceneRef.current.remove(engineContextRef.current.root);
          console.log('🗑️  AutoSolver: Removed previous engine context');
        }
        
        // Create new engine client with real status events
        const client = createMockEngineClient(events);
        const context = createEngineRenderContext(orientationRecord);
        
        // Add engine root to scene
        if (sceneRef.current) {
          sceneRef.current.add(context.root);
          console.log('➕ AutoSolver: Added engine placement group to scene');
        }
        
        engineContextRef.current = context;
        
        // Listen to events and trigger render on each event
        client.onEvent((event: EngineEvent) => {
          if (engineContextRef.current) {
            applyEngineEvent(engineContextRef.current, event);
          }
          if (event.type === 'progress') {
            setProgress(event.progress);
          }
          
          // Trigger render after each event
          if (rendererRef.current && cameraRef.current && sceneRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
          }
        });
        
        setEngineClient(client);
        client.start();
        setIsRunning(true);
        
        // Trigger initial render after hiding preview
        if (rendererRef.current && cameraRef.current && sceneRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      } catch (error) {
        console.error('❌ AutoSolver: Failed to load status:', error);
        alert('Failed to load engine status. Please check the console for details.');
      }
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
      {/* Header (Solution Viewer style) */}
      <div style={{ 
        padding: ".75rem 1rem", 
        borderBottom: "1px solid #eee", 
        background: "#fff",
        zIndex: 100
      }}>
        {/* First row: Buttons */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button 
              className="btn" 
              onClick={() => setShowLoad(true)}
              style={{ height: "2.5rem" }}
            >
              Browse
            </button>
            
            {/* Engine Selection Dropdown */}
            <select 
              className="btn"
              value={selectedEngine}
              onChange={(e) => setSelectedEngine(e.target.value)}
              style={{ 
                height: "2.5rem",
                paddingRight: '28px',
                cursor: 'pointer',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23666\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 6px center',
                backgroundSize: '14px'
              }}
            >
              <option value="Engine 1">Engine 1</option>
              <option value="Engine 2">Engine 2</option>
              <option value="Engine 3">Engine 3</option>
            </select>
            
            <button 
              className="btn" 
              onClick={() => setShowEngineSettings(true)}
              title={`Configure ${selectedEngine} settings`}
              style={{ height: "2.5rem" }}
            >
              Settings
            </button>
            
            <button 
              className="btn" 
              onClick={toggleEngine} 
              disabled={!orientationRecord}
              style={{ 
                height: "2.5rem",
                ...(orientationRecord ? {} : { opacity: 0.5 })
              }}
            >
              {isRunning ? '⏸️  Pause' : '▶️  Start'}
            </button>
          </div>

          {/* Right aligned Home button */}
          <button 
            className="btn" 
            onClick={() => navigate('/')}
            style={{ 
              height: "2.5rem", 
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

        {/* Second row: Progress display */}
        {progress.placed > 0 && (
          <div style={{ fontSize: '14px', color: '#667' }}>
            Placed: {progress.placed} | Nodes: {progress.nodes} | Depth: {progress.depth} | Time: {(progress.elapsedMs / 1000).toFixed(1)}s
          </div>
        )}
      </div>

      {/* Three.js canvas mount (viewport) */}
      <div className="viewport" ref={mountRef} style={{ flex: 1, position: 'relative' }} />

      {/* Load Shape Modal */}
      {showLoad && (
        <LoadShapeModal
          open={showLoad}
          onLoaded={onShapeLoaded}
          onClose={() => setShowLoad(false)}
        />
      )}

      {/* Engine Settings Modal */}
      <EngineSettingsModal
        open={showEngineSettings}
        onClose={() => setShowEngineSettings(false)}
        engineName={selectedEngine}
      />
    </div>
  );
};

export default AutoSolverPage;
