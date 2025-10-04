import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { HDRLoader } from '../../../services/HDRLoader';

export interface ThreeEnvObjects {
  scene: THREE.Scene | undefined;
  camera: THREE.PerspectiveCamera | undefined;
  renderer: THREE.WebGLRenderer | undefined;
  controls: OrbitControls | undefined;
  hdrLoader: HDRLoader | undefined;
}

export interface UseThreeEnvReturn extends ThreeEnvObjects {
  mountRef: React.RefObject<HTMLDivElement>;
  fitToObject: (object: THREE.Object3D) => void;
  disposePreviousRoot: (object: THREE.Object3D | null) => void;
  isReady: boolean;
}

export function useThreeEnv(): UseThreeEnvReturn {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  
  // Core Three.js objects
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<OrbitControls>();
  const hdrLoaderRef = useRef<HDRLoader>();
  const animationIdRef = useRef<number>();

  // Initialize Three.js environment
  useEffect(() => {
    if (!mountRef.current) {
      console.log('⚠️ ThreeEnv: No mount ref, skipping initialization');
      return;
    }
    if (sceneRef.current) {
      console.log('⚠️ ThreeEnv: Scene already exists, skipping re-initialization');
      return;
    }

    const timestamp = new Date().toLocaleTimeString();
    console.log(`🎬 ThreeEnv: Initializing Three.js environment at ${timestamp}`);

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Camera
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(10, 10, 10);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI; // Allow full rotation

    // HDR Loader
    const hdrLoader = HDRLoader.getInstance();

    // Lighting setup (Studio-style)
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambientLight);

    // Key directional light with shadows
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(10, 10, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 50;
    keyLight.shadow.camera.left = -20;
    keyLight.shadow.camera.right = 20;
    keyLight.shadow.camera.top = 20;
    keyLight.shadow.camera.bottom = -20;
    scene.add(keyLight);

    // Fill lights
    const fillLight1 = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight1.position.set(-5, 5, 5);
    scene.add(fillLight1);

    const fillLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight2.position.set(5, -5, -5);
    scene.add(fillLight2);

    // Shadow plane
    const shadowPlaneGeo = new THREE.PlaneGeometry(100, 100);
    const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // Scene is ready for content

    // Mount to DOM
    console.log('🎬 ThreeEnv: Mounting renderer to DOM element:', mountRef.current);
    mountRef.current.appendChild(renderer.domElement);
    console.log('🎬 ThreeEnv: Renderer canvas size:', renderer.domElement.width, 'x', renderer.domElement.height);
    
    // Test canvas visibility
    const canvas = renderer.domElement;
    console.log('🎬 ThreeEnv: Canvas style:', {
      display: canvas.style.display,
      visibility: canvas.style.visibility,
      opacity: canvas.style.opacity,
      zIndex: canvas.style.zIndex,
      position: canvas.style.position
    });
    
    // Force canvas to be visible
    canvas.style.display = 'block';
    canvas.style.visibility = 'visible';
    canvas.style.opacity = '1';
    console.log('🎬 ThreeEnv: Forced canvas to be visible');

    // Store refs
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    hdrLoaderRef.current = hdrLoader;

    // Start render loop
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      animationIdRef.current = requestAnimationFrame(animate);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!camera || !renderer || !mountRef.current) return;
      const container = mountRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      console.log(`📱 ThreeEnv: Resized to ${width}x${height}`);
    };
    
    // Initial size setup
    handleResize();
    window.addEventListener('resize', handleResize);

    setIsReady(true);
    console.log('✅ ThreeEnv: Three.js environment ready');
    console.log('✅ ThreeEnv: Scene created:', scene);
    console.log('✅ ThreeEnv: Camera position:', camera.position);
    console.log('✅ ThreeEnv: Renderer size:', renderer.getSize(new THREE.Vector2()));

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      setIsReady(false);
    };
  }, []);

  // Fit camera to object
  const fitToObject = (object: THREE.Object3D) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2; // Distance multiplier for good viewing

    // Position camera
    cameraRef.current.position.set(
      center.x + distance * 0.7,
      center.y + distance * 0.7,
      center.z + distance * 0.7
    );

    // Set controls target
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
    
    // Force camera to look at the center
    cameraRef.current.lookAt(center);
    
    // Force a render to make sure the scene updates
    if (rendererRef.current && sceneRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      console.log(`🎬 ThreeEnv: Forced render after camera fit`);
    }

    console.log(`📷 ThreeEnv: Camera fitted to object. Center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}), Distance: ${distance.toFixed(2)}`);
    console.log(`📷 ThreeEnv: Camera position: (${cameraRef.current.position.x.toFixed(2)}, ${cameraRef.current.position.y.toFixed(2)}, ${cameraRef.current.position.z.toFixed(2)})`);
    console.log(`📷 ThreeEnv: Camera looking at: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);
  };

  // Dispose previous root object
  const disposePreviousRoot = (object: THREE.Object3D | null) => {
    if (!object || !sceneRef.current) return;

    sceneRef.current.remove(object);
    
    // Dispose geometries and materials
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });

    console.log('🗑️ ThreeEnv: Previous root object disposed');
  };

  return {
    mountRef,
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    controls: controlsRef.current,
    hdrLoader: hdrLoaderRef.current,
    fitToObject,
    disposePreviousRoot,
    isReady
  };
}
