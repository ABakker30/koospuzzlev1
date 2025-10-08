import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { IJK } from "../types/shape";
import type { ViewTransforms } from "../services/ViewTransforms";

interface SceneCanvasProps {
  cells: IJK[];
  view: ViewTransforms | null;
  editMode: boolean;
  mode: "add" | "remove";
  onCellsChange: (cells: IJK[]) => void;
  onSave?: () => void;
};

export default function SceneCanvas({ cells, view, editMode, mode, onCellsChange, onSave }: SceneCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const controlsRef = useRef<any>();
  const meshRef = useRef<THREE.InstancedMesh>();
  const didFitRef = useRef(false);
  const raycasterRef = useRef<THREE.Raycaster>();
  const mouseRef = useRef<THREE.Vector2>();
  const isEditingRef = useRef(false);
  const hasInitializedCameraRef = useRef(false);
  const neighborMeshRef = useRef<THREE.InstancedMesh>();
  const neighborIJKsRef = useRef<IJK[]>([]);

  // Hover state for remove mode
  const [hoveredSphere, setHoveredSphere] = useState<number | null>(null);
  
  // Hover state for add mode
  const [hoveredNeighbor, setHoveredNeighbor] = useState<number | null>(null);
  const hoveredNeighborRef = useRef<number | null>(null);
  
  // Double-click and long press state for add mode
  const longPressTimeoutRef = useRef<number | null>(null);
  const isLongPressRef = useRef(false);
  const lastClickTimeRef = useRef<number>(0);
  const isMouseDownRef = useRef(false);

  // Material settings (final values)
  const materialColor = "#2b6cff";
  const brightness = 2.7;
  const metalness = 0;
  const roughness = 0.19;

  // Save functionality with native file dialog
  const saveShape = async () => {
    if (!cells.length) {
      alert('No cells to save!');
      return;
    }

    // Generate SHA256-like hash (simplified for demo)
    const cellsString = JSON.stringify(cells.map(cell => [cell.i, cell.j, cell.k]));
    const hash = 'sha256:' + btoa(cellsString).substring(0, 32);

    // Create the save data in the same format as the example file
    const saveData = {
      version: "1.0",
      lattice: "fcc",
      cells: cells.map(cell => [cell.i, cell.j, cell.k]),
      cid: hash,
      designer: {
        name: "Shape Editor User",
        date: new Date().toISOString().split('T')[0] // YYYY-MM-DD format
      }
    };

    const jsonContent = JSON.stringify(saveData, null, 2);
    const filename = `${cells.length} cell.fcc.json`;

    try {
      // Try File System Access API first (modern browsers)
      if ('showSaveFilePicker' in window) {
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'FCC JSON files',
            accept: { 'application/json': ['.json'] }
          }]
        });

        const writable = await fileHandle.createWritable();
        await writable.write(jsonContent);
        await writable.close();

        console.log(`💾 Saved shape with ${cells.length} cells as ${fileHandle.name}`);
      } else {
        // Fallback to traditional download for older browsers
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log(`💾 Downloaded shape with ${cells.length} cells as ${filename}`);
      }
    } catch (error) {
      // User cancelled the save dialog or other error
      if ((error as Error).name !== 'AbortError') {
        console.error('Save failed:', error);
        alert('Failed to save file. Please try again.');
      }
    }
  };

  // Expose save function to parent if callback provided
  useEffect(() => {
    if (onSave) {
      // This is a simple approach - in a real app you might use useImperativeHandle
      (window as any).saveCurrentShape = saveShape;
    }
  }, [cells, onSave]);

  // Expose OrbitControls target setting to parent component
  useEffect(() => {
    (window as any).setOrbitTarget = (center: THREE.Vector3) => {
      if (controlsRef.current) {
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }
    };
    
    // Expose editing flag setter to parent component
    (window as any).setEditingFlag = (editing: boolean) => {
      isEditingRef.current = editing;
    };
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;


    // Basic Three.js setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    mountRef.current.appendChild(renderer.domElement);

    // Lighting setup with base intensities
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(10, 10, 5);
    directionalLight1.castShadow = true;
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-10, -10, -5);
    scene.add(directionalLight2);

    const directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight3.position.set(5, -10, 10);
    scene.add(directionalLight3);

    const directionalLight4 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight4.position.set(-5, 10, -10);
    scene.add(directionalLight4);

    // Apply brightness setting to all lights
    const baseIntensities = [0.6, 0.8, 0.4, 0.3, 0.3];
    const lights = [ambientLight, directionalLight1, directionalLight2, directionalLight3, directionalLight4];
    lights.forEach((light, i) => {
      light.intensity = baseIntensities[i] * brightness;
    });

    // Initialize raycaster and mouse for hover detection
    raycasterRef.current = new THREE.Raycaster();
    mouseRef.current = new THREE.Vector2();

    // Create OrbitControls once (target will be set by parent component)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enabled = true;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controlsRef.current = controls;

    sceneRef.current = scene; 
    cameraRef.current = camera; 
    rendererRef.current = renderer;

    // Render loop
    let raf = 0;
    const loop = () => { 
      raf = requestAnimationFrame(loop); 
      if (controlsRef.current) controlsRef.current.update();
      renderer.render(scene, camera); 
    };
    loop();

    // Resize handling
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);


    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(raf);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Synchronous shape processing when data is available
  useEffect(() => {
    const scene = sceneRef.current, camera = cameraRef.current, renderer = rendererRef.current;
    if (!scene || !camera || !renderer) return;
    if (!cells.length || !view) return;

    // Reset camera initialization for new file loads (but not for editing operations)
    if (!isEditingRef.current) {
      hasInitializedCameraRef.current = false;
    }

    // Clean up previous geometry if it exists
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      (meshRef.current.material as THREE.Material).dispose();
      meshRef.current = undefined;
    }

    // Step 1: Convert to XYZ and orient (already done in ViewTransforms)
    const M = mat4ToThree(view.M_world);
    const radius = estimateSphereRadiusFromView(view);
    
    // Step 2: Compute bounding box and center from oriented positions
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity; 
    let minZ = Infinity, maxZ = -Infinity;
    
    const spherePositions: THREE.Vector3[] = [];
    for (let i = 0; i < cells.length; i++) {
      const p_ijk = new THREE.Vector3(cells[i].i, cells[i].j, cells[i].k);
      const p = p_ijk.applyMatrix4(M);
      spherePositions.push(p);
      
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    
    const center = new THREE.Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2
    );
    const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    
    // Step 3: Set camera to center and fill screen (only for initial file load)
    if (!hasInitializedCameraRef.current && !isEditingRef.current) {
      const fov = camera.fov * (Math.PI / 180);
      const distance = (size / 2) / Math.tan(fov / 2) * 1.1; // Smaller margin for better screen fill
      
      // Position camera at 45-degree angle up from XZ plane
      const angle45 = Math.PI / 4; // 45 degrees in radians
      const horizontalDistance = distance * Math.cos(angle45);
      const verticalDistance = distance * Math.sin(angle45);
      
      camera.position.set(
        center.x + horizontalDistance,
        center.y + verticalDistance,
        center.z + horizontalDistance
      );
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      controlsRef.current.update();
      
      // Mark camera as initialized - never reposition automatically again
      hasInitializedCameraRef.current = true;
    } else {
      // Reset editing flag after handling the edit
      isEditingRef.current = false;
    }

    // Step 5: Create and show mesh
    const geom = new THREE.SphereGeometry(radius, 32, 24);
    const mat = new THREE.MeshStandardMaterial({ 
      color: 0xffffff, // Use white base color so instance colors show correctly
      metalness: metalness,
      roughness: roughness
    });
    const mesh = new THREE.InstancedMesh(geom, mat, cells.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Set up instance colors for hover effects
    const colors = new Float32Array(cells.length * 3);
    const blueColor = new THREE.Color(materialColor);
    for (let i = 0; i < cells.length; i++) {
      colors[i * 3] = blueColor.r;
      colors[i * 3 + 1] = blueColor.g;
      colors[i * 3 + 2] = blueColor.b;
    }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

    // Position spheres
    for (let i = 0; i < cells.length; i++) {
      const p = spherePositions[i];
      const m = new THREE.Matrix4();
      m.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Add new mesh to scene
    scene.add(mesh);
    meshRef.current = mesh;
  }, [cells, view]);

  // Reset fit flag when cells change from empty to non-empty
  useEffect(() => {
    if (cells.length === 0) {
      didFitRef.current = false;
    }
  }, [cells.length]);

  // Edit mode detection
  useEffect(() => {
    if (editMode) {
      console.log(`🛠️ Edit mode entered - Mode: ${mode.toUpperCase()}`);
    }
  }, [editMode, mode]);

  // Neighbor generation for add mode
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clean up previous neighbor spheres
    if (neighborMeshRef.current) {
      const neighborSpheres = neighborMeshRef.current as any as THREE.Mesh[];
      if (Array.isArray(neighborSpheres)) {
        neighborSpheres.forEach(sphere => {
          scene.remove(sphere);
          sphere.geometry.dispose();
          (sphere.material as THREE.Material).dispose();
        });
      } else {
        // Handle old instanced mesh format
        scene.remove(neighborMeshRef.current);
        neighborMeshRef.current.geometry.dispose();
        (neighborMeshRef.current.material as THREE.Material).dispose();
      }
      neighborMeshRef.current = undefined;
    }

    // Only create neighbors in add mode
    if (editMode && mode === "add" && cells.length && view) {
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
          // Create individual material for each neighbor (fully transparent)
          const neighborMat = new THREE.MeshStandardMaterial({ 
            color: 0x00ff00,
            metalness: metalness,
            roughness: roughness,
            transparent: true,
            opacity: 0 // Completely invisible
          });
          
          // Create individual mesh for each neighbor
          const neighborSphere = new THREE.Mesh(neighborGeom, neighborMat);
          neighborSphere.position.copy(neighborPositions[i]);
          
          scene.add(neighborSphere);
          neighborSpheres.push(neighborSphere);
        }
        
        // Store neighbor spheres for hover detection
        neighborMeshRef.current = neighborSpheres as any;
      }
    }
  }, [editMode, mode, cells, view]);

  // Mouse hover detection for remove mode
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const mesh = meshRef.current;
    const raycaster = raycasterRef.current;
    const mouse = mouseRef.current;

    if (!renderer || !camera || !mesh || !raycaster || !mouse) return;
    if (!editMode || mode !== "remove") return;

    const onMouseMove = (event: MouseEvent) => {
      // Convert mouse coordinates to normalized device coordinates (-1 to +1)
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Update raycaster
      raycaster.setFromCamera(mouse, camera);

      // Check for intersections with the mesh
      const intersections = raycaster.intersectObject(mesh);

      if (intersections.length > 0) {
        // We're over a sphere - prevent OrbitControls from handling this event
        event.preventDefault();
        event.stopPropagation();

        // Get the closest intersection
        const closestIntersection = intersections[0];
        const sphereIndex = closestIntersection.instanceId;

        if (sphereIndex !== undefined && sphereIndex !== hoveredSphere) {
          // Restore previous hovered sphere to blue
          if (hoveredSphere !== null) {
            const blueColor = new THREE.Color(materialColor);
            mesh.setColorAt(hoveredSphere, blueColor);
          }

          // Set new hovered sphere to red
          const redColor = new THREE.Color(0xff0000);
          mesh.setColorAt(sphereIndex, redColor);
          mesh.instanceColor!.needsUpdate = true;

          setHoveredSphere(sphereIndex);
        }
      } else {
        // No intersection - restore any hovered sphere to blue and let OrbitControls handle the event
        if (hoveredSphere !== null) {
          const blueColor = new THREE.Color(materialColor);
          mesh.setColorAt(hoveredSphere, blueColor);
          mesh.instanceColor!.needsUpdate = true;
          setHoveredSphere(null);
        }
        // Don't prevent default - let OrbitControls handle this mouse movement
      }
    };

    const onMouseClick = (event: MouseEvent) => {
      // Only process clicks when there's a hovered sphere (red sphere)
      if (hoveredSphere !== null) {
        // We're clicking on a sphere - prevent OrbitControls from handling this
        event.preventDefault();
        event.stopPropagation();

        const cellToRemove = cells[hoveredSphere];
        console.log(`🗑️ Removing cell: i=${cellToRemove.i}, j=${cellToRemove.j}, k=${cellToRemove.k}`);
        
        // Mark that we're editing to prevent camera auto-centering
        isEditingRef.current = true;
        
        // Remove from cells array
        const newCells = cells.filter((_, index) => index !== hoveredSphere);
        
        // Update parent component with new cells
        onCellsChange(newCells);
        
        // Clear hover state since cell is being removed
        setHoveredSphere(null);
      }
      // If not hovering over a sphere, let OrbitControls handle the click normally
    };

    // Add event listeners
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('click', onMouseClick);

    // Cleanup function
    return () => {
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('click', onMouseClick);
      // Restore any hovered sphere when leaving remove mode
      if (hoveredSphere !== null) {
        const blueColor = new THREE.Color(materialColor);
        mesh.setColorAt(hoveredSphere, blueColor);
        mesh.instanceColor!.needsUpdate = true;
        setHoveredSphere(null);
      }
    };
  }, [editMode, mode, hoveredSphere, materialColor]);

  // Mouse hover detection for add mode
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const raycaster = raycasterRef.current;
    const mouse = mouseRef.current;

    if (!renderer || !camera || !raycaster || !mouse) return;
    if (!editMode || mode !== "add") return;

    const onMouseMove = (event: MouseEvent) => {
      // Read current neighbor spheres each time (avoid stale closure)
      const neighborSpheres = neighborMeshRef.current as any as THREE.Mesh[];
      if (!neighborSpheres || !Array.isArray(neighborSpheres)) return;

      // Don't allow hover changes during mouse down (prevents jumping during double-click)
      if (isMouseDownRef.current) return;

      // Convert mouse coordinates to normalized device coordinates (-1 to +1)
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Update raycaster
      raycaster.setFromCamera(mouse, camera);

      // Check for intersections with neighbor spheres
      const intersections = raycaster.intersectObjects(neighborSpheres);

      if (intersections.length > 0) {
        // We're over a neighbor - prevent OrbitControls from handling this event
        event.preventDefault();
        event.stopPropagation();

        // Get the closest intersection and find its index
        const closestIntersection = intersections[0];
        const neighborIndex = neighborSpheres.indexOf(closestIntersection.object as THREE.Mesh);

        if (neighborIndex !== -1 && neighborIndex !== hoveredNeighborRef.current) {
          // Restore previous hovered neighbor to invisible
          if (hoveredNeighborRef.current !== null && neighborSpheres[hoveredNeighborRef.current]) {
            (neighborSpheres[hoveredNeighborRef.current].material as THREE.MeshStandardMaterial).opacity = 0;
          }

          // Set new hovered neighbor to solid green
          (neighborSpheres[neighborIndex].material as THREE.MeshStandardMaterial).opacity = 1.0;

          // Update both ref and state
          hoveredNeighborRef.current = neighborIndex;
          setHoveredNeighbor(neighborIndex);
        }
      } else {
        // No intersection - restore any hovered neighbor to invisible
        if (hoveredNeighborRef.current !== null && neighborSpheres[hoveredNeighborRef.current]) {
          (neighborSpheres[hoveredNeighborRef.current].material as THREE.MeshStandardMaterial).opacity = 0;
          hoveredNeighborRef.current = null;
          setHoveredNeighbor(null);
        }
        // Don't prevent default - let OrbitControls handle this mouse movement
      }
    };

    const addNeighborCell = () => {
      if (hoveredNeighborRef.current !== null) {
        // Get the IJK coordinates of the hovered neighbor
        const neighborIJK = neighborIJKsRef.current[hoveredNeighborRef.current];
        console.log(`🟢 Adding cell at IJK: i=${neighborIJK.i}, j=${neighborIJK.j}, k=${neighborIJK.k}`);
        
        // Mark that we're editing to prevent camera auto-centering
        isEditingRef.current = true;
        
        // Add new cell to cells array
        const newCells = [...cells, neighborIJK];
        
        // Update parent component with new cells (triggers undo system)
        onCellsChange(newCells);
        
        // Clear hover state since neighbor is now a cell
        hoveredNeighborRef.current = null;
        setHoveredNeighbor(null);
      }
    };

    const onMouseDown = (event: MouseEvent) => {
      if (hoveredNeighborRef.current !== null) {
        event.preventDefault();
        event.stopPropagation();
        
        // Lock hover selection during mouse down
        isMouseDownRef.current = true;
        
        // Start long press timer (500ms)
        isLongPressRef.current = false;
        longPressTimeoutRef.current = window.setTimeout(() => {
          isLongPressRef.current = true;
          addNeighborCell();
        }, 500);
      }
    };

    const onMouseUp = (event: MouseEvent) => {
      // Unlock hover selection
      isMouseDownRef.current = false;
      
      if (hoveredNeighborRef.current !== null) {
        event.preventDefault();
        event.stopPropagation();
        
        // Clear long press timer
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = null;
        }
        
        // If it wasn't a long press, don't do anything (wait for double-click)
        if (!isLongPressRef.current) {
          // This was a regular click, not a long press
          // Double-click detection will be handled in onClick
        }
      }
    };

    const onMouseClick = (event: MouseEvent) => {
      // Only process clicks when there's a hovered neighbor (solid green neighbor)
      if (hoveredNeighborRef.current !== null && !isLongPressRef.current) {
        // We're clicking on a neighbor - prevent OrbitControls from handling this
        event.preventDefault();
        event.stopPropagation();

        const currentTime = Date.now();
        const timeDiff = currentTime - lastClickTimeRef.current;
        
        // Double-click detection (within 300ms)
        if (timeDiff < 300) {
          // This is a double-click
          addNeighborCell();
        } else {
          // This is the first click, wait for potential second click
          lastClickTimeRef.current = currentTime;
        }
      }
      // If not hovering over a neighbor, let OrbitControls handle the click normally
    };

    // Add event listeners with capture: true to get first chance at events
    renderer.domElement.addEventListener('mousemove', onMouseMove, { capture: true });
    renderer.domElement.addEventListener('mousedown', onMouseDown, { capture: true });
    renderer.domElement.addEventListener('mouseup', onMouseUp, { capture: true });
    renderer.domElement.addEventListener('click', onMouseClick, { capture: true });

    // Cleanup function
    return () => {
      renderer.domElement.removeEventListener('mousemove', onMouseMove, { capture: true });
      renderer.domElement.removeEventListener('mousedown', onMouseDown, { capture: true });
      renderer.domElement.removeEventListener('mouseup', onMouseUp, { capture: true });
      renderer.domElement.removeEventListener('click', onMouseClick, { capture: true });
      // Clear any pending timeouts
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
      
      // Restore any hovered neighbor when leaving add mode
      const neighborSpheres = neighborMeshRef.current as any as THREE.Mesh[];
      if (hoveredNeighborRef.current !== null && neighborSpheres && Array.isArray(neighborSpheres) && neighborSpheres[hoveredNeighborRef.current]) {
        (neighborSpheres[hoveredNeighborRef.current].material as THREE.MeshStandardMaterial).opacity = 0;
        hoveredNeighborRef.current = null;
        setHoveredNeighbor(null);
      }
    };
  }, [editMode, mode, cells]);

  return <div ref={mountRef} style={{ 
    width: "100%", 
    height: "100%", 
    position: "relative",
    overflow: "hidden"
  }} />;
}

// —— utils ——
function mat4ToThree(M: number[][]): THREE.Matrix4 { 
  return new THREE.Matrix4().set(
    M[0][0], M[0][1], M[0][2], M[0][3],
    M[1][0], M[1][1], M[1][2], M[1][3],
    M[2][0], M[2][1], M[2][2], M[2][3],
    M[3][0], M[3][1], M[3][2], M[3][3]
  );
}

function estimateSphereRadiusFromView(view: ViewTransforms): number {
  // sample ijk (0,0,0) and (1,0,0) through M_world, distance/2
  const toV3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(mat4ToThree(view.M_world));
  const p0 = toV3(0, 0, 0), p1 = toV3(1, 0, 0);
  const distance = p0.distanceTo(p1);
  const radius = distance / 2;
  return radius;
}
