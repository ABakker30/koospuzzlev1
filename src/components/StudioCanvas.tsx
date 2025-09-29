import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { IJK } from '../types/shape';
import type { ViewTransforms } from '../services/ViewTransforms';
import type { StudioSettings } from '../types/studio';
import { HDRLoader } from '../services/HDRLoader';

interface StudioCanvasProps {
  cells: IJK[];
  view: ViewTransforms;
  settings: StudioSettings;
  onSettingsChange: (settings: StudioSettings) => void;
}

// Helper function to convert view transforms matrix to Three.js
function mat4ToThree(M: number[][]): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  matrix.set(
    M[0][0], M[0][1], M[0][2], M[0][3],
    M[1][0], M[1][1], M[1][2], M[1][3],
    M[2][0], M[2][1], M[2][2], M[2][3],
    M[3][0], M[3][1], M[3][2], M[3][3]
  );
  return matrix;
}

export const StudioCanvas: React.FC<StudioCanvasProps> = ({ 
  cells, 
  view, 
  settings 
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  
  // 3D Environment References (created once)
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<OrbitControls>();
  
  // Shape References (updated when file loads)
  const instancedMeshRef = useRef<THREE.InstancedMesh>();
  
  // Lighting References (controlled by settings)
  const ambientLightRef = useRef<THREE.AmbientLight>();
  const directionalLightsRef = useRef<THREE.DirectionalLight[]>([]);
  const hdrLoaderRef = useRef<HDRLoader>();

  // STEP 1: Initialize 3D Environment (once, when component mounts)
  useEffect(() => {
    if (!mountRef.current) return;

    console.log("🎬 StudioCanvas: Initializing 3D environment");

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Create camera
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Configure renderer for HDR
    console.log(`🎨 Available tone mappings:`, {
      NoToneMapping: THREE.NoToneMapping,
      LinearToneMapping: THREE.LinearToneMapping, 
      ReinhardToneMapping: THREE.ReinhardToneMapping,
      CineonToneMapping: THREE.CineonToneMapping,
      ACESFilmicToneMapping: THREE.ACESFilmicToneMapping
    });
    
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    console.log(`🎨 Renderer configured: toneMapping=${renderer.toneMapping} (should be ${THREE.ACESFilmicToneMapping}), exposure=${renderer.toneMappingExposure}`);

    // Create controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Create lighting system - ambient + 5 directional lights
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambientLight);

    // Create 5 directional lights for true all-around illumination
    const directionalLights = [
      new THREE.DirectionalLight(0xffffff, 1.0), // Right side
      new THREE.DirectionalLight(0xffffff, 0.8), // Left side  
      new THREE.DirectionalLight(0xffffff, 0.6), // Top
      new THREE.DirectionalLight(0xffffff, 0.4), // Bottom
      new THREE.DirectionalLight(0xffffff, 0.2)  // Front
    ];
    
    // Position the directional lights for true all-around illumination
    directionalLights[0].position.set(20, 0, 0);     // Right side (horizontal)
    directionalLights[1].position.set(-20, 0, 0);    // Left side (horizontal)
    directionalLights[2].position.set(0, 20, 0);     // Top
    directionalLights[3].position.set(0, -20, 0);    // Bottom
    directionalLights[4].position.set(0, 0, 20);     // Front
    
    directionalLights.forEach(light => scene.add(light));

    // Initialize HDR loader (force fresh instance)
    HDRLoader.resetInstance(); // Force fresh instance
    const hdrLoader = HDRLoader.getInstance();
    hdrLoader.initializePMREMGenerator(renderer);
    hdrLoaderRef.current = hdrLoader;
    console.log('🌅 HDR Loader initialized in StudioCanvas with fresh instance');

    // Store references
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    ambientLightRef.current = ambientLight;
    directionalLightsRef.current = directionalLights;

    // Mount to DOM
    mountRef.current.appendChild(renderer.domElement);

    // Animation loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handling
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Expose OrbitControls target setting
    (window as any).setOrbitTarget = (x: number, y: number, z: number) => {
      controls.target.set(x, y, z);
      controls.update();
    };

    console.log("✅ 3D environment ready");

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []); // Only run once

  // STEP 2: Setup Geometry (when file loads)
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    
    if (!scene || !camera || !controls || !cells.length || !view) return;

    console.log("🔄 StudioCanvas: Setting up geometry for", cells.length, "cells");

    // Clean up previous geometry
    if (instancedMeshRef.current) {
      scene.remove(instancedMeshRef.current);
      instancedMeshRef.current.geometry.dispose();
      if (Array.isArray(instancedMeshRef.current.material)) {
        instancedMeshRef.current.material.forEach(m => m.dispose());
      } else {
        instancedMeshRef.current.material.dispose();
      }
    }

    // Convert view transforms to Three.js matrix
    const M = mat4ToThree(view.M_world);

    // Compute oriented positions and bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    const positions: THREE.Vector3[] = [];
    for (const cell of cells) {
      const pos = new THREE.Vector3(cell.i, cell.j, cell.k);
      pos.applyMatrix4(M);
      positions.push(pos);
      
      minX = Math.min(minX, pos.x); maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y); maxY = Math.max(maxY, pos.y);
      minZ = Math.min(minZ, pos.z); maxZ = Math.max(maxZ, pos.z);
    }

    // Calculate sphere radius as 0.5 times closest distance between cells
    let minDistance = Infinity;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const distance = positions[i].distanceTo(positions[j]);
        if (distance > 0) { // Avoid zero distances from identical positions
          minDistance = Math.min(minDistance, distance);
        }
      }
    }
    
    const radius = minDistance === Infinity ? 0.4 : minDistance * 0.5;
    console.log(`📏 Calculated sphere radius: ${radius} (min distance: ${minDistance})`)

    const center = new THREE.Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2
    );

    const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

    // Create instanced mesh
    const geometry = new THREE.SphereGeometry(radius, 32, 24);
    const material = new THREE.MeshStandardMaterial({
      color: settings.material.color,
      metalness: settings.material.metalness,
      roughness: settings.material.roughness
    });

    // Don't manually set envMap - let scene.environment handle it
    // HDR will be applied via scene.environment in the lighting effect

    const instancedMesh = new THREE.InstancedMesh(geometry, material, cells.length);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    // Set instance matrices
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < positions.length; i++) {
      matrix.makeTranslation(positions[i].x, positions[i].y, positions[i].z);
      instancedMesh.setMatrixAt(i, matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;

    scene.add(instancedMesh);
    instancedMeshRef.current = instancedMesh;

    // Position camera at 45-degree angle (one time setup)
    const distance = size * 2;
    camera.position.set(
      center.x + distance * 0.7,
      center.y + distance * 0.7,
      center.z + distance * 0.7
    );
    
    // Set controls target to shape center
    controls.target.copy(center);
    controls.update();

    console.log("✅ Geometry setup complete - camera positioned at 45° angle");

  }, [cells, view]); // Only when file data changes

  // STEP 3: Update Material (when settings change)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!instancedMeshRef.current?.material || !scene) return;

    const material = instancedMeshRef.current.material as THREE.MeshStandardMaterial;
    material.color.set(settings.material.color);
    material.metalness = settings.material.metalness;
    material.roughness = settings.material.roughness;

    // Only set envMapIntensity - let scene.environment provide the envMap
    if (settings.lights.hdr.enabled) {
      material.envMapIntensity = settings.lights.hdr.intensity;
    } else {
      material.envMapIntensity = 1.0;
    }
    
    // Clear any manually set envMap to let scene.environment work
    if (material.envMap) {
      material.envMap = null;
      console.log("🎨 Cleared manual envMap to use scene.environment");
    }

    material.needsUpdate = true;
    console.log("🎨 Material updated:", settings.material);
  }, [settings.material, settings.lights.hdr]);

  // STEP 4: Update Lighting (when settings change)
  useEffect(() => {
    const scene = sceneRef.current;
    const hdrLoader = hdrLoaderRef.current;
    if (!ambientLightRef.current || !scene) return;

    // Update ambient light brightness
    ambientLightRef.current.intensity = 0.3 * settings.lights.brightness;

    // Update each directional light intensity
    directionalLightsRef.current.forEach((light, i) => {
      if (i < settings.lights.directional.length) {
        light.intensity = settings.lights.directional[i] * settings.lights.brightness;
      }
    });

    // Auto-adjust directional lights when HDR is enabled
    if (settings.lights.hdr.enabled) {
      // Set directional lights to 0 when HDR is active (user can increase if desired)
      directionalLightsRef.current.forEach((light) => {
        light.intensity = 0;
      });
      console.log('🌅 HDR enabled: Set all directional lights to 0 (HDR provides lighting)');
    }

    // Manual HDR pattern for compatibility
    console.log(`🧪 HDR Debug: enabled=${settings.lights.hdr.enabled}, envId=${settings.lights.hdr.envId}, hdrLoader=${!!hdrLoader}`);
    if (settings.lights.hdr.enabled && settings.lights.hdr.envId && hdrLoader) {
      console.log(`🧪 HDR Debug: Attempting to load environment '${settings.lights.hdr.envId}'`);
      hdrLoader.loadEnvironment(settings.lights.hdr.envId).then(envMap => {
        if (envMap && scene && instancedMeshRef.current?.material instanceof THREE.MeshStandardMaterial) {
          const material = instancedMeshRef.current.material;
          
          // Manual assignment for compatibility
          material.envMap = envMap;
          material.envMapIntensity = settings.lights.hdr.intensity;
          material.needsUpdate = true;
          
          // Also try scene.environment for good measure
          scene.environment = envMap;
          
          console.log(`🌅 HDR applied: material.envMap + scene.environment set, intensity=${settings.lights.hdr.intensity}`);
        } else {
          console.error(`🌅 HDR failed: envMap=${!!envMap}, scene=${!!scene}, material=${!!instancedMeshRef.current?.material}`);
        }
      }).catch(error => {
        console.error(`🌅 HDR loading failed:`, error);
      });
    } else {
      // Clear HDR
      scene.environment = null;
      if (instancedMeshRef.current?.material instanceof THREE.MeshStandardMaterial) {
        const material = instancedMeshRef.current.material;
        material.envMap = null;
        material.envMapIntensity = 1.0;
        material.needsUpdate = true;
      }
      console.log('🌅 HDR disabled');
    }

    console.log(`🔆 Lighting updated - brightness: ${settings.lights.brightness}, directional: [${settings.lights.directional.join(', ')}], HDR: ${settings.lights.hdr.enabled ? settings.lights.hdr.envId : 'disabled'}`);
  }, [settings.lights]);

  // STEP 5: Update Camera (when settings change)
  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;

    if (settings.camera.projection === 'perspective') {
      camera.fov = settings.camera.fovDeg;
      camera.updateProjectionMatrix();
      console.log("📷 Camera updated - FOV:", settings.camera.fovDeg);
    }
    // Note: Orthographic camera switching would require more complex logic
  }, [settings.camera]);

  return (
    <div 
      ref={mountRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative',
        overflow: 'hidden'
      }} 
    />
  );
};
