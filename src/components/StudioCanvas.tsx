import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { IJK } from '../types/shape';
import type { ViewTransforms } from '../services/ViewTransforms';
import type { StudioSettings } from '../types/studio';

interface StudioCanvasProps {
  cells: IJK[];
  view: ViewTransforms;
  settings: StudioSettings;
  onSettingsChange: (settings: StudioSettings) => void;
}

export const StudioCanvas: React.FC<StudioCanvasProps> = ({ 
  cells, 
  view, 
  settings, 
  onSettingsChange 
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.Camera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<OrbitControls>();
  const instancedMeshRef = useRef<THREE.InstancedMesh>();
  const lightsRef = useRef<THREE.Light[]>([]);
  const hasInitializedRef = useRef(false);

  // Initialize Three.js scene once
  useEffect(() => {
    if (!mountRef.current || hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    console.log("🎬 StudioCanvas: Initializing Three.js scene");

    // Basic Three.js setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      settings.camera.fovDeg, 
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    
    mountRef.current.appendChild(renderer.domElement);

    // Setup lighting
    const lights = setupLighting(scene, settings);
    lightsRef.current = lights;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enabled = true;
    controlsRef.current = controls;

    // Store references
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // Render loop
    let animationId = 0;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      if (controlsRef.current) controlsRef.current.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!camera || !renderer) return;
      const aspect = window.innerWidth / window.innerHeight;
      
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = aspect;
      } else if (camera instanceof THREE.OrthographicCamera) {
        const frustumSize = 10;
        camera.left = -frustumSize * aspect / 2;
        camera.right = frustumSize * aspect / 2;
        camera.top = frustumSize / 2;
        camera.bottom = -frustumSize / 2;
      }
      
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update scene when cells/view change
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    
    if (!scene || !camera || !controls || !cells.length || !view) return;

    console.log("🔄 StudioCanvas: Updating scene with", cells.length, "cells");

    // Remove existing mesh
    if (instancedMeshRef.current) {
      scene.remove(instancedMeshRef.current);
      instancedMeshRef.current.geometry.dispose();
      if (Array.isArray(instancedMeshRef.current.material)) {
        instancedMeshRef.current.material.forEach(m => m.dispose());
      } else {
        instancedMeshRef.current.material.dispose();
      }
    }

    // Create instanced mesh for spheres
    const geometry = new THREE.SphereGeometry(0.4, 32, 24);
    const material = new THREE.MeshStandardMaterial({
      color: settings.material.color,
      metalness: settings.material.metalness,
      roughness: settings.material.roughness
    });

    const instancedMesh = new THREE.InstancedMesh(geometry, material, cells.length);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    // Position instances using view transforms
    const matrix = new THREE.Matrix4();
    const M = view.M_world;
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    cells.forEach((cell, i) => {
      // Transform IJK to world coordinates
      const x = M[0][0] * cell.i + M[0][1] * cell.j + M[0][2] * cell.k + M[0][3];
      const y = M[1][0] * cell.i + M[1][1] * cell.j + M[1][2] * cell.k + M[1][3];
      const z = M[2][0] * cell.i + M[2][1] * cell.j + M[2][2] * cell.k + M[2][3];

      matrix.setPosition(x, y, z);
      instancedMesh.setMatrixAt(i, matrix);

      // Track bounds
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    });

    instancedMesh.instanceMatrix.needsUpdate = true;
    scene.add(instancedMesh);
    instancedMeshRef.current = instancedMesh;

    // Position camera and controls
    const center = new THREE.Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2
    );
    const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    
    controls.target.copy(center);
    
    // Position camera at 45-degree angle
    const distance = (size / 2) / Math.tan((settings.camera.fovDeg * Math.PI / 180) / 2) * 1.2;
    const angle45 = Math.PI / 4;
    const horizontalDistance = distance * Math.cos(angle45);
    const verticalDistance = distance * Math.sin(angle45);
    
    camera.position.set(
      center.x + horizontalDistance,
      center.y + verticalDistance,
      center.z + horizontalDistance
    );
    
    controls.update();

    console.log("✅ StudioCanvas: Scene updated successfully");
  }, [cells, view, settings.material, settings.camera.fovDeg]);

  // Update lighting when settings change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove existing lights
    lightsRef.current.forEach(light => scene.remove(light));
    
    // Setup new lighting
    const lights = setupLighting(scene, settings);
    lightsRef.current = lights;
  }, [settings.lights]);

  // Update camera projection when settings change
  useEffect(() => {
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!camera || !renderer) return;

    const aspect = renderer.domElement.width / renderer.domElement.height;

    if (settings.camera.projection === 'perspective') {
      if (!(camera instanceof THREE.PerspectiveCamera)) {
        // Switch to perspective camera
        const newCamera = new THREE.PerspectiveCamera(settings.camera.fovDeg, aspect, 0.1, 1000);
        newCamera.position.copy(camera.position);
        newCamera.lookAt(controlsRef.current?.target || new THREE.Vector3());
        
        cameraRef.current = newCamera;
        if (controlsRef.current) {
          controlsRef.current.object = newCamera;
        }
      } else {
        camera.fov = settings.camera.fovDeg;
        camera.updateProjectionMatrix();
      }
    } else {
      if (!(camera instanceof THREE.OrthographicCamera)) {
        // Switch to orthographic camera
        const frustumSize = 10 * settings.camera.orthoZoom;
        const newCamera = new THREE.OrthographicCamera(
          -frustumSize * aspect / 2, frustumSize * aspect / 2,
          frustumSize / 2, -frustumSize / 2,
          0.1, 1000
        );
        newCamera.position.copy(camera.position);
        newCamera.lookAt(controlsRef.current?.target || new THREE.Vector3());
        
        cameraRef.current = newCamera;
        if (controlsRef.current) {
          controlsRef.current.object = newCamera;
        }
      }
    }
  }, [settings.camera]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
};

function setupLighting(scene: THREE.Scene, settings: StudioSettings): THREE.Light[] {
  const lights: THREE.Light[] = [];

  // Ambient light
  const ambientLight = new THREE.AmbientLight(0x404040, 0.3 * settings.lights.brightness);
  scene.add(ambientLight);
  lights.push(ambientLight);

  // Spotlights
  const spotPositions = [
    [10, 10, 10],
    [-10, 10, 10],
    [10, 10, -10],
    [-10, 10, -10],
    [0, 15, 0]
  ];

  settings.lights.spot.forEach((spot, i) => {
    if (spot.enabled && i < spotPositions.length) {
      const light = new THREE.SpotLight(0xffffff, 0.8 * settings.lights.brightness, 100, Math.PI / 6, 0.1);
      light.position.set(...spotPositions[i] as [number, number, number]);
      light.target.position.set(0, 0, 0);
      light.castShadow = true;
      light.shadow.mapSize.width = 1024;
      light.shadow.mapSize.height = 1024;
      
      scene.add(light);
      scene.add(light.target);
      lights.push(light);
    }
  });

  return lights;
}
