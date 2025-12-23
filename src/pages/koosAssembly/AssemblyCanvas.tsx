import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createMatGridOverlay, MatGridMode } from './MatGridOverlay';
import { createPieceProxies, updatePieceTransforms } from './PieceProxies';
import type { AssemblySolution } from './loadSolutionForAssembly';
import type { PoseMap } from './AssemblyTimeline';
import type { CameraSnapshot, SolutionOrientation } from './types';

const MAT_SIZE = 12; // Represents 12 sphere cells
const MAT_TOTAL = MAT_SIZE + 2; // Add margin (14 units)
const TABLE_SIZE = 50;
// FCC lattice: adjacent spheres (1 unit apart in IJK) are sqrt(0.5) ≈ 0.707 apart in world space
// Sphere radius = half the minimum distance between centers
const SPHERE_RADIUS = Math.sqrt(0.5) / 2; // ≈ 0.3535 world units

interface AssemblyCanvasProps {
  onFrame?: (api: {
    worldToScreen: (p: THREE.Vector3) => { x: number; y: number; visible: boolean };
    getAnchors: () => { card: THREE.Vector3 };
  }) => void;
  gridMode?: MatGridMode;
  solution?: AssemblySolution | null;
  poses?: PoseMap | null;
  cameraSnapshot?: CameraSnapshot;
  solutionOrientation?: SolutionOrientation;
}

