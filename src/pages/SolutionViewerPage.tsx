import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';

// Solution Viewer modules
import { orientSolutionWorld } from './solution-viewer/pipeline/orient';
import { buildSolutionGroup, computeRevealOrder, applyRevealK } from './solution-viewer/pipeline/build';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LoadSolutionModal } from '../components/LoadSolutionModal';
import type { LoadedSolution, PieceOrderEntry, SolutionJSON } from './solution-viewer/types';

// Import Studio styles
import '../styles/shape.css';

const SolutionViewerPage: React.FC = () => {
  const navigate = useNavigate();
  const mountRef = useRef<HTMLDivElement>(null);
  
  // Three.js refs (Studio pattern)
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<OrbitControls>();
  // State
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [solution, setSolution] = useState<LoadedSolution | null>(null);
  const [order, setOrder] = useState<PieceOrderEntry[]>([]);
  const [revealMax, setRevealMax] = useState<number>(1);
  const [revealK, setRevealK] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  
  // Optimized material settings applied directly in build.ts:
  // brightness: 2.50, metalness: 0.40, reflectiveness: 0.90, bondRadius: 0.35
  const [isMobile, setIsMobile] = useState(false);
  // const [bondsVisible, setBondsVisible] = useState(true);

  const solutionRootRef = useRef<THREE.Group | null>(null);
  
  // Helper functions (Studio pattern)
  const fitToObject = (object: THREE.Object3D) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2;

    // Position camera
    cameraRef.current.position.set(
      center.x + distance * 0.7,
      center.y + distance * 0.7,
      center.z + distance * 0.7
    );

    // Set controls target
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
    
    // Trigger re-render after camera fit
    if (rendererRef.current && sceneRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }

    console.log(`📷 SolutionViewer: Camera fitted to object. Center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}), Distance: ${distance.toFixed(2)}`);
  };

  // Initialize Three.js (Studio pattern)
  useEffect(() => {
    if (!mountRef.current) return;

    console.log('🎬 SolutionViewer: Initializing Three.js (Studio pattern)');

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
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    // Optimize control responsiveness
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;

    // Enhanced lighting for glossy materials on black background (brightness: 2.50)
    const ambient = new THREE.AmbientLight(0x202040, 0.75); // Subtle blue-tinted ambient (0.3 × 2.5)
    scene.add(ambient);

    // Strategic lighting for glossy sphere reflections (brightness: 2.50)
    const directionalLights = [
      { position: [15, 20, 10], intensity: 3.0, castShadow: true, color: 0xffffff },   // Main key light (1.2 × 2.5)
      { position: [-12, 15, -8], intensity: 2.0, castShadow: false, color: 0xffffff }, // Back-left fill (0.8 × 2.5)
      { position: [10, -8, 12], intensity: 1.5, castShadow: false, color: 0xffffff },  // Bottom-front (0.6 × 2.5)
      { position: [-8, -5, -10], intensity: 1.25, castShadow: false, color: 0xffffff } // Bottom-back (0.5 × 2.5)
    ];

    directionalLights.forEach(({ position, intensity, castShadow }) => {
      const light = new THREE.DirectionalLight(0xffffff, intensity);
      light.position.set(position[0], position[1], position[2]);
      light.userData.originalIntensity = intensity; // Store original for brightness adjustment
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
    
    console.log(`💡 SolutionViewer: Added ${directionalLights.length} directional lights + ambient light`);

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

    // Render-on-demand: only render when user interacts
    const renderScene = () => {
      renderer.render(scene, camera);
    };
    
    // Initial render
    renderScene();
    
    // Re-render only when controls change (user interaction)
    controls.addEventListener('change', renderScene);
    
    console.log('🎯 SolutionViewer: Using render-on-demand (no animation loop)');

    // Handle resize and re-render
    const handleResize = () => {
      if (!camera || !renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderScene(); // Re-render after resize
    };
    window.addEventListener('resize', handleResize);

    console.log('✅ SolutionViewer: Three.js initialized (Studio pattern)');

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('change', renderScene);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Detect mobile on mount
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle solution loading (called from LoadSolutionModal)
  const onLoaded = async (solutionData: SolutionJSON, filename: string) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`📡 SolutionViewer: *** NEW CODE VERSION ${timestamp} *** onLoaded called with ${filename}`);
    
    // Close the modal
    setShowLoad(false);
    
    setLoading(true);
    setCurrentPath(filename);
    
    try {
      console.log(`🎯 SolutionViewer: Processing ${filename}`);
      
      // 1) Solution data already parsed by modal
      const raw = solutionData;
      
      // 2) Orient via Studio pipeline
      console.log(`🧭 SolutionViewer: Raw solution has ${raw.placements?.length || 0} placements`);
      const oriented = orientSolutionWorld(raw);
      console.log(`🧭 SolutionViewer: Oriented solution has ${oriented.pieces?.length || 0} pieces`);
      console.log(`🧭 SolutionViewer: First oriented piece:`, oriented.pieces?.[0]);
      
      // 3) Build high-quality meshes
      console.log(`🔨 SolutionViewer: *** ABOUT TO CALL buildSolutionGroup ***`);
      console.log(`🔨 SolutionViewer: Building solution group...`);
      const { root, pieceMeta } = buildSolutionGroup(oriented);
      console.log(`🔨 SolutionViewer: *** RETURNED FROM buildSolutionGroup ***`);
      console.log(`🔨 SolutionViewer: Solution group built with ${root.children.length} piece groups`);
      
      // 4) Replace prior root and attach (Studio pattern)
      console.log(`🎭 SolutionViewer: Adding solution to scene...`);
      
      if (!sceneRef.current) {
        console.warn(`⚠️ SolutionViewer: Scene not ready`);
        return;
      }
      
      // Remove previous solution if exists
      if (solutionRootRef.current) {
        sceneRef.current.remove(solutionRootRef.current);
        console.log(`🗑️ SolutionViewer: Removed previous solution`);
      }
      
      // Add new solution
      sceneRef.current.add(root);
      solutionRootRef.current = root;
      console.log(`🎭 SolutionViewer: Added solution (${root.children.length} pieces) to scene`);
      
      // Trigger re-render for new solution
      if (rendererRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      
      // 5) Fit camera
      if (root.children.length > 0) {
        console.log(`📷 SolutionViewer: Fitting camera to root with ${root.children.length} children`);
        fitToObject(root);
      } else {
        console.warn(`⚠️ SolutionViewer: Root has no children, skipping camera fit`);
      }
      
      // 6) Compute reveal order
      const revealOrder = computeRevealOrder(pieceMeta);
      setOrder(revealOrder);
      setRevealMax(revealOrder.length);
      setRevealK(revealOrder.length); // Show all by default
      
      // 7) Save state
      setSolution({ path: filename, oriented, root, pieceMeta });
      
      console.log(`✅ SolutionViewer: Loaded ${filename} with ${revealOrder.length} pieces`);
    } catch (error) {
      console.error('Failed to load solution:', error);
      alert(`Failed to load ${filename}: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Apply reveal changes
  useEffect(() => {
    if (!solution || !order.length || !solutionRootRef.current) return;
    console.log(`👁️ SolutionViewer: Applying reveal K=${revealK}/${order.length}`);
    applyRevealK(solutionRootRef.current, order, revealK);
    
    // Trigger re-render after reveal changes
    if (rendererRef.current && cameraRef.current && sceneRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, [solution, order, revealK]);

  // Debug showLoad state changes
  useEffect(() => {
    console.log(`📁 SolutionViewer: showLoad changed to: ${showLoad}`);
  }, [showLoad]);

  // // Handle view reset
  // const handleResetView = () => {
  //   if (solutionRootRef.current) {
  //     fitToObject(solutionRootRef.current);
  //   }
  // };

  // // Handle bonds toggle
  // const handleToggleBonds = () => {
  //   if (!solutionRootRef.current) return;
    
  //   const newBondsVisible = !bondsVisible;
  //   setBondsVisible(newBondsVisible);
    
  //   // Toggle visibility of all bond meshes
  //   solutionRootRef.current.traverse((child) => {
  //     if (child instanceof THREE.Mesh && child.geometry instanceof THREE.CylinderGeometry) {
  //       child.visible = newBondsVisible;
  //     }
  //   });
  // };

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
            {/* Mobile Line 1: Browse | Home */}
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "space-between",
              marginBottom: "0.5rem"
            }}>
              <button 
                className="btn" 
                style={{ height: "2.5rem" }} 
                onClick={() => setShowLoad(true)}
              >
                Browse
              </button>
              
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
            
            {/* Mobile Line 2: Reveal Slider */}
            {solution && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.875rem", fontWeight: "500" }}>Reveal</span>
                <input
                  type="range"
                  min={1}
                  max={Math.max(1, revealMax)}
                  step={1}
                  value={revealK}
                  onChange={(e) => setRevealK(parseInt(e.target.value, 10))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: "0.875rem", fontFamily: "monospace", minWidth: "3rem" }}>
                  {revealK}/{revealMax}
                </span>
              </div>
            )}
          </>
        ) : (
          /* Desktop: Single line */
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <button 
                className="btn" 
                onClick={() => setShowLoad(true)}
              >
                Browse
              </button>
              
              {/* Reveal Slider */}
              {solution && order.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    Reveal: {revealK} / {revealMax}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max={revealMax}
                    value={revealK}
                    onChange={(e) => setRevealK(parseInt(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>
              )}
              {currentPath && (
                <span className="muted">
                  Loaded: {currentPath}
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
        
        {/* Load Solution Modal */}
        <LoadSolutionModal
          open={showLoad}
          onLoaded={onLoaded}
          onClose={() => setShowLoad(false)}
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
        
        {/* Loading Overlay */}
        {loading && (
          <div style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10
          }}>
            <div style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "1.5rem",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{
                  width: "1.5rem",
                  height: "1.5rem",
                  border: "2px solid #e5e7eb",
                  borderTop: "2px solid #3b82f6",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite"
                }}></div>
                <span style={{ fontWeight: "500" }}>Loading solution...</span>
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!solution && !loading && (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 10
          }}>
            <div style={{ textAlign: "center", maxWidth: '420px', padding: '2rem', backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#111827", marginBottom: "1rem" }}>
                Solution Viewer
              </h2>
              <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
                Analyze and visualize puzzle solutions in 3D
              </p>
              <div style={{ fontSize: "0.875rem", color: "#9ca3af", textAlign: 'left', display: 'inline-block', lineHeight: '1.6' }}>
                <p><strong style={{ color: '#111827' }}>Getting Started:</strong></p>
                <p>• Click <strong>Browse</strong> to load a solution file</p>
                <p>• Solutions auto-orient with largest face on ground</p>
                <p><br/><strong style={{ color: '#111827' }}>Features:</strong></p>
                <p>• <strong>Reveal Slider</strong>: Show pieces sequentially</p>
                <p>• View pieces in assembly order</p>
                <p>• Distinct colors for each piece</p>
                <p><br/><strong style={{ color: '#111827' }}>Controls:</strong></p>
                <p>• Drag to orbit view</p>
                <p>• Scroll to zoom in/out</p>
                <p>• Pan with right-click drag</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Piece Information Panel - Temporarily disabled for debugging */}
        {/* {solution && order.length > 0 && (
          <PieceInfo pieces={order} revealK={revealK} />
        )} */}
        
        {/* View Controls - Removed per user request */}
      </div>

      {/* Click outside handler removed - now using backdrop in modal */}
    </div>
  );
};

export default SolutionViewerPage;
