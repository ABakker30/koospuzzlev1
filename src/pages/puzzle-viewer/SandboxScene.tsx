import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { HDRLoader } from '../../services/HDRLoader';
import type { StudioSettings } from '../../types/studio';

interface SandboxSceneProps {
  onSceneReady?: (scene: THREE.Scene, camera: THREE.PerspectiveCamera, controls: OrbitControls, renderer: THREE.WebGLRenderer) => void;
  settings?: StudioSettings;
}

export function SandboxScene({ onSceneReady, settings }: SandboxSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const currentHdrEnvIdRef = useRef<string>('studio');
  
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const directionalLightsRef = useRef<THREE.DirectionalLight[]>([]);

  // Scene initialization (runs once)
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create scene with background from settings
    const scene = new THREE.Scene();
    const bgColor = settings?.lights?.backgroundColor || '#000000';
    scene.background = new THREE.Color(bgColor);
    sceneRef.current = scene;

    // Create camera - real-world scale (puzzle ~10cm, view from ~40cm)
    // Rotated 90° in xz plane from default position
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.001, 10);
    camera.position.set(0.40, 0.25, 0);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Create renderer (matching SceneCanvas/initScene settings)
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Initialize HDR loader (reset first for clean state, matching SceneCanvas pattern)
    HDRLoader.resetInstance();
    const hdrEnvId = settings?.lights?.hdr?.envId || 'studio';
    const hdrIntensity = settings?.lights?.hdr?.intensity ?? 1.0;
    currentHdrEnvIdRef.current = hdrEnvId;
    const hdrLoader = HDRLoader.getInstance();
    hdrLoader.initializePMREMGenerator(renderer);
    
    // Load HDR environment immediately after initialization
    hdrLoader.loadEnvironment(hdrEnvId).then(envMap => {
      if (envMap && sceneRef.current) {
        sceneRef.current.environment = envMap;
        // Apply environment intensity if supported
        if ('environmentIntensity' in sceneRef.current) {
          (sceneRef.current as any).environmentIntensity = hdrIntensity;
        }
        console.log('🌅 [SANDBOX] Initial HDR environment loaded:', hdrEnvId, 'intensity:', hdrIntensity);
      }
    });

    // Add lights (matching SceneCanvas brightness scaling)
    const brightness = Math.max(0.1, settings?.lights?.brightness ?? 2.7);
    const baseIntensities = [0.8, 0.4, 0.3, 0.3];
    
    // Use settings.lights.directional if available, otherwise use baseIntensities * brightness
    const directionalSettings = settings?.lights?.directional;
    const useCustomDirectional = directionalSettings && Array.isArray(directionalSettings);
    
    const ambientLight = new THREE.AmbientLight(0x404040, useCustomDirectional ? 0.3 * brightness : 0.6 * brightness); // Match SceneCanvas ambient color
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const dirs: THREE.DirectionalLight[] = [];
    
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, useCustomDirectional ? (directionalSettings[0] ?? 0) : baseIntensities[0] * brightness);
    directionalLight1.position.set(0.5, 1, 0.3); // Position for shadows (world scale)
    directionalLight1.castShadow = true;
    directionalLight1.shadow.mapSize.width = 2048;
    directionalLight1.shadow.mapSize.height = 2048;
    directionalLight1.shadow.camera.near = 0.01;
    directionalLight1.shadow.camera.far = 2;
    directionalLight1.shadow.camera.left = -0.5;
    directionalLight1.shadow.camera.right = 0.5;
    directionalLight1.shadow.camera.top = 0.5;
    directionalLight1.shadow.camera.bottom = -0.5;
    directionalLight1.shadow.bias = -0.001;
    scene.add(directionalLight1);
    dirs.push(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, useCustomDirectional ? (directionalSettings[1] ?? 0) : baseIntensities[1] * brightness);
    directionalLight2.position.set(-10, -10, -5); // Match SceneCanvas positions
    scene.add(directionalLight2);
    dirs.push(directionalLight2);
    
    const directionalLight3 = new THREE.DirectionalLight(0xffffff, useCustomDirectional ? (directionalSettings[2] ?? 0) : baseIntensities[2] * brightness);
    directionalLight3.position.set(5, -10, 10); // Match SceneCanvas positions
    scene.add(directionalLight3);
    dirs.push(directionalLight3);
    
    const directionalLight4 = new THREE.DirectionalLight(0xffffff, useCustomDirectional ? (directionalSettings[3] ?? 0) : baseIntensities[3] * brightness);
    directionalLight4.position.set(-5, 10, -10); // Match SceneCanvas positions
    scene.add(directionalLight4);
    dirs.push(directionalLight4);
    
    directionalLightsRef.current = dirs;

    // Add orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.05; // 5cm minimum distance
    controls.maxDistance = 50;
    controlsRef.current = controls;

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // Notify parent
    if (onSceneReady) {
      onSceneReady(scene, camera, controls, renderer);
    }

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (animationIdRef.current !== null) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (container.contains(rendererRef.current.domElement)) {
          container.removeChild(rendererRef.current.domElement);
        }
      }
      
      if (sceneRef.current) {
        sceneRef.current.clear();
      }
    };
  }, [onSceneReady]);

  // Settings update effect (runs when settings change, doesn't recreate scene)
  // Matching SceneCanvas pattern for dynamic lighting updates
  useEffect(() => {
    if (!sceneRef.current || !rendererRef.current) return;

    // Update background color (fallback matches initialization)
    const bgColor = settings?.lights?.backgroundColor || '#000000';
    sceneRef.current.background = new THREE.Color(bgColor);

    // Update lighting (matching SceneCanvas pattern)
    const brightness = Math.max(0.1, settings?.lights?.brightness ?? 2.7);
    const baseIntensities = [0.8, 0.4, 0.3, 0.3];
    
    // Update ambient light
    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = settings?.lights?.directional 
        ? 0.3 * brightness  // Less ambient when using custom directional settings
        : 0.6 * brightness; // More ambient for default lighting
    }
    
    // Update directional lights
    if (directionalLightsRef.current.length > 0) {
      if (settings?.lights?.directional && Array.isArray(settings.lights.directional)) {
        directionalLightsRef.current.forEach((light, i) => {
          light.intensity = settings.lights.directional[i] ?? 0;
        });
      } else {
        directionalLightsRef.current.forEach((light, i) => {
          light.intensity = baseIntensities[i] * brightness;
        });
      }
    }

    // Update HDR environment if changed
    const newHdrEnvId = settings?.lights?.hdr?.envId || 'studio';
    if (newHdrEnvId !== currentHdrEnvIdRef.current) {
      currentHdrEnvIdRef.current = newHdrEnvId;
      const hdrLoader = HDRLoader.getInstance();
      hdrLoader.loadEnvironment(newHdrEnvId).then(envMap => {
        if (envMap && sceneRef.current) {
          sceneRef.current.environment = envMap;
          console.log('🌅 [SANDBOX] HDR environment updated:', newHdrEnvId);
        }
      });
    }

    // Update HDR intensity (Three.js r152+ supports environmentIntensity)
    const hdrIntensity = settings?.lights?.hdr?.intensity ?? 1.0;
    if ('environmentIntensity' in sceneRef.current) {
      (sceneRef.current as any).environmentIntensity = hdrIntensity;
    }
    
    console.log('🌅 [SANDBOX] Settings updated:', { brightness, hdrIntensity });
  }, [settings]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0
      }} 
    />
  );
}
