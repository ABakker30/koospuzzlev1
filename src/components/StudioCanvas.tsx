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

// Helper function to convert view transforms matrix to Three.js (following SceneCanvas pattern)
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

// Helper function to estimate sphere radius (following SceneCanvas pattern)
function estimateSphereRadiusFromView(view: ViewTransforms): number {
  // Use a reasonable default radius based on the view scale
  return Math.max(0.1, 0.4); // Similar to SceneCanvas default
}

export const StudioCanvas: React.FC<StudioCanvasProps> = ({ 
  cells, 
  view, 
  settings 
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<OrbitControls>();
  const instancedMeshRef = useRef<THREE.InstancedMesh>();
  const hasInitializedCameraRef = useRef(false);

  // Expose OrbitControls target setting (following SceneCanvas pattern)
  useEffect(() => {
    (window as any).setOrbitTarget = (x: number, y: number, z: number) => {
      if (controlsRef.current) {
        controlsRef.current.target.set(x, y, z);
        controlsRef.current.update();
      }
    };
  }, []);

  // Initialize Three.js scene once (following SceneCanvas pattern)
  useEffect(() => {
    if (!mountRef.current) return;

    console.log("🎬 StudioCanvas: Initializing Three.js scene");

    // Basic Three.js setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // OrbitControls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting setup (following SceneCanvas pattern)
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(1, 1, 1);
    directionalLight1.castShadow = true;
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-1, -1, -1);
    scene.add(directionalLight2);

    // Store references
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

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

  // Synchronous shape processing when data is available (following SceneCanvas pattern)
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const controls = controlsRef.current;
    
    if (!scene || !camera || !renderer || !controls || !cells.length || !view) return;

    console.log("🔄 StudioCanvas: Processing", cells.length, "cells with view transforms");

    // Clean up previous geometry if it exists
    if (instancedMeshRef.current) {
      scene.remove(instancedMeshRef.current);
      instancedMeshRef.current.geometry.dispose();
      if (Array.isArray(instancedMeshRef.current.material)) {
        instancedMeshRef.current.material.forEach(m => m.dispose());
      } else {
        instancedMeshRef.current.material.dispose();
      }
    }

    // Step 1: Convert to XYZ and orient (already done in ViewTransforms)
    const M = mat4ToThree(view.M_world);
    const radius = estimateSphereRadiusFromView(view);
    
    // Step 2: Compute bounding box and center from oriented positions
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

    const center = new THREE.Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2
    );

    const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

    // Step 3: Create instanced mesh
    const geometry = new THREE.SphereGeometry(radius, 32, 24);
    const material = new THREE.MeshStandardMaterial({
      color: settings.material.color,
      metalness: settings.material.metalness,
      roughness: settings.material.roughness
    });

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

    // Step 4: Position camera (following SceneCanvas pattern)
    if (!hasInitializedCameraRef.current) {
      hasInitializedCameraRef.current = true;
      
      // Set camera position at 45-degree angle
      const distance = size * 2;
      camera.position.set(
        center.x + distance * 0.7,
        center.y + distance * 0.7,
        center.z + distance * 0.7
      );
      
      // Set controls target to shape center
      controls.target.copy(center);
      controls.update();
      
      console.log("📷 StudioCanvas: Camera positioned at 45-degree angle, target:", center);
    }

  }, [cells, view, settings.material]);

  // Update material when settings change
  useEffect(() => {
    if (instancedMeshRef.current && instancedMeshRef.current.material) {
      const material = instancedMeshRef.current.material as THREE.MeshStandardMaterial;
      material.color.set(settings.material.color);
      material.metalness = settings.material.metalness;
      material.roughness = settings.material.roughness;
      material.needsUpdate = true;
    }
  }, [settings.material]);

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
