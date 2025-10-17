import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface AutoSolverCanvasHandle {
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  renderer: THREE.WebGLRenderer | null;
  controls: OrbitControls | null;
  fitToObject: (object: THREE.Object3D) => void;
  triggerRender: () => void;
}

const AutoSolverCanvas = forwardRef<AutoSolverCanvasHandle>((_, ref) => {
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

  // Fit camera to object with validation
  const fitToObject = (object: THREE.Object3D) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const box = new THREE.Box3().setFromObject(object);
    
    // Validate bounding box
    if (box.isEmpty()) {
      console.warn('⚠️ AutoSolverCanvas: Empty bounding box, skipping camera update');
      return;
    }
    
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Validate center and size
    if (!isFinite(center.x) || !isFinite(center.y) || !isFinite(center.z)) {
      console.warn('⚠️ AutoSolverCanvas: Invalid center coordinates, skipping camera update');
      return;
    }

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0 || !isFinite(maxDim)) {
      console.warn('⚠️ AutoSolverCanvas: Invalid dimensions, skipping camera update');
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

    triggerRender();
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

    console.log('🎬 AutoSolverCanvas: Initializing Three.js');

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

    // Animation loop (required for damping to work smoothly)
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update(); // Required for damping
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const onResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    console.log('✅ AutoSolverCanvas: Three.js initialized');

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      console.log('🗑️ AutoSolverCanvas: Cleaned up');
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

AutoSolverCanvas.displayName = 'AutoSolverCanvas';

export default AutoSolverCanvas;
