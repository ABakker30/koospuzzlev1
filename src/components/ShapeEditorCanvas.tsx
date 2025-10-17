import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { IJK } from '../types/shape';
import type { ViewTransforms } from '../services/ViewTransforms';

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
}

export default function ShapeEditorCanvas({ 
  cells, 
  view, 
  mode,
  editEnabled,
  onCellsChange, 
  onSave,
  containerOpacity = 1.0,
  containerColor = "#2b6cff",
  containerRoughness = 0.19
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
      }
    };
    (window as any).resetCameraFlag = () => {
      if ((window as any).hasInitializedCamera) {
        (window as any).hasInitializedCamera = false;
        console.log('🔄 ShapeEditorCanvas: Camera initialization flag reset');
      }
    };
  }, []);

  // Initialize Three.js
  useEffect(() => {
    if (!mountRef.current) return;

    console.log('🎬 ShapeEditorCanvas: Initializing Three.js');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1e1e);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(10, 10, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting - 4 lights from all sides with brightness multiplier
    const brightness = 3.0; // User-requested brightness
    
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6 * brightness);
    scene.add(ambientLight);
    
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8 * brightness);
    directionalLight1.position.set(10, 10, 5);
    directionalLight1.castShadow = true;
    scene.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4 * brightness);
    directionalLight2.position.set(-10, -10, -5);
    scene.add(directionalLight2);
    
    const directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.3 * brightness);
    directionalLight3.position.set(5, -10, 10);
    scene.add(directionalLight3);
    
    const directionalLight4 = new THREE.DirectionalLight(0xffffff, 0.3 * brightness);
    directionalLight4.position.set(-5, 10, -10);
    scene.add(directionalLight4);

    mountRef.current.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    // Render only when controls change (orbit, pan, zoom)
    // Damping works because we render while controls are updating
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
    };
    
    render(); // Initial render
    controls.addEventListener('change', render);

    const onResize = () => {
      if (!camera || !renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    console.log('✅ ShapeEditorCanvas: Three.js initialized');

    return () => {
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('change', render);
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
      color: 0xffffff, // Use white base so instance colors show correctly
      metalness: 0,
      roughness: containerRoughness,
      transparent: containerOpacity < 1.0,
      opacity: containerOpacity
    });

    const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
    const dummy = new THREE.Object3D();
    const baseColor = new THREE.Color(containerColor);

    cells.forEach((cell, i) => {
      const worldPos = new THREE.Vector3(cell.i, cell.j, cell.k).applyMatrix4(M);
      dummy.position.copy(worldPos);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, baseColor); // Initialize colors
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

  }, [cells, view, containerOpacity, containerColor, containerRoughness]);

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
          // Create individual material for each neighbor (solid green, initially invisible)
          const neighborMat = new THREE.MeshStandardMaterial({ 
            color: 0x00ff00,
            metalness: 0,
            roughness: containerRoughness,
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

  }, [editEnabled, mode, cells, view, containerRoughness]);

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

    const onMouseDown = () => {
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
    };

    const onMouseClick = () => {
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

    const onMouseDown = () => {
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
    };

    const onMouseClick = () => {
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

  // Update hover highlight for neighbors (add mode) - solid green on hover
  useEffect(() => {
    const neighborMeshes = neighborMeshRef.current;
    if (!neighborMeshes) return;

    neighborMeshes.forEach((mesh, i) => {
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (i === hoveredNeighbor) {
        material.opacity = 1.0; // Solid green on hover
      } else {
        material.opacity = 0; // Hide when not hovered
      }
      material.needsUpdate = true;
    });
    
    // Animation loop handles rendering

  }, [hoveredNeighbor]);

  // Update hover highlight for cells (remove mode) - only one red at a time
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    
    const baseColor = new THREE.Color(containerColor);
    const redColor = new THREE.Color(0xff0000);
    
    // Update all cells: hovered one is red, all others are base color
    for (let i = 0; i < cells.length; i++) {
      if (i === hoveredSphere) {
        mesh.setColorAt(i, redColor);
      } else {
        mesh.setColorAt(i, baseColor);
      }
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    
    // Animation loop handles rendering

  }, [hoveredSphere, cells.length, containerColor]);

  // Fit camera to object
  const fitToObject = (object: THREE.Object3D) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.8; // Closer view (was 2.5)

    cameraRef.current.position.set(
      center.x + distance * 0.7,
      center.y + distance * 0.7,
      center.z + distance * 0.7
    );

    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  };

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
