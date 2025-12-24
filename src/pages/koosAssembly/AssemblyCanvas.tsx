import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createMatGridOverlay, MatGridMode } from './MatGridOverlay';
import { createPieceProxies, updatePieceTransforms } from './PieceProxies';
import type { AssemblySolution } from './loadSolutionForAssembly';
import type { PoseMap } from './AssemblyTimeline';
import type { ThreeTransforms } from './computeAssemblyTransforms';
import type { CameraSnapshot, SolutionOrientation } from './types';
import { WORLD_SPHERE_RADIUS, MAT_SURFACE_Y, TABLE_SURFACE_Y, TABLE_PIECE_SPAWN_Y } from './constants';

const MAT_SIZE = 12; // Represents 12 sphere cells
const MAT_TOTAL = MAT_SIZE + 2; // Add margin (14 units)
const TABLE_SIZE = 50;

interface AssemblyCanvasProps {
  onFrame?: (api: {
    worldToScreen: (p: THREE.Vector3) => { x: number; y: number; visible: boolean };
    getAnchors: () => { card: THREE.Vector3 };
  }) => void;
  gridMode?: MatGridMode;
  solution?: AssemblySolution | null;
  transforms?: ThreeTransforms | null; // Stable transforms (table, final, exploded)
  timelinePoses?: PoseMap | null; // Timeline-driven poses (world space)
  timelinePieceOrder?: string[]; // Piece order from timeline (for visibility)
  activePieceIndex?: number; // Index of active piece for visibility control
  cameraSnapshot?: CameraSnapshot;
  solutionOrientation?: SolutionOrientation;
}

