import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { IJK } from '../types/shape';
import type { ViewTransforms } from '../services/ViewTransforms';
import type { StudioSettings } from '../types/studio';
import { DEFAULT_STUDIO_SETTINGS } from '../types/studio';
import { HDRLoader } from '../services/HDRLoader';
import { updateShadowPlaneIntensity, validateShadowSystem } from './utils/shadowUtils';

interface ShapeEditorCanvasProps {
  cells: IJK[];
  view: ViewTransforms | null;
  mode: "add" | "remove";
  editEnabled: boolean;
  onCellsChange: (cells: IJK[]) => void;
  onSave?: () => void;
  containerOpacity?: number;
  containerColor?: string;
  containerRoughness?: number;
  settings?: StudioSettings; // Optional settings for advanced rendering
  onSceneReady?: (canvas: HTMLCanvasElement) => void; // Callback when canvas is ready
  interactionsDisabled?: boolean; // Disable mouse interactions (e.g., when modal is open)
}

export default function ShapeEditorCanvas({ 
  cells, 
  view, 
  mode,
  editEnabled,
  onCellsChange, 
  onSave,
  containerOpacity = 1.0,
  containerColor = '#ffffff',
  containerRoughness = 0.19,
  settings = DEFAULT_STUDIO_SETTINGS,
  onSceneReady,
  interactionsDisabled = false
}: ShapeEditorCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<OrbitControls>();
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const neighborMeshRef = useRef<THREE.Mesh[] | undefined>(undefined);
  const neighborIJKsRef = useRef<IJK[]>([]);
  
  // Lights and effects refs for settings
  const ambientLightRef = useRef<THREE.AmbientLight>();
  const directionalLightsRef = useRef<THREE.DirectionalLight[]>([]);
  const keyLightRef = useRef<THREE.DirectionalLight>();
  const shadowPlaneRef = useRef<THREE.Mesh>();
  const hdrLoaderRef = useRef<HDRLoader>();
  
  const [hoveredSphere, setHoveredSphere] = useState<number | null>(null);
  const [hoveredNeighbor, setHoveredNeighbor] = useState<number | null>(null);
  
  // Ref to always have latest cells value (prevents stale closure)
  const cellsRef = useRef<IJK[]>(cells);
  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  // Expose save function
  useEffect(() => {
    if (onSave) {
      (window as any).saveCurrentShape = onSave;
    }
  }, [cells, onSave]);

  // Expose OrbitControls target setting
  useEffect(() => {
    (window as any).setOrbitTarget = (center: THREE.Vector3) => {
      if (controlsRef.current) {
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
        console.log('🎯 OrbitControls target updated to:', center);
      } else {
        console.warn('⚠️ Cannot update OrbitControls target - controls not initialized');
      }
    };
    return () => {
      delete (window as any).setOrbitTarget;
    };
  }, []);

  useEffect(() => {
    (window as any).resetCameraFlag = () => {
      if ((window as any).hasInitializedCamera) {
        (window as any).hasInitializedCamera = false;
        console.log('🔄 ShapeEditorCanvas: Camera initialization flag reset');
      }
    };
  }, []);

  // Disable/enable mouse interactions when modal is open
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enabled = !interactionsDisabled;
      if (interactionsDisabled) {
        console.log('🚫 Canvas interactions disabled (modal open)');
      } else {
        console.log('✅ Canvas interactions enabled');
      }
    }
  }, [interactionsDisabled]);

  // Initialize Three.js
  useEffect(() => {
    if (!mountRef.current) return;

    console.log('🎬 ShapeEditorCanvas: Initializing Three.js');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1e1e);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(4, 4, 4);

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      preserveDrawingBuffer: true // Required for canvas.toBlob() screenshot capture
    });
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

    // Lighting setup with refs for settings control
    const ambient = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambient);
    ambientLightRef.current = ambient;

    const directionalLights = [
      new THREE.DirectionalLight(0xffffff, 1.0), // right
      new THREE.DirectionalLight(0xffffff, 0.8), // left
      new THREE.DirectionalLight(0xffffff, 0.6), // top (key)
      new THREE.DirectionalLight(0xffffff, 0.4), // bottom
      new THREE.DirectionalLight(0xffffff, 0.2), // front
    ];

    directionalLights[0].position.set(20, 0, 0);
    directionalLights[1].position.set(-20, 0, 0);
    directionalLights[2].position.set(30, 40, 30); // key light angled down
    directionalLights[3].position.set(0, -20, 0);
    directionalLights[4].position.set(0, 0, 20);

    directionalLights.forEach(l => scene.add(l));
    directionalLightsRef.current = directionalLights;
    keyLightRef.current = directionalLights[2];

    // Configure key light for shadows
    const keyLight = keyLightRef.current!;
    keyLight.castShadow = true;
    keyLight.intensity = 2.0;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.05;

    // HDR Loader
    HDRLoader.resetInstance();
    const hdrLoader = HDRLoader.getInstance();
    hdrLoader.initializePMREMGenerator(renderer);
    hdrLoaderRef.current = hdrLoader;

    // Ground plane removed per user request
    shadowPlaneRef.current = undefined;

    mountRef.current.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    // Notify parent that scene is ready (for thumbnail capture)
    if (onSceneReady) {
      onSceneReady(renderer.domElement);
    }

    // Animation loop required for damping
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update(); // Required for damping
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!camera || !renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    console.log('✅ ShapeEditorCanvas: Three.js initialized');

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Render main shape mesh
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    
    if (!scene || !camera || !controls) return;
    if (!cells.length || !view) return;

    // Remove previous mesh
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      if (Array.isArray(meshRef.current.material)) {
        meshRef.current.material.forEach((m: THREE.Material) => m.dispose());
      } else {
        meshRef.current.material.dispose();
      }
    }

    // Build instanced mesh
    const M = mat4ToThree(view.M_world);
    const radius = estimateSphereRadiusFromView(view);
    
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: settings.material.color,
      metalness: settings.material.metalness,
      roughness: settings.material.roughness,
      opacity: containerOpacity,
      transparent: containerOpacity < 1.0
    });

    const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    const dummy = new THREE.Object3D();

    cells.forEach((cell, i) => {
      const worldPos = new THREE.Vector3(cell.i, cell.j, cell.k).applyMatrix4(M);
      dummy.position.copy(worldPos);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // Don't set instance colors - use material color from settings
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    scene.add(mesh);
    meshRef.current = mesh;

    // Fit camera on first load
    if (!(window as any).hasInitializedCamera) {
      fitToObject(mesh);
      (window as any).hasInitializedCamera = true;
    }

    // Animation loop handles rendering

  }, [cells, view, containerOpacity, containerRoughness, settings.material]);

  // Generate neighbor spheres for add mode (exact SceneCanvas logic)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove previous neighbors
    if (neighborMeshRef.current) {
      for (const sphere of neighborMeshRef.current) {
        scene.remove(sphere);
        sphere.geometry.dispose();
        if (Array.isArray(sphere.material)) {
          sphere.material.forEach((m: THREE.Material) => m.dispose());
        } else {
          sphere.material.dispose();
        }
      }
      neighborMeshRef.current = undefined;
    }

    // Only create neighbors in add mode
    if (editEnabled && mode === "add" && cells.length && view) {
      const M = mat4ToThree(view.M_world);
      const radius = estimateSphereRadiusFromView(view);
      
      // Generate all 18 FCC neighbors
      const existingCells = new Set(cells.map(cell => `${cell.i},${cell.j},${cell.k}`));
      const potentialNeighbors = new Set<string>();
      
      for (const cell of cells) {
        const neighbors = [
          // 6 Face-adjacent neighbors
          { i: cell.i + 1, j: cell.j, k: cell.k },
          { i: cell.i - 1, j: cell.j, k: cell.k },
          { i: cell.i, j: cell.j + 1, k: cell.k },
          { i: cell.i, j: cell.j - 1, k: cell.k },
          { i: cell.i, j: cell.j, k: cell.k + 1 },
          { i: cell.i, j: cell.j, k: cell.k - 1 },
          // 12 Face-diagonal neighbors (FCC)
          { i: cell.i + 1, j: cell.j + 1, k: cell.k },
          { i: cell.i + 1, j: cell.j - 1, k: cell.k },
          { i: cell.i - 1, j: cell.j + 1, k: cell.k },
          { i: cell.i - 1, j: cell.j - 1, k: cell.k },
          { i: cell.i + 1, j: cell.j, k: cell.k + 1 },
          { i: cell.i + 1, j: cell.j, k: cell.k - 1 },
          { i: cell.i - 1, j: cell.j, k: cell.k + 1 },
          { i: cell.i - 1, j: cell.j, k: cell.k - 1 },
          { i: cell.i, j: cell.j + 1, k: cell.k + 1 },
          { i: cell.i, j: cell.j + 1, k: cell.k - 1 },
          { i: cell.i, j: cell.j - 1, k: cell.k + 1 },
          { i: cell.i, j: cell.j - 1, k: cell.k - 1 }
        ];
        
        for (const neighbor of neighbors) {
          const key = `${neighbor.i},${neighbor.j},${neighbor.k}`;
          if (!existingCells.has(key)) {
            potentialNeighbors.add(key);
          }
        }
      }
      
      // Convert to oriented positions and apply distance culling
      const neighborPositions: THREE.Vector3[] = [];
      const neighborIJKs: IJK[] = [];
      const actualCellPositions: THREE.Vector3[] = [];
      
      // Get actual cell positions in world coordinates
      for (const cell of cells) {
        const p_ijk = new THREE.Vector3(cell.i, cell.j, cell.k);
        const p = p_ijk.applyMatrix4(M);
        actualCellPositions.push(p);
      }
      
      // Distance culling: only keep neighbors within one diameter + margin
      const sphereDiameter = radius * 2;
      const maxDistance = sphereDiameter * 1.1; // 10% margin for edge cases
      
      for (const neighborKey of potentialNeighbors) {
        const [i, j, k] = neighborKey.split(',').map(Number);
        const p_ijk = new THREE.Vector3(i, j, k);
        const neighborPos = p_ijk.applyMatrix4(M);
        
        // Check if this neighbor is within range of any actual cell
        let isWithinRange = false;
        for (const cellPos of actualCellPositions) {
          const distance = neighborPos.distanceTo(cellPos);
          if (distance <= maxDistance) {
            isWithinRange = true;
            break;
          }
        }
        
        if (isWithinRange) {
          neighborPositions.push(neighborPos);
          neighborIJKs.push({ i, j, k });
        }
      }
      
      // Store IJK data for click handling
      neighborIJKsRef.current = neighborIJKs;
      
      // Create individual neighbor spheres with separate materials
      if (neighborPositions.length > 0) {
        const neighborGeom = new THREE.SphereGeometry(radius, 32, 24);
        const neighborSpheres: THREE.Mesh[] = [];
        
        for (let i = 0; i < neighborPositions.length; i++) {
          // Use empty cell settings (link to environment or custom material)
          const emptyCellMaterial = settings.emptyCells?.linkToEnvironment 
            ? settings.material 
            : (settings.emptyCells?.customMaterial || settings.material);
          
          // Create individual material for each neighbor
          const neighborMat = new THREE.MeshStandardMaterial({ 
            color: emptyCellMaterial.color,
            metalness: emptyCellMaterial.metalness,
            roughness: emptyCellMaterial.roughness,
            transparent: true,
            opacity: 0 // Invisible until hovered
          });
          
          // Create individual mesh for each neighbor
          const neighborSphere = new THREE.Mesh(neighborGeom, neighborMat);
          neighborSphere.position.copy(neighborPositions[i]);
          
          scene.add(neighborSphere);
          neighborSpheres.push(neighborSphere);
        }
        
        // Store neighbor spheres for hover detection
        neighborMeshRef.current = neighborSpheres;
      }
    }
    
    // Animation loop handles rendering

  }, [editEnabled, mode, cells, view, containerRoughness, settings.emptyCells, settings.material]);

  // Hover detection for remove mode with double-click/long-press
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const raycaster = raycasterRef.current;
    const mouse = mouseRef.current;

    if (!renderer || !camera || !raycaster || !mouse) return;
    if (!editEnabled || mode !== "remove") return;

    let lastClickTime = 0;
    let longPressTimer: number | null = null;
    const DOUBLE_CLICK_DELAY = 300; // ms
    const LONG_PRESS_DELAY = 500; // ms
    
    // Track mouse movement for orbit control detection
    let mouseDownPos: { x: number; y: number } | null = null;
    let mouseMoved = false;
    const MOVE_THRESHOLD = 5; // pixels
    
    // Throttle raycasting to max 60fps (fixes sluggishness)
    let rafId: number | null = null;
    let pendingMouseEvent: MouseEvent | null = null;

    const performRaycast = () => {
      if (!pendingMouseEvent) {
        rafId = null;
        return;
      }

      const event = pendingMouseEvent;
      pendingMouseEvent = null;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const mesh = meshRef.current;
      if (!mesh) return;

      const intersections = raycaster.intersectObject(mesh);
      if (intersections.length > 0) {
        const instanceId = intersections[0].instanceId;
        if (instanceId !== undefined && instanceId !== hoveredSphere) {
          setHoveredSphere(instanceId);
        }
      } else if (hoveredSphere !== null) {
        setHoveredSphere(null);
      }

      rafId = null;
    };

    const onMouseMove = (event: MouseEvent) => {
      // Track mouse movement during drag for orbit control detection
      if (mouseDownPos && event.buttons !== 0) {
        const dx = event.clientX - mouseDownPos.x;
        const dy = event.clientY - mouseDownPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > MOVE_THRESHOLD) {
          mouseMoved = true;
          // Cancel long press timer - user is dragging for orbit control
          if (longPressTimer !== null) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        }
      }
      
      // Don't raycast while orbiting (controls are active during drag)
      if (event.buttons !== 0) return; // Mouse button is pressed (dragging)
      
      pendingMouseEvent = event;
      if (rafId === null) {
        rafId = requestAnimationFrame(performRaycast);
      }
    };

    const deleteCell = () => {
      if (mode !== "remove") return;
      if (hoveredSphere !== null && hoveredSphere < cellsRef.current.length) {
        const newCells = cellsRef.current.filter((_, i) => i !== hoveredSphere);
        onCellsChange(newCells);
        setHoveredSphere(null);
      }
    };

    const onMouseDown = (event: MouseEvent) => {
      // Track mouse down position for orbit control detection
      mouseDownPos = { x: event.clientX, y: event.clientY };
      mouseMoved = false;
      
      if (mode !== "remove" || hoveredSphere === null) return;
      
      // Start long press timer
      longPressTimer = window.setTimeout(() => {
        deleteCell();
        longPressTimer = null;
      }, LONG_PRESS_DELAY);
    };

    const onMouseUp = () => {
      // Cancel long press if mouse released early
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      // Reset tracking
      mouseDownPos = null;
    };

    const onMouseClick = () => {
      // Prevent click if mouse moved (orbit control action)
      if (mouseMoved) {
        mouseMoved = false;
        return;
      }
      
      if (mode !== "remove" || hoveredSphere === null) return;
      
      const now = Date.now();
      const timeSinceLastClick = now - lastClickTime;
      
      if (timeSinceLastClick < DOUBLE_CLICK_DELAY) {
        // Double-click detected
        deleteCell();
        lastClickTime = 0; // Reset
      } else {
        // First click
        lastClickTime = now;
      }
    };

    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('click', onMouseClick);

    return () => {
      if (longPressTimer !== null) clearTimeout(longPressTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('click', onMouseClick);
    };
  }, [editEnabled, mode, hoveredSphere, onCellsChange]);

  // Hover detection for add mode with double-click/long-press
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const raycaster = raycasterRef.current;
    const mouse = mouseRef.current;

    if (!renderer || !camera || !raycaster || !mouse) return;
    if (!editEnabled || mode !== "add") return;

    let lastClickTime = 0;
    let longPressTimer: number | null = null;
    const DOUBLE_CLICK_DELAY = 300; // ms
    const LONG_PRESS_DELAY = 500; // ms
    
    // Track mouse movement for orbit control detection
    let mouseDownPos: { x: number; y: number } | null = null;
    let mouseMoved = false;
    const MOVE_THRESHOLD = 5; // pixels
    
    // Throttle raycasting to max 60fps (fixes sluggishness)
    let rafId: number | null = null;
    let pendingMouseEvent: MouseEvent | null = null;

    const performRaycast = () => {
      if (!pendingMouseEvent) {
        rafId = null;
        return;
      }

      const event = pendingMouseEvent;
      pendingMouseEvent = null;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const neighborMeshes = neighborMeshRef.current;
      if (!neighborMeshes) return;

      const intersections = raycaster.intersectObjects(neighborMeshes);
      if (intersections.length > 0) {
        const intersectedMesh = intersections[0].object;
        const index = neighborMeshes.indexOf(intersectedMesh as THREE.Mesh);
        if (index !== -1 && index !== hoveredNeighbor) {
          setHoveredNeighbor(index);
        }
      } else if (hoveredNeighbor !== null) {
        setHoveredNeighbor(null);
      }

      rafId = null;
    };

    const onMouseMove = (event: MouseEvent) => {
      // Track mouse movement during drag for orbit control detection
      if (mouseDownPos && event.buttons !== 0) {
        const dx = event.clientX - mouseDownPos.x;
        const dy = event.clientY - mouseDownPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > MOVE_THRESHOLD) {
          mouseMoved = true;
          // Cancel long press timer - user is dragging for orbit control
          if (longPressTimer !== null) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        }
      }
      
      // Don't raycast while orbiting (controls are active during drag)
      if (event.buttons !== 0) return; // Mouse button is pressed (dragging)
      
      pendingMouseEvent = event;
      if (rafId === null) {
        rafId = requestAnimationFrame(performRaycast);
      }
    };

    const addCell = () => {
      if (mode !== "add") return;
      const neighborIJKs = neighborIJKsRef.current;
      if (!neighborIJKs || hoveredNeighbor === null) return;

      if (hoveredNeighbor < neighborIJKs.length) {
        const newCell = neighborIJKs[hoveredNeighbor];
        onCellsChange([...cellsRef.current, newCell]);
        setHoveredNeighbor(null);
      }
    };

    const onMouseDown = (event: MouseEvent) => {
      // Track mouse down position for orbit control detection
      mouseDownPos = { x: event.clientX, y: event.clientY };
      mouseMoved = false;
      
      if (mode !== "add" || hoveredNeighbor === null) return;
      
      // Start long press timer
      longPressTimer = window.setTimeout(() => {
        addCell();
        longPressTimer = null;
      }, LONG_PRESS_DELAY);
    };

    const onMouseUp = () => {
      // Cancel long press if mouse released early
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      // Reset tracking
      mouseDownPos = null;
    };

    const onMouseClick = () => {
      // Prevent click if mouse moved (orbit control action)
      if (mouseMoved) {
        mouseMoved = false;
        return;
      }
      
      if (mode !== "add" || hoveredNeighbor === null) return;
      
      const now = Date.now();
      const timeSinceLastClick = now - lastClickTime;
      
      if (timeSinceLastClick < DOUBLE_CLICK_DELAY) {
        // Double-click detected
        addCell();
        lastClickTime = 0; // Reset
      } else {
        // First click
        lastClickTime = now;
      }
    };

    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('click', onMouseClick);

    return () => {
      if (longPressTimer !== null) clearTimeout(longPressTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('click', onMouseClick);
    };
  }, [editEnabled, mode, hoveredNeighbor, onCellsChange]);

  // Update neighbor materials in real-time when settings change
  useEffect(() => {
    const neighborMeshes = neighborMeshRef.current;
    if (!neighborMeshes) return;

    // Get material settings
    const emptyCellMaterial = settings.emptyCells?.linkToEnvironment 
      ? settings.material 
      : (settings.emptyCells?.customMaterial || settings.material);

    console.log('🎨 Updating empty cell materials:', {
      linkToEnvironment: settings.emptyCells?.linkToEnvironment,
      color: emptyCellMaterial.color,
      metalness: emptyCellMaterial.metalness,
      roughness: emptyCellMaterial.roughness,
      opacity: emptyCellMaterial.opacity,
      neighborCount: neighborMeshes.length
    });

    // Update all neighbor materials with new settings
    neighborMeshes.forEach((mesh, index) => {
      const material = mesh.material as THREE.MeshStandardMaterial;
      const oldColor = material.color.getHexString();
      material.color.set(emptyCellMaterial.color);
      material.metalness = emptyCellMaterial.metalness;
      material.roughness = emptyCellMaterial.roughness;
      // Don't change opacity here - that's handled by hover effect
      material.needsUpdate = true;
      
      if (index === 0) {
        console.log('  Material update sample:', {
          oldColor: '#' + oldColor,
          newColor: emptyCellMaterial.color,
          opacity: material.opacity,
          visible: mesh.visible
        });
      }
    });

    // Force render to show changes immediately
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
    
  }, [
    settings.emptyCells?.linkToEnvironment,
    settings.emptyCells?.customMaterial?.color,
    settings.emptyCells?.customMaterial?.metalness,
    settings.emptyCells?.customMaterial?.roughness,
    settings.emptyCells?.customMaterial?.opacity,
    settings.material.color,
    settings.material.metalness,
    settings.material.roughness,
    settings.material.opacity
  ]);

  // Update hover highlight for neighbors (add mode) - solid green with metallic properties like placed spheres
  useEffect(() => {
    const neighborMeshes = neighborMeshRef.current;
    if (!neighborMeshes) return;

    const greenColor = new THREE.Color(0x00ff00); // Solid green for add mode

    console.log('👆 Updating hover for neighbor:', hoveredNeighbor);

    // Update all neighbors: hovered = solid green metallic, others = invisible
    neighborMeshes.forEach((mesh, i) => {
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (i === hoveredNeighbor) {
        // Match placed sphere material properties but with green color
        material.color.copy(greenColor);
        material.metalness = settings.material.metalness;
        material.roughness = settings.material.roughness;
        material.opacity = 1.0; // Fully opaque like placed spheres
        material.transparent = false; // Solid, not transparent
      } else {
        // Invisible when not hovered
        material.opacity = 0;
        material.transparent = true;
      }
      material.needsUpdate = true;
    });

    // Force render to show changes immediately
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }

  }, [
    hoveredNeighbor,
    settings.material.metalness,
    settings.material.roughness
  ]);

  // Update hover highlight for cells (remove mode) - only one red at a time
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    
    const redColor = new THREE.Color(0xff0000);
    const normalColor = new THREE.Color(settings.material.color);
    
    // Update all cells: hovered one is red, all others use settings color
    for (let i = 0; i < cells.length; i++) {
      if (i === hoveredSphere) {
        mesh.setColorAt(i, redColor);
      } else {
        mesh.setColorAt(i, normalColor);
      }
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    
    // Animation loop handles rendering

  }, [hoveredSphere, cells.length, settings.material.color]);

  // Fit camera to object
  const fitToObject = (object: THREE.Object3D) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.1; // Balanced view for good screen usage

    cameraRef.current.position.set(
      center.x + distance * 0.7,
      center.y + distance * 0.7,
      center.z + distance * 0.7
    );

    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  };

  // Update materials when settings change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!meshRef.current?.material || !scene) return;

    const material = meshRef.current.material as THREE.MeshStandardMaterial;
    material.color.set(settings.material.color);
    material.metalness = settings.material.metalness;
    material.roughness = settings.material.roughness;

    material.envMapIntensity = settings.lights.hdr.enabled
      ? settings.lights.hdr.intensity
      : 1.0;

    if (material.envMap) {
      material.envMap = null; // use scene.environment
    }

    material.needsUpdate = true;
  }, [settings.material, settings.lights.hdr]);

  // Update lighting + HDR when settings change
  useEffect(() => {
    const scene = sceneRef.current;
    const hdrLoader = hdrLoaderRef.current;
    if (!scene || !ambientLightRef.current) return;

    // Background
    scene.background = new THREE.Color(settings.lights.backgroundColor);

    // Ambient
    ambientLightRef.current.intensity = 0.3 * settings.lights.brightness;

    // Directionals - protect key light from being zeroed out
    directionalLightsRef.current.forEach((light, i) => {
      if (i < settings.lights.directional.length) {
        const v = settings.lights.directional[i] * settings.lights.brightness;
        // keep a minimum intensity on the key light so shadows never disappear
        light.intensity = (light === keyLightRef.current) ? Math.max(v, 0.3) : v;
      }
    });

    // Keep one shadow light even with HDR
    const keyLight = keyLightRef.current;
    if (keyLight) keyLight.castShadow = settings.lights.shadows.enabled;

    // Update shadow plane intensity
    updateShadowPlaneIntensity(shadowPlaneRef, settings.lights.shadows.intensity);
    
    // Direct shadow plane update
    if (shadowPlaneRef.current && shadowPlaneRef.current.material instanceof THREE.ShadowMaterial) {
      const shadowOpacity = settings.lights.shadows.intensity * 0.4;
      shadowPlaneRef.current.material.opacity = Math.max(0.05, shadowOpacity);
      shadowPlaneRef.current.material.needsUpdate = true;
      shadowPlaneRef.current.visible = settings.lights.shadows.enabled;
    }
    
    // Validate shadow system
    validateShadowSystem(shadowPlaneRef, keyLightRef, settings.lights.shadows);

    if (settings.lights.hdr.enabled) {
      // ensure some direct light so shadows appear over IBL
      directionalLightsRef.current.forEach((light) => {
        light.intensity = Math.max(light.intensity, 0.25 * settings.lights.brightness);
      });
    }

    // HDR env
    if (settings.lights.hdr.enabled && settings.lights.hdr.envId && hdrLoader) {
      hdrLoader
        .loadEnvironment(settings.lights.hdr.envId)
        .then((envMap) => {
          if (!envMap) return;
          scene.environment = envMap;
          if (meshRef.current?.material instanceof THREE.MeshStandardMaterial) {
            const mat = meshRef.current.material;
            mat.envMap = envMap;
            mat.envMapIntensity = settings.lights.hdr.intensity;
            mat.needsUpdate = true;
          }
        })
        .catch((e) => console.error('HDR load error', e));
    } else {
      scene.environment = null;
      if (meshRef.current?.material instanceof THREE.MeshStandardMaterial) {
        const mat = meshRef.current.material;
        mat.envMap = null;
        mat.needsUpdate = true;
      }
    }
  }, [settings.lights, settings.material.metalness, settings.material.roughness]);

  return <div ref={mountRef} style={{ 
    width: "100%", 
    height: "100%", 
    position: "absolute",
    left: 0,
    overflow: "hidden"
  }} />;
}

// Helper functions
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

function estimateSphereRadiusFromView(view: ViewTransforms): number {
  const mat4 = view.M_world;
  const mat4ToThree = (M: number[][]) => {
    const matrix = new THREE.Matrix4();
    matrix.set(
      M[0][0], M[0][1], M[0][2], M[0][3],
      M[1][0], M[1][1], M[1][2], M[1][3],
      M[2][0], M[2][1], M[2][2], M[2][3],
      M[3][0], M[3][1], M[3][2], M[3][3]
    );
    return matrix;
  };
  
  const toV3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(mat4ToThree(mat4));
  const p0 = toV3(0, 0, 0), p1 = toV3(1, 0, 0);
  const distance = p0.distanceTo(p1);
  const radius = distance / 2;
  return radius;
}
