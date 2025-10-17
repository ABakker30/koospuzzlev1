import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface SolutionViewerCanvasHandle {
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  renderer: THREE.WebGLRenderer | null;
  controls: OrbitControls | null;
  fitToObject: (object: THREE.Object3D) => void;
  triggerRender: () => void;
}

const SolutionViewerCanvas = forwardRef<SolutionViewerCanvasHandle>((_, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Expose methods and refs to parent
  useImperativeHandle(ref, () => ({
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    controls: controlsRef.current,
    fitToObject,
    triggerRender
  }));

  // Fit camera to object
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
    triggerRender();

    console.log(`📷 SolutionViewerCanvas: Camera fitted. Center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}), Distance: ${distance.toFixed(2)}`);
  };

  // Manual render trigger
  const triggerRender = () => {
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  // Initialize Three.js
  useEffect(() => {
    if (!mountRef.current) return;

    console.log('🎬 SolutionViewerCanvas: Initializing Three.js');

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
    
    console.log(`💡 SolutionViewerCanvas: Added ${directionalLights.length} directional lights + ambient light`);

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
    
    console.log('🎯 SolutionViewerCanvas: Using render-on-demand (no animation loop)');

    // Handle resize and re-render
    const handleResize = () => {
      if (!camera || !renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderScene(); // Re-render after resize
    };
    window.addEventListener('resize', handleResize);

    console.log('✅ SolutionViewerCanvas: Three.js initialized');

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('change', renderScene);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      console.log('🗑️ SolutionViewerCanvas: Cleaned up');
    };
  }, []);

  return (
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
  );
});

SolutionViewerCanvas.displayName = 'SolutionViewerCanvas';

export default SolutionViewerCanvas;