export const AssemblyCanvas: React.FC<AssemblyCanvasProps> = ({ 
  onFrame, 
  gridMode = 'A_SQUARE',
  solution,
  transforms,
  timelinePoses,
  timelinePieceOrder,
  activePieceIndex = -1,
  cameraSnapshot,
  solutionOrientation,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const gridOverlayRef = useRef<THREE.LineSegments | null>(null);
  const tableGroupRef = useRef<THREE.Group | null>(null);
  const tablePiecesGroupRef = useRef<THREE.Group | null>(null);
  const puzzleRootRef = useRef<THREE.Group | null>(null);
  const puzzlePiecesGroupRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformsRef = useRef<any>(null);
  const timelinePosesRef = useRef<PoseMap | null>(null);
  const timelinePieceOrderRef = useRef<string[]>([]);
  const solutionRef = useRef<AssemblySolution | null>(null);
  const activePieceIndexRef = useRef<number>(-1);
  
  // Physics refs
  const physicsWorldRef = useRef<CANNON.World | null>(null);
  const physicsBodiesRef = useRef<Map<string, CANNON.Body>>(new Map());
  
  // Issue 4: Reusable pose map to avoid per-frame allocations
  const tablePoseMapRef = useRef<Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>>(new Map());
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

    // Physics world setup
    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -30, 0), // Stronger gravity for small-scale world
    });
    world.broadphase = new CANNON.NaiveBroadphase();
    world.allowSleep = true; // Enable sleeping for stable resting
    
    physicsWorldRef.current = world;
    console.log('⚙️ Physics world created with tuned gravity (-30) for solid, heavy feel');

    // Contact materials for stable resting (high friction to prevent rolling)
    const pieceMaterial = new CANNON.Material('pieces');
    const groundMaterial = new CANNON.Material('ground');
    const contactMaterial = new CANNON.ContactMaterial(pieceMaterial, groundMaterial, {
      friction: 1.2, // High friction to kill rolling/balancing
      restitution: 0.0, // No bounce
    });
    world.addContactMaterial(contactMaterial);
    world.defaultContactMaterial.friction = 1.2; // Apply to all contacts
    
    // Very stiff contact equations to prevent bouncy/balancing behavior
    world.defaultContactMaterial.contactEquationStiffness = 1e9;
    world.defaultContactMaterial.contactEquationRelaxation = 2;

    // Static table collider (ground plane at TABLE_SURFACE_Y)
    const tableBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: groundMaterial,
    });
    tableBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate to horizontal
    tableBody.position.set(0, TABLE_SURFACE_Y, 0); // Use constant for consistency
    world.addBody(tableBody);
    console.log('🛹 Static table collider added at Y =', TABLE_SURFACE_Y);

    // Store materials in refs for later use
    (world as any).pieceMaterial = pieceMaterial;

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
    matMesh.position.y = MAT_SURFACE_Y; // Slightly above table to prevent z-fighting
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

    // Table group - holds pieces not yet placed (world space, no orientation/grounding)
    const tableGroup = new THREE.Group();
    scene.add(tableGroup);
    tableGroupRef.current = tableGroup;
    console.log('🪑 Created tableGroup (world space, identity transform)');

    // Puzzle root group - applies solution orientation and grounding to assembled puzzle
    const puzzleRoot = new THREE.Group();
    
    // Issue 4 check: Test for double-orientation
    // If final puzzle looks wrong, try commenting out the quaternion line below
    const APPLY_ROOT_ORIENTATION = true; // Set to false to test for double-orientation
    
    if (solutionOrientation && APPLY_ROOT_ORIENTATION) {
      puzzleRoot.quaternion.fromArray(solutionOrientation.quaternion);
      console.log('🧭 Applied solution orientation to puzzleRoot');
    } else if (!APPLY_ROOT_ORIENTATION) {
      console.log('⚠️ Root orientation DISABLED for double-orientation test');
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
    let lastTime = performance.now() / 1000;
    
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update(); // Update orbit controls
      
      // Step physics world with substeps (prevents jitter/missed contacts)
      if (physicsWorldRef.current) {
        const currentTime = performance.now() / 1000;
        const dt = Math.min(currentTime - lastTime, 0.1); // Cap at 100ms
        lastTime = currentTime;
        physicsWorldRef.current.step(1 / 60, dt, 5); // Fixed step, real dt, 5 substeps
        
        // DEBUG: Log first 2 physics body positions to verify updates
        if (physicsBodiesRef.current.size > 0 && Math.random() < 0.02) { // ~2% of frames
          let logged = 0;
          physicsBodiesRef.current.forEach((body, pieceId) => {
            if (logged < 2) {
              console.log(`🔧 Physics body ${pieceId}: Y=${body.position.y.toFixed(3)}, sleeping=${body.sleepState}`);
              logged++;
            }
          });
        }
      }
      
      renderer.render(scene, camera);
      
      // Update piece transforms and visibility every frame using refs
      if (tablePiecesGroupRef.current && puzzlePiecesGroupRef.current && 
          transformsRef.current && timelinePosesRef.current && 
          timelinePieceOrderRef.current.length > 0 && solutionRef.current) {
        
        const pieceIds = solutionRef.current.pieces.map(p => p.pieceId);
        const timelineOrder = timelinePieceOrderRef.current;
        const currentActiveIndex = activePieceIndexRef.current;
        
        // Build table pose map - LIVE from physics bodies (Issue 4: reuse objects)
        const tablePoseMap: Record<string, any> = {};
        const physicsBodies = physicsBodiesRef.current;
        const reusablePoseMap = tablePoseMapRef.current;
        
        pieceIds.forEach(pieceId => {
          const indexInTimeline = timelineOrder.indexOf(pieceId);
          
          // If piece is still on table (not yet active), use live physics
          if (indexInTimeline >= currentActiveIndex) {
            const body = physicsBodies.get(pieceId);
            if (body) {
              // Reuse or create pose object
              let poseObj = reusablePoseMap.get(pieceId);
              if (!poseObj) {
                poseObj = {
                  position: new THREE.Vector3(),
                  quaternion: new THREE.Quaternion(),
                };
                reusablePoseMap.set(pieceId, poseObj);
              }
              
              // Mutate existing vectors/quaternions
              poseObj.position.set(body.position.x, body.position.y, body.position.z);
              poseObj.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
              
              // DEBUG: Log when reading from physics (sample)
              if (Math.random() < 0.01) { // ~1% of reads
                console.log(`📖 Reading physics for ${pieceId}: Y=${body.position.y.toFixed(3)} -> applying to mesh`);
              }
              
              tablePoseMap[pieceId] = poseObj;
            }
          } else if (transformsRef.current.table[pieceId]) {
            // Fallback to static transform
            tablePoseMap[pieceId] = transformsRef.current.table[pieceId];
          }
        });
        
        // Timeline poses are already in canonical space (correct for puzzleRoot children)
        const puzzlePoseMap = timelinePosesRef.current;
        
        // Compute visibility based on timeline piece order
        const tableVisibility: Record<string, boolean> = {};
        const puzzleVisibility: Record<string, boolean> = {};
        
        pieceIds.forEach(pieceId => {
          const indexInTimeline = timelineOrder.indexOf(pieceId);
          
          if (indexInTimeline < currentActiveIndex) {
            // Placed pieces: show in puzzle, hide in table
            puzzleVisibility[pieceId] = true;
            tableVisibility[pieceId] = false;
          } else if (indexInTimeline === currentActiveIndex) {
            // Active piece: show in puzzle (animated), hide in table
            puzzleVisibility[pieceId] = true;
            tableVisibility[pieceId] = false;
          } else {
            // Future pieces: show in table, hide in puzzle
            tableVisibility[pieceId] = true;
            puzzleVisibility[pieceId] = false;
          }
        });
        
        // Update table proxies with stable table poses (world space)
        updatePieceTransforms(tablePiecesGroupRef.current, tablePoseMap, pieceIds, tableVisibility);
        
        // Update puzzle proxies with canonical-space poses (puzzleRoot applies orientation)
        if (puzzlePoseMap) {
          updatePieceTransforms(puzzlePiecesGroupRef.current, puzzlePoseMap, pieceIds, puzzleVisibility);
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
    transformsRef.current = transforms || null;
  }, [transforms]);

  useEffect(() => {
    timelinePosesRef.current = timelinePoses || null;
  }, [timelinePoses]);

  useEffect(() => {
    timelinePieceOrderRef.current = timelinePieceOrder || [];
  }, [timelinePieceOrder]);

  useEffect(() => {
    solutionRef.current = solution || null;
  }, [solution]);

  useEffect(() => {
    activePieceIndexRef.current = activePieceIndex;
  }, [activePieceIndex]);

  // Issue 3: Hand-off from physics to animation when piece becomes active
  useEffect(() => {
    if (!timelinePieceOrder || activePieceIndex < 0) return;
    
    const activePieceId = timelinePieceOrder[activePieceIndex];
    const body = physicsBodiesRef.current.get(activePieceId);
    
    if (body && physicsWorldRef.current) {
      physicsWorldRef.current.removeBody(body);
      physicsBodiesRef.current.delete(activePieceId);
      console.log(`🚀 Removed physics body for active piece: ${activePieceId}`);
    }
  }, [activePieceIndex, timelinePieceOrder]);

  // Create dual proxy sets when we have solution and transforms
  useEffect(() => {
    if (!tableGroupRef.current || !puzzleRootRef.current || !solution || !transforms || !physicsWorldRef.current) return;
    
    // Only create pieces once
    if (tablePiecesGroupRef.current && puzzlePiecesGroupRef.current) return;

    console.log('🎨 Creating dual proxy sets (table + puzzle)...');
    
    // Fix initial table proxy Y to spawn height (prevent "sky drop" on first frame)
    const tableInit: Record<string, any> = {};
    for (const pieceId in transforms.table) {
      const t = transforms.table[pieceId];
      tableInit[pieceId] = {
        position: t.position.clone().setY(TABLE_PIECE_SPAWN_Y),
        quaternion: t.quaternion.clone(),
      };
    }
    
    // Create table proxies (world space, no orientation/grounding)
    const tablePiecesGroup = createPieceProxies(
      tableGroupRef.current,
      solution.pieces,
      tableInit, // Use spawn-height initialized transforms
      WORLD_SPHERE_RADIUS
    );
    tablePiecesGroupRef.current = tablePiecesGroup;
    
    // Create puzzle proxies (puzzleRoot space, with orientation/grounding)
    const puzzlePiecesGroup = createPieceProxies(
      puzzleRootRef.current,
      solution.pieces,
      transforms.final, // Initial FINAL transforms for creation
      WORLD_SPHERE_RADIUS
    );
    puzzlePiecesGroupRef.current = puzzlePiecesGroup;

    console.log(`✅ Created ${solution.pieces.length} pieces in both table and puzzle groups`);

    // Phase 2: Create physics bodies for table pieces
    console.log('⚙️ Creating compound physics bodies for table pieces...');
    const world = physicsWorldRef.current;
    const physicsBodies = physicsBodiesRef.current;
    
    solution.pieces.forEach((piece) => {
      const tableTransform = transforms.table[piece.pieceId];
      if (!tableTransform) return;

      // Create compound body with mass proportional to sphere count (2x for heavier feel)
      const pieceMat = (world as any).pieceMaterial;
      const body = new CANNON.Body({
        mass: piece.spheres.length * 2, // Doubled for solid, heavy feel
        material: pieceMat,
        position: new CANNON.Vec3(
          tableTransform.position.x,
          TABLE_PIECE_SPAWN_Y, // Use spawn height, not transform Y
          tableTransform.position.z
        ),
        quaternion: new CANNON.Quaternion(
          tableTransform.quaternion.x,
          tableTransform.quaternion.y,
          tableTransform.quaternion.z,
          tableTransform.quaternion.w
        ),
        allowSleep: true,
        sleepSpeedLimit: 0.05,
        sleepTimeLimit: 0.5,
        linearDamping: 0.5,  // Kills floaty sliding
        angularDamping: 0.9, // Aggressive damping to kill rolling/balancing
      });

      // Sphere coordinates are ALREADY in world units (spacing = 2*radius)
      // No FCC_SPACING needed - data pre-scaled
      const r = WORLD_SPHERE_RADIUS;
      let minY = Infinity;
      const positions: {x: number; y: number; z: number}[] = [];
      
      // Add sphere shapes directly (no scaling)
      piece.spheres.forEach((sphere) => {
        const offset = new CANNON.Vec3(sphere.x, sphere.y, sphere.z);
        
        const sphereShape = new CANNON.Sphere(r);
        body.addShape(sphereShape, offset);
        
        positions.push({x: sphere.x, y: sphere.y, z: sphere.z});
        minY = Math.min(minY, sphere.y);
      });
      
      // Compute bottom-footprint center (x,z) from spheres near lowest Y
      const eps = r * 0.25;
      const bottomSpheres = positions.filter(p => p.y <= minY + eps);
      const cx = bottomSpheres.reduce((sum, p) => sum + p.x, 0) / bottomSpheres.length;
      const cz = bottomSpheres.reduce((sum, p) => sum + p.z, 0) / bottomSpheres.length;
      
      // Add support pad UNDER the actual bottom footprint (prevents knife-edge balancing)
      const pad = new CANNON.Box(new CANNON.Vec3(r * 1.1, r * 0.02, r * 1.1)); // Larger for stability
      const padOffset = new CANNON.Vec3(cx, minY - r * 1.02, cz);
      body.addShape(pad, padOffset);
      
      // CRITICAL: Update mass properties after adding all shapes
      body.updateMassProperties();
      body.updateAABB();

      // Force body to wake up and settle properly
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.wakeUp();

      world.addBody(body);
      physicsBodies.set(piece.pieceId, body);
      
      // Debug: verify spawn height
      console.log(`⚙️ Spawned ${piece.pieceId} at Y=${body.position.y.toFixed(3)}, expected=${TABLE_PIECE_SPAWN_Y.toFixed(3)}`);
    });

    console.log(`⚙️ Created ${physicsBodies.size} physics bodies`);

    // Let physics settle (step 120 frames = 2 seconds at 60fps)
    console.log('⏳ Settling physics (120 frames)...');
    for (let i = 0; i < 120; i++) {
      world.step(1 / 60);
    }
    console.log('✅ Physics settled');

    // Read back settled poses and update table transforms ref
    console.log('📥 Reading back settled poses...');
    const settledTableTransforms: Record<string, any> = {};
    solution.pieces.forEach((piece) => {
      const body = physicsBodies.get(piece.pieceId);
      if (body) {
        settledTableTransforms[piece.pieceId] = {
          position: new THREE.Vector3(body.position.x, body.position.y, body.position.z),
          quaternion: new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w),
        };
      }
    });

    // Update transformsRef with settled poses
    if (transformsRef.current) {
      transformsRef.current.table = settledTableTransforms;
      console.log('✅ Table transforms updated with physics-settled poses');
    }
  }, [solution, transforms]);

  // Ground the puzzle on the mat (lowest spheres touch mat surface)
  // Run ONCE when solution and orientation are ready, using FINAL transforms only
  useEffect(() => {
    if (!puzzleRootRef.current || !solution || !solutionOrientation) return;

    console.log('🏔️ Computing puzzle ground offset (using FINAL transforms only)...');

    // Get root orientation quaternion
    const rootQuat = new THREE.Quaternion().fromArray(solutionOrientation.quaternion);

    let minCenterY = Infinity;

    // Method A: Compute exact minimum sphere center Y in world space using FINAL transforms
    solution.pieces.forEach(piece => {
      const finalPos = new THREE.Vector3(...piece.finalTransform.position);
      const finalQuat = new THREE.Quaternion(...piece.finalTransform.quaternion);

      // For each sphere in this piece
      piece.spheres.forEach(sphere => {
        const sphereLocal = new THREE.Vector3(sphere.x, sphere.y, sphere.z);
        
        // Transform by piece's FINAL transform
        const sphereWorld = sphereLocal.clone();
        sphereWorld.applyQuaternion(finalQuat);
        sphereWorld.add(finalPos);
        
        // Apply root orientation quaternion
        sphereWorld.applyQuaternion(rootQuat);
        
        // Track minimum Y
        minCenterY = Math.min(minCenterY, sphereWorld.y);
      });
    });

    // Compute ground offset: lowest sphere surface should touch mat
    // Desired lowest center Y = MAT_SURFACE_Y + WORLD_SPHERE_RADIUS
    const desiredMinCenterY = MAT_SURFACE_Y + WORLD_SPHERE_RADIUS;
    const groundOffsetY = desiredMinCenterY - minCenterY;

    // Apply offset to puzzleRoot (once, stable)
    puzzleRootRef.current.position.y = groundOffsetY;

    console.log(`🏔️ Ground offset applied: ${groundOffsetY.toFixed(3)} (min center Y: ${minCenterY.toFixed(3)} → ${desiredMinCenterY.toFixed(3)})`);
  }, [solution, solutionOrientation]);

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