export const AssemblyCanvas: React.FC<AssemblyCanvasProps> = ({ 
  onFrame, 
  gridMode = 'A_SQUARE',
  solution,
  poses,
  cameraSnapshot,
  solutionOrientation,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const gridOverlayRef = useRef<THREE.LineSegments | null>(null);
  const piecesGroupRef = useRef<THREE.Group | null>(null);
  const puzzleRootRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const posesRef = useRef<PoseMap | null>(null);
  const solutionRef = useRef<AssemblySolution | null>(null);
  const [cardAnchor] = useState(() => {
    // Card position: top-left corner of mat from camera view, slightly elevated
    const MAT_HALF = MAT_TOTAL / 2;
    return new THREE.Vector3(-MAT_HALF + 2.2, 0.02, MAT_HALF - 2.2);
  });

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a2a2a); // Dark gray background
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    // Apply captured camera state or use default
    if (cameraSnapshot) {
      camera.position.fromArray(cameraSnapshot.position);
      camera.up.fromArray(cameraSnapshot.up);
      camera.fov = cameraSnapshot.fov;
      camera.updateProjectionMatrix();
      console.log('📷 Applied camera snapshot');
    } else {
      camera.position.set(0, 25, 30); // Default: elevated, looking down
      camera.lookAt(0, 0, 0);
    }
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // OrbitControls - enabled immediately with constraints
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.5;
    
    // Prevent going under the table
    controls.minPolarAngle = 0.15 * Math.PI; // slightly above horizon
    controls.maxPolarAngle = 0.5 * Math.PI;  // looking down, not underneath
    
    // Apply captured target or use default
    if (cameraSnapshot) {
      controls.target.fromArray(cameraSnapshot.target);
      controls.update();
      console.log('🎯 Applied camera target');
    } else {
      controls.target.set(0, 0, 0);
      controls.update();
    }
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -30;
    directionalLight.shadow.camera.right = 30;
    directionalLight.shadow.camera.top = 30;
    directionalLight.shadow.camera.bottom = -30;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Table plane (large, dark)
    const tableGeometry = new THREE.PlaneGeometry(TABLE_SIZE, TABLE_SIZE);
    const tableMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      roughness: 0.8,
      metalness: 0.1,
    });
    const tableMesh = new THREE.Mesh(tableGeometry, tableMaterial);
    tableMesh.rotation.x = -Math.PI / 2; // Lie flat (XZ plane, Y up)
    tableMesh.receiveShadow = true;
    scene.add(tableMesh);

    // Silicone mat plane (smaller, lighter, centered)
    const matGeometry = new THREE.PlaneGeometry(MAT_TOTAL, MAT_TOTAL);
    const matMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a5a5a,
      roughness: 0.9,
      metalness: 0.05,
    });
    const matMesh = new THREE.Mesh(matGeometry, matMaterial);
    matMesh.rotation.x = -Math.PI / 2;
    matMesh.position.y = 0.01; // Slightly above table to prevent z-fighting
    matMesh.receiveShadow = true;
    matMesh.castShadow = false;
    scene.add(matMesh);

    // Mat grid overlay (subtle guide grid)
    const gridOverlay = createMatGridOverlay({
      mode: gridMode,
      cells: MAT_SIZE,
      size: MAT_TOTAL,
      y: 0.03, // Just above mat to avoid z-fighting
    });
    scene.add(gridOverlay);
    gridOverlayRef.current = gridOverlay;

    // Puzzle root group - applies solution orientation to entire puzzle
    const puzzleRoot = new THREE.Group();
    if (solutionOrientation) {
      puzzleRoot.quaternion.fromArray(solutionOrientation.quaternion);
      console.log('🧭 Applied solution orientation to puzzleRoot');
    }
    scene.add(puzzleRoot);
    puzzleRootRef.current = puzzleRoot;

    // Card anchor marker (tiny debug sphere - invisible for now)
    const markerGeometry = new THREE.SphereGeometry(0.2, 8, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      visible: false, // Hidden for production, set to true for debugging
    });
    const markerMesh = new THREE.Mesh(markerGeometry, markerMaterial);
    markerMesh.position.copy(cardAnchor);
    scene.add(markerMesh);

    // worldToScreen helper function with visibility check
    const worldToScreen = (vec: THREE.Vector3): { x: number; y: number; visible: boolean } => {
      const vector = vec.clone();
      vector.project(camera);

      // Check visibility (in NDC space, z should be in [-1, 1] and x/y roughly in [-1, 1])
      const visible = vector.z > -1 && vector.z < 1;

      const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;

      return { x, y, visible };
    };

    // getAnchors helper
    const getAnchors = () => ({
      card: cardAnchor,
    });

    // Animation loop with onFrame callback
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update(); // Update orbit controls
      renderer.render(scene, camera);
      
      // Update piece transforms every frame using refs (avoid closure staleness)
      if (piecesGroupRef.current && posesRef.current && solutionRef.current) {
        const pieceIds = solutionRef.current.pieces.map(p => p.pieceId);
        updatePieceTransforms(piecesGroupRef.current, posesRef.current, pieceIds);
        
        // Debug: Log active piece position every 60 frames
        if (Math.random() < 0.016) {
          // Find the active piece by checking which one has moved from table position
          const activePiece = Object.entries(posesRef.current).find(([id, pose]) => {
            return pose.position.y > 1.0; // Active piece should be lifted
          });
          if (activePiece) {
            const [id, pose] = activePiece;
            console.log('🎬 ACTIVE piece moving:', {
              pieceId: id,
              pos: `(${pose.position.x.toFixed(2)}, ${pose.position.y.toFixed(2)}, ${pose.position.z.toFixed(2)})`
            });
          }
        }
      }

      // Call onFrame callback with API
      if (onFrame) {
        onFrame({
          worldToScreen,
          getAnchors,
        });
      }
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      
      const width = window.innerWidth;
      const height = window.innerHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }

      // Dispose geometries and materials
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (object.material instanceof THREE.Material) {
            object.material.dispose();
          }
        }
      });
    };
  }, [onFrame, cardAnchor, cameraSnapshot, solutionOrientation]);

  // Update grid overlay when gridMode changes
  useEffect(() => {
    if (!sceneRef.current) return;

    // Remove old grid overlay
    if (gridOverlayRef.current) {
      sceneRef.current.remove(gridOverlayRef.current);
      gridOverlayRef.current.geometry.dispose();
      if (gridOverlayRef.current.material instanceof THREE.Material) {
        gridOverlayRef.current.material.dispose();
      }
      gridOverlayRef.current = null;
    }

    // Create new grid overlay with updated mode
    const newGrid = createMatGridOverlay({
      mode: gridMode,
      cells: MAT_SIZE,
      size: MAT_TOTAL,
      y: 0.03,
    });
    sceneRef.current.add(newGrid);
    gridOverlayRef.current = newGrid;

    console.log(`✅ Grid overlay updated to ${gridMode}`);
  }, [gridMode]);

  // Keep refs in sync with props for animation loop
  useEffect(() => {
    posesRef.current = poses || null;
  }, [poses]);

  useEffect(() => {
    solutionRef.current = solution || null;
  }, [solution]);

  // Create pieces when we have both solution AND poses
  useEffect(() => {
    if (!puzzleRootRef.current || !solution || !poses) return;
    
    // Only create pieces once
    if (piecesGroupRef.current) return;

    console.log('🎨 Creating pieces with initial poses...');
    const piecesGroup = createPieceProxies(
      puzzleRootRef.current, // Attach to puzzleRoot for orientation
      solution.pieces,
      poses,
      SPHERE_RADIUS
    );
    piecesGroupRef.current = piecesGroup;

    console.log(`✅ Created ${solution.pieces.length} pieces`);
  }, [solution, poses]);

  // Update piece transforms when poses change
  useEffect(() => {
    if (!piecesGroupRef.current || !solution || !poses) return;

    const pieceIds = solution.pieces.map(p => p.pieceId);
    updatePieceTransforms(piecesGroupRef.current, poses, pieceIds);
  }, [poses, solution]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
      }}
    />
  );
};
