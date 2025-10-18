import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { IJK } from "../types/shape";
import type { ViewTransforms } from "../services/ViewTransforms";
import type { VisibilitySettings } from "../types/lattice";

interface SceneCanvasProps {
  cells: IJK[];
  view: ViewTransforms | null;
  editMode: boolean;
  mode: "add" | "remove";
  onCellsChange: (cells: IJK[]) => void;
  onSave?: () => void;

  // NEW: Manual Puzzle features
  visibility?: VisibilitySettings;
  onHoverCell?: (ijk: IJK | null) => void;
  onClickCell?: (ijk: IJK) => void;
  anchor?: IJK | null;
  previewOffsets?: IJK[] | null;
  placedPieces?: Array<{
    uid: string;
    pieceId: string;
    orientationId: string;
    anchorSphereIndex: 0 | 1 | 2 | 3;
    cells: IJK[];
    placedAt: number;
  }>;
  selectedUid?: string | null;
  selectedPieceUid?: string | null;
  onSelectPiece?: (uid: string | null) => void;
  containerOpacity?: number;
  containerColor?: string;
  containerRoughness?: number;
  puzzleMode?: 'oneOfEach' | 'unlimited' | 'single';
  // Manual Puzzle: click/tap actions
  onCycleOrientation?: () => void;
  onPlacePiece?: () => void;
  onDeleteSelectedPiece?: () => void;
  // Drawing mode
  drawingCells?: IJK[];
  onDrawCell?: (ijk: IJK) => void;
  // Hide placed pieces
  hidePlacedPieces?: boolean;
  // NEW: Unified interaction callback
  onInteraction?: (
    target: 'ghost' | 'cell' | 'piece' | 'background',
    type: 'single' | 'double' | 'long',
    data?: any
  ) => void;
};

export default function SceneCanvas({ 
  cells, 
  view, 
  editMode, 
  mode, 
  onCellsChange, 
  onSave,
  visibility,
  onHoverCell,
  onClickCell,
  anchor,
  previewOffsets,
  placedPieces = [],
  selectedPieceUid = null,
  onSelectPiece,
  containerOpacity = 1.0,
  containerColor = '#2b6cff',
  containerRoughness = 0.19,
  puzzleMode = 'unlimited',
  onCycleOrientation,
  onPlacePiece,
  onDeleteSelectedPiece,
  drawingCells = [],
  onDrawCell,
  hidePlacedPieces = false,
  onInteraction
}: SceneCanvasProps) {
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
  const previewMeshRef = useRef<THREE.InstancedMesh>();
  const placedMeshesRef = useRef<Map<string, THREE.InstancedMesh>>(new Map());
  const drawingMeshRef = useRef<THREE.InstancedMesh>();
  const drawingBondsRef = useRef<THREE.Group>();
  const placedBondsRef = useRef<Map<string, THREE.Group>>(new Map());

  // Hover state for remove mode
  const [hoveredSphere, setHoveredSphere] = useState<number | null>(null);
  const hoveredSphereRef = useRef<number | null>(null);
  
  // Hover state for add mode
  const [hoveredNeighbor, setHoveredNeighbor] = useState<number | null>(null);
  const hoveredNeighborRef = useRef<number | null>(null);
  
  // Ref to always have latest cells value (prevents stale closure in event handlers)
  const cellsRef = useRef<IJK[]>(cells);
  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);
  
  // Double-click and long press state for add mode
  const longPressTimeoutRef = useRef<number | null>(null);
  const isLongPressRef = useRef(false);
  const lastClickTimeRef = useRef<number>(0);
  const isMouseDownRef = useRef(false);

  // Material settings (final values)
  const brightness = 2.7;
  const metalness = 0;

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

        console.log(`💾 Saved shape with ${cells.length} cells as ${filename}`);
      } else {
        // Fallback for browsers without File System Access API
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
    
    // Expose camera reset flag for new file loads
    (window as any).resetCameraFlag = () => {
      hasInitializedCameraRef.current = false;
      console.log('🔄 SceneCanvas: Camera initialization flag reset for new file');
    };
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    console.log('🎬 SceneCanvas MOUNTING - Initializing Three.js');

    // Basic Three.js setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false; // Shadows disabled
    // renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    mountRef.current.appendChild(renderer.domElement);

    // Lighting setup with base intensities
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(10, 10, 5);
    directionalLight1.castShadow = false; // Shadows disabled
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
      console.log('🧹 SceneCanvas UNMOUNTING - Full cleanup');
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(raf);
      
      // Remove ALL event listeners from renderer.domElement to prevent cross-page contamination
      // This ensures event handlers from this instance don't fire when navigating to other pages
      const domElement = renderer.domElement;
      if (domElement && mountRef.current && domElement.parentNode) {
        mountRef.current.removeChild(domElement);
      }
      
      // Dispose of Three.js resources
      renderer.dispose();
      controls.dispose();
      
      console.log('✅ SceneCanvas cleanup complete');
    };
  }, []);

  // Synchronous shape processing when data is available
  useEffect(() => {
    const scene = sceneRef.current, camera = cameraRef.current, renderer = rendererRef.current;
    if (!scene || !camera || !renderer) return;
    if (!cells.length || !view) return;

    // Build set of occupied cells from placed pieces AND drawing cells
    const occupiedSet = new Set<string>();
    for (const piece of placedPieces) {
      for (const cell of piece.cells) {
        occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
      }
    }
    // Add drawing cells to occupied set so they don't show as white
    for (const cell of drawingCells) {
      occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
    }

    // Filter out occupied and drawing cells from container
    const visibleCells = cells.filter(cell => {
      const key = `${cell.i},${cell.j},${cell.k}`;
      return !occupiedSet.has(key);
    });

    // Camera initialization is handled separately - never reset here
    // This effect should only update geometry, not camera position

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
    for (let i = 0; i < visibleCells.length; i++) {
      const p_ijk = new THREE.Vector3(visibleCells[i].i, visibleCells[i].j, visibleCells[i].k);
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
    
    // Step 3: Set camera to center and fill screen (only for initial file load, not during editing)
    if (!hasInitializedCameraRef.current && !isEditingRef.current) {
      const fov = camera.fov * (Math.PI / 180);
      const distance = (size / 2) / Math.tan(fov / 2) * 1.0; // Closer camera for larger initial view
      
      // Position camera at a good viewing angle: front-right-above
      // This gives a clear view of the shape from an isometric-like perspective
      camera.position.set(
        center.x + distance * 0.7,
        center.y + distance * 0.8,
        center.z + distance * 0.7
      );
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
      
      // Mark camera as initialized - never reposition automatically again
      hasInitializedCameraRef.current = true;
      console.log('📷 SceneCanvas: Camera initialized for new file');
    } else if (isEditingRef.current) {
      // Reset editing flag after handling the edit
      isEditingRef.current = false;
      console.log('✏️ SceneCanvas: Editing operation handled, camera unchanged');
    }

    // Step 5: Create and show mesh (only for visible/unoccupied cells)
    const geom = new THREE.SphereGeometry(radius, 32, 24);
    const mat = new THREE.MeshStandardMaterial({ 
      color: 0xffffff, // Use white base color so instance colors show correctly
      metalness: metalness,
      roughness: containerRoughness,
      transparent: containerOpacity < 1.0,
      opacity: containerOpacity
    });
    const mesh = new THREE.InstancedMesh(geom, mat, visibleCells.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Set up instance colors for hover effects
    const colors = new Float32Array(visibleCells.length * 3);
    const color = new THREE.Color(containerColor);
    for (let i = 0; i < visibleCells.length; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

    // Position spheres
    for (let i = 0; i < visibleCells.length; i++) {
      const p = spherePositions[i];
      const m = new THREE.Matrix4();
      m.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Add new mesh to scene
    scene.add(mesh);
    meshRef.current = mesh;
  }, [cells, view, placedPieces, drawingCells, containerOpacity, containerColor, containerRoughness]);

  // DO NOT reset camera on cells.length change - camera should only initialize once per file load
  // Camera initialization is now handled only in the main geometry useEffect below
  // This prevents camera repositioning during editing operations
  
  // Reset fit flag and camera init when cells change significantly
  // This allows proper camera repositioning when loading a new shape
  useEffect(() => {
    // Only reset camera when clearing all cells (file close/reset)
    // Don't reset during edit operations (adding/removing cells)
    if (cells.length === 0) {
      didFitRef.current = false;
      hasInitializedCameraRef.current = false;
      console.log('📷 SceneCanvas: Camera reset (all cells cleared)');
    }
    // Note: We do NOT reset camera when cells.length changes from editing
    // The isEditingRef flag already prevents repositioning during edits
  }, [cells.length]);
  // Preview ghost rendering for Manual Puzzle mode ONLY
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !view) return;
    
    // ONLY for Manual Puzzle mode - check for puzzleMode prop
    if (!puzzleMode) return;

    // Clean up previous preview mesh
    if (previewMeshRef.current) {
      scene.remove(previewMeshRef.current);
      previewMeshRef.current.geometry.dispose();
      (previewMeshRef.current.material as THREE.Material).dispose();
      previewMeshRef.current = undefined;
    }

    // Only render preview if we have offsets
    if (!previewOffsets || previewOffsets.length === 0) {
      return; // Silent skip - no preview needed
    }

    // previewOffsets are now ABSOLUTE IJK positions (not offsets)
    // They come from FitPlacement.cells which are already translated
    const previewCells = previewOffsets;
    // Transform to world space
    const M = mat4ToThree(view.M_world);
    const radius = estimateSphereRadiusFromView(view);

    // Create preview mesh (semi-transparent ghost) - high quality
    const geom = new THREE.SphereGeometry(radius, 64, 64);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x00ff00, // Green ghost
      transparent: true,
      opacity: 0.4,
      metalness: 0.40,  // Match placed pieces
      roughness: 0.10,  // Match placed pieces
    });

    const mesh = new THREE.InstancedMesh(geom, mat, previewCells.length);

    // Position preview spheres
    for (let i = 0; i < previewCells.length; i++) {
      const cell = previewCells[i];
      const p_ijk = new THREE.Vector3(cell.i, cell.j, cell.k);
      const p = p_ijk.applyMatrix4(M);
      const m = new THREE.Matrix4();
      m.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;

    scene.add(mesh);
    previewMeshRef.current = mesh;
    console.log('👻 Ghost preview rendered:', previewCells.length, 'cells');
  }, [onClickCell, previewOffsets, view]);

  // Render drawing cells (yellow) - Manual Puzzle drawing mode
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !view) return;
    
    // Clean up previous drawing mesh and bonds
    if (drawingMeshRef.current) {
      scene.remove(drawingMeshRef.current);
      drawingMeshRef.current.geometry.dispose();
      (drawingMeshRef.current.material as THREE.Material).dispose();
      drawingMeshRef.current = undefined;
    }
    if (drawingBondsRef.current) {
      scene.remove(drawingBondsRef.current);
      drawingBondsRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      drawingBondsRef.current = undefined;
    }
    
    // Only render if we have drawing cells
    if (!drawingCells || drawingCells.length === 0) return;
    
    const M = mat4ToThree(view.M_world);
    const radius = estimateSphereRadiusFromView(view);
    const geom = new THREE.SphereGeometry(radius, 32, 32);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffdd00, // Yellow
      metalness: 0.3,
      roughness: 0.4,
      transparent: true,
      opacity: 0.9
    });
    
    const mesh = new THREE.InstancedMesh(geom, mat, drawingCells.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Convert to world positions for bonds
    const spherePositions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();
    drawingCells.forEach((cell, idx) => {
      const pos = new THREE.Vector3(cell.i, cell.j, cell.k).applyMatrix4(M);
      spherePositions.push(pos);
      dummy.position.copy(pos);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    
    scene.add(mesh);
    drawingMeshRef.current = mesh;
    
    // Create bonds between drawing cells
    const bondGroup = new THREE.Group();
    const BOND_RADIUS_FACTOR = 0.35;
    const bondThreshold = radius * 2 * 1.1; // 1.1 × diameter
    const cylinderGeo = new THREE.CylinderGeometry(BOND_RADIUS_FACTOR * radius, BOND_RADIUS_FACTOR * radius, 1, 48);
    
    for (let a = 0; a < spherePositions.length; a++) {
      for (let b = a + 1; b < spherePositions.length; b++) {
        const pa = spherePositions[a];
        const pb = spherePositions[b];
        const distance = pa.distanceTo(pb);
        
        if (distance < bondThreshold) {
          // Create bond cylinder
          const bondMesh = new THREE.Mesh(cylinderGeo, mat);
          
          // Position at midpoint
          const midpoint = new THREE.Vector3().addVectors(pa, pb).multiplyScalar(0.5);
          bondMesh.position.copy(midpoint);
          
          // Orient cylinder from +Y direction to bond direction
          const direction = new THREE.Vector3().subVectors(pb, pa).normalize();
          const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
          bondMesh.setRotationFromQuaternion(quaternion);
          
          // Scale cylinder to match distance
          bondMesh.scale.y = distance;
          bondMesh.castShadow = true;
          bondMesh.receiveShadow = true;
          
          bondGroup.add(bondMesh);
        }
      }
    }
    
    scene.add(bondGroup);
    drawingBondsRef.current = bondGroup;
    
    console.log('🎨 Drawing cells rendered:', drawingCells.length, 'cells with', bondGroup.children.length, 'bonds');
  }, [drawingCells, view]);

  // Render placed pieces with colors (Manual Puzzle mode ONLY)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !view) return;
    
    // ONLY for Manual Puzzle mode - Shape Editor never provides onSelectPiece
    if (!onSelectPiece) return;
    
    console.log('🎨 Placed pieces rendering effect:', { 
      count: placedPieces.length, 
      uids: placedPieces.map(p => p.uid),
      hidePlacedPieces 
    });
    
    // Toggle visibility of placed pieces (keep them in memory, just hide/show)
    for (const [, mesh] of placedMeshesRef.current.entries()) {
      mesh.visible = !hidePlacedPieces;
    }
    for (const [, bondGroup] of placedBondsRef.current.entries()) {
      bondGroup.visible = !hidePlacedPieces;
    }
    
    // If hiding, skip the rest of the rendering logic
    if (hidePlacedPieces) {
      console.log('🙈 Placed pieces hidden');
      return;
    }

    const M = mat4ToThree(view.M_world);
    const radius = estimateSphereRadiusFromView(view);

    // Clean up removed pieces (spheres and bonds)
    const currentUids = new Set(placedPieces.map(p => p.uid));
    for (const [uid, mesh] of placedMeshesRef.current.entries()) {
      if (!currentUids.has(uid)) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        placedMeshesRef.current.delete(uid);
      }
    }
    for (const [uid, bondGroup] of placedBondsRef.current.entries()) {
      if (!currentUids.has(uid)) {
        scene.remove(bondGroup);
        bondGroup.traverse(obj => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            (obj.material as THREE.Material).dispose();
          }
        });
        placedBondsRef.current.delete(uid);
      }
    }

    // Add/update placed pieces
    const BOND_RADIUS_FACTOR = 0.35;
    const bondThreshold = radius * 2 * 1.1; // 1.1 × diameter

    for (const piece of placedPieces) {
      const isSelected = piece.uid === selectedPieceUid;
      
      // Clean up existing if selection state changed
      if (placedMeshesRef.current.has(piece.uid)) {
        const existingMesh = placedMeshesRef.current.get(piece.uid)!;
        const currentEmissive = (existingMesh.material as THREE.MeshStandardMaterial).emissive.getHex();
        const shouldBeEmissive = isSelected ? 0xffffff : 0x000000;
        
        if (currentEmissive !== shouldBeEmissive) {
          // Selection changed - need to recreate mesh and bonds
          scene.remove(existingMesh);
          existingMesh.geometry.dispose();
          (existingMesh.material as THREE.Material).dispose();
          placedMeshesRef.current.delete(piece.uid);
          
          // Also remove old bonds
          const existingBonds = placedBondsRef.current.get(piece.uid);
          if (existingBonds) {
            scene.remove(existingBonds);
            existingBonds.traverse(obj => {
              if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                (obj.material as THREE.Material).dispose();
              }
            });
            placedBondsRef.current.delete(piece.uid);
          }
        } else {
          continue; // Already rendered with correct state
        }
      }

      // High-quality sphere geometry (Solution Viewer parity)
      const geom = new THREE.SphereGeometry(radius, 64, 64);
      // Color strategy: oneOfEach uses pieceId (only 1 per piece), unlimited & single use uid (distinct per instance)
      const colorKey = puzzleMode === 'oneOfEach' ? piece.pieceId : piece.uid;
      const color = getPieceColor(colorKey);
      // Material settings from Solution Viewer (exact parity)
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.40,  // Optimized metalness
        roughness: 0.10,  // Optimized roughness (high reflectiveness)
        transparent: false,
        opacity: 1.0,
        envMapIntensity: 1.5,  // Enhanced environment reflections
        emissive: isSelected ? 0xffffff : 0x000000,
        emissiveIntensity: isSelected ? 0.3 : 0,
      });

      const mesh = new THREE.InstancedMesh(geom, mat, piece.cells.length);

      // Convert cells to world positions
      const spherePositions: THREE.Vector3[] = [];
      for (let i = 0; i < piece.cells.length; i++) {
        const cell = piece.cells[i];
        const p_ijk = new THREE.Vector3(cell.i, cell.j, cell.k);
        const p = p_ijk.applyMatrix4(M);
        spherePositions.push(p);

        const m = new THREE.Matrix4();
        m.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;

      scene.add(mesh);
      placedMeshesRef.current.set(piece.uid, mesh);

      // Create bonds between touching spheres
      const bondGroup = new THREE.Group();
      const cylinderGeo = new THREE.CylinderGeometry(BOND_RADIUS_FACTOR * radius, BOND_RADIUS_FACTOR * radius, 1, 48);

      for (let a = 0; a < spherePositions.length; a++) {
        for (let b = a + 1; b < spherePositions.length; b++) {
          const pa = spherePositions[a];
          const pb = spherePositions[b];
          const distance = pa.distanceTo(pb);

          if (distance < bondThreshold) {
            // Create bond cylinder
            const bondMesh = new THREE.Mesh(cylinderGeo, mat);

            // Position at midpoint
            const midpoint = new THREE.Vector3().addVectors(pa, pb).multiplyScalar(0.5);
            bondMesh.position.copy(midpoint);

            // Orient cylinder from +Y direction to bond direction
            const direction = new THREE.Vector3().subVectors(pb, pa).normalize();
            const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
            bondMesh.setRotationFromQuaternion(quaternion);

            // Scale cylinder to match distance
            bondMesh.scale.y = distance;
            bondMesh.castShadow = true;
            bondMesh.receiveShadow = true;

            bondGroup.add(bondMesh);
          }
        }
      }

      scene.add(bondGroup);
      placedBondsRef.current.set(piece.uid, bondGroup);
    }

    console.log('🎨 Rendered', placedPieces.length, 'placed pieces with bonds');
  }, [onSelectPiece, placedPieces, view, selectedPieceUid, puzzleMode, hidePlacedPieces]);

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
            roughness: containerRoughness,
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
    const raycaster = raycasterRef.current;
    const mouse = mouseRef.current;

    if (!renderer || !camera || !raycaster || !mouse) return;
    if (!editMode || mode !== "remove") return;
    
    console.log('🛠️ Remove mode event listeners ATTACHED');

    // Touch interaction state
    let longPressTimer: number | null = null;
    let touchStartSphereIndex: number | null = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let isTouchDevice = false; // Track if user is using touch
    const SWIPE_THRESHOLD = 10; // Pixels - if touch moves more than this, it's a swipe not a tap

    // Helper: Update hover state for desktop mouse
    const updateHoverState = (clientX: number, clientY: number) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersections = raycaster.intersectObject(mesh);

      if (intersections.length > 0) {
        const sphereIndex = intersections[0].instanceId;

        if (sphereIndex !== undefined && sphereIndex !== hoveredSphere) {
          // Restore previous
          if (hoveredSphere !== null) {
            mesh.setColorAt(hoveredSphere, new THREE.Color(containerColor));
          }

          // Set new to red
          mesh.setColorAt(sphereIndex, new THREE.Color(0xff0000));
          mesh.instanceColor!.needsUpdate = true;

          hoveredSphereRef.current = sphereIndex;
          setHoveredSphere(sphereIndex);
        }
      } else {
        // No intersection - clear hover
        if (hoveredSphere !== null) {
          mesh.setColorAt(hoveredSphere, new THREE.Color(containerColor));
          mesh.instanceColor!.needsUpdate = true;
          hoveredSphereRef.current = null;
          setHoveredSphere(null);
        }
      }
    };

    // Helper: Delete cell at index
    const deleteCell = (cellIndex: number) => {
      const currentCells = cellsRef.current;
      const cellToRemove = currentCells[cellIndex];
      console.log(`🗑️ Removing cell: i=${cellToRemove.i}, j=${cellToRemove.j}, k=${cellToRemove.k}`);
      
      isEditingRef.current = true;
      const newCells = currentCells.filter((_, index) => index !== cellIndex);
      onCellsChange(newCells);
      
      // Clear selection
      hoveredSphereRef.current = null;
      setHoveredSphere(null);
    };

    // Desktop: Mouse hover + click
    const onMouseMove = (event: MouseEvent) => {
      updateHoverState(event.clientX, event.clientY);
    };

    const onMouseClick = (event: MouseEvent) => {
      if (mode !== "remove" || !editMode) return;
      
      // Skip if this is a touch device (touch events will handle it)
      if (isTouchDevice) {
        console.log('🖱️ Ignoring mouse click on touch device');
        return;
      }
      
      const currentHoveredSphere = hoveredSphereRef.current;
      if (currentHoveredSphere !== null) {
        event.preventDefault();
        event.stopPropagation();
        deleteCell(currentHoveredSphere);
      }
    };

    // Mobile: Tap to select (red), tap again to delete, OR long press to delete
    const onTouchStart = (event: TouchEvent) => {
      isTouchDevice = true; // Mark as touch device
      
      if (event.touches.length !== 1) return;
      
      const mesh = meshRef.current;
      if (!mesh) return;

      const touch = event.touches[0];
      
      // Record start position to detect swipes
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersections = raycaster.intersectObject(mesh);

      if (intersections.length > 0) {
        const sphereIndex = intersections[0].instanceId;
        if (sphereIndex === undefined) return;

        touchStartSphereIndex = sphereIndex;

        // Only start long press timer if cell is ALREADY selected (red)
        // This prevents accidental deletion during orbit swipes
        const currentHoveredSphere = hoveredSphereRef.current;
        if (currentHoveredSphere === sphereIndex) {
          // Start long press timer (600ms) - only on already-selected cells
          longPressTimer = window.setTimeout(() => {
            console.log('📱 Long press on selected cell - deleting');
            deleteCell(sphereIndex);
            longPressTimer = null;
          }, 600);
        }
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (longPressTimer === null) return;
      
      // If touch moves, cancel long press timer (it's a swipe for orbit)
      const touch = event.touches[0];
      if (touch) {
        const deltaX = Math.abs(touch.clientX - touchStartX);
        const deltaY = Math.abs(touch.clientY - touchStartY);
        
        if (deltaX > SWIPE_THRESHOLD || deltaY > SWIPE_THRESHOLD) {
          console.log('📱 Touch moved - canceling long press timer');
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      // Cancel long press timer
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

      if (touchStartSphereIndex === null) return;

      // Check if this was a swipe (for orbit controls) vs a tap
      const touch = event.changedTouches[0];
      if (touch) {
        const deltaX = Math.abs(touch.clientX - touchStartX);
        const deltaY = Math.abs(touch.clientY - touchStartY);
        
        // If touch moved more than threshold, it's a swipe - ignore it
        if (deltaX > SWIPE_THRESHOLD || deltaY > SWIPE_THRESHOLD) {
          console.log('📱 Swipe detected - ignoring (deltaX:', deltaX, 'deltaY:', deltaY, ')');
          touchStartSphereIndex = null;
          return;
        }
      }

      const mesh = meshRef.current;
      if (!mesh) return;

      const currentHoveredSphere = hoveredSphereRef.current;

      // First tap: Select cell (turn red)
      if (currentHoveredSphere === null) {
        console.log('📱 First tap - selecting cell');
        mesh.setColorAt(touchStartSphereIndex, new THREE.Color(0xff0000));
        mesh.instanceColor!.needsUpdate = true;
        hoveredSphereRef.current = touchStartSphereIndex;
        setHoveredSphere(touchStartSphereIndex);
      }
      // Second tap on same cell: Delete
      else if (currentHoveredSphere === touchStartSphereIndex) {
        console.log('📱 Second tap - deleting cell');
        event.preventDefault();
        deleteCell(currentHoveredSphere);
      }
      // Tap on different cell: Switch selection
      else {
        console.log('📱 Switching selection');
        mesh.setColorAt(currentHoveredSphere, new THREE.Color(containerColor));
        mesh.setColorAt(touchStartSphereIndex, new THREE.Color(0xff0000));
        mesh.instanceColor!.needsUpdate = true;
        hoveredSphereRef.current = touchStartSphereIndex;
        setHoveredSphere(touchStartSphereIndex);
      }

      touchStartSphereIndex = null;
    };

    const onTouchCancel = () => {
      // Cancel long press if touch is interrupted
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      touchStartSphereIndex = null;
    };

    // Add event listeners
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('click', onMouseClick);
    renderer.domElement.addEventListener('touchstart', onTouchStart);
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: true });
    renderer.domElement.addEventListener('touchend', onTouchEnd);
    renderer.domElement.addEventListener('touchcancel', onTouchCancel);

    // Cleanup
    return () => {
      console.log('🛠️ Remove mode event listeners REMOVED');
      
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
      }

      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('click', onMouseClick);
      renderer.domElement.removeEventListener('touchstart', onTouchStart);
      renderer.domElement.removeEventListener('touchmove', onTouchMove);
      renderer.domElement.removeEventListener('touchend', onTouchEnd);
      renderer.domElement.removeEventListener('touchcancel', onTouchCancel);
      
      // Restore any hovered sphere when leaving remove mode
      if (hoveredSphere !== null && meshRef.current) {
        meshRef.current.setColorAt(hoveredSphere, new THREE.Color(containerColor));
        if (meshRef.current.instanceColor) {
          meshRef.current.instanceColor.needsUpdate = true;
        }
        setHoveredSphere(null);
      }
    };
  }, [editMode, mode, containerColor]);

  // Mouse hover detection for add mode
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const raycaster = raycasterRef.current;
    const mouse = mouseRef.current;

    if (!renderer || !camera || !raycaster || !mouse) return;
    if (!editMode || mode !== "add") return;
    
    console.log('🟢 Add mode event listeners ATTACHED');

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
        
        // Check if this cell already exists (safety check)
        const cellKey = `${neighborIJK.i},${neighborIJK.j},${neighborIJK.k}`;
        const currentCells = cellsRef.current; // Use ref to get latest cells
        const existingKey = currentCells.some(c => `${c.i},${c.j},${c.k}` === cellKey);
        
        if (existingKey) {
          console.warn('⚠️ Cell already exists, skipping add:', cellKey);
          hoveredNeighborRef.current = null;
          setHoveredNeighbor(null);
          return;
        }
        
        console.log(`🟢 Adding cell at IJK: i=${neighborIJK.i}, j=${neighborIJK.j}, k=${neighborIJK.k}`);
        console.log(`📊 Current cells count: ${currentCells.length}`);
        
        // Mark that we're editing to prevent camera auto-centering
        isEditingRef.current = true;
        
        // Create new cells array with the new cell added
        const newCells = [...currentCells, neighborIJK];
        console.log(`📊 New cells count: ${newCells.length}`);
        
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
      // Safety check: only process in add mode
      if (mode !== "add" || !editMode) {
        console.warn('⚠️ Add mode click handler fired but not in add mode!');
        return;
      }
      
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
      console.log('🟢 Add mode event listeners REMOVED');
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
  }, [editMode, mode]);

  // Manual Puzzle mode: Click detection for setting anchor OR selecting placed pieces
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const raycaster = raycasterRef.current;
    const mouse = mouseRef.current;
    const mesh = meshRef.current;

    if (!renderer || !camera || !raycaster || !mouse) return;
    // Only in Manual Puzzle mode (not edit mode)
    if (editMode || (!onClickCell && !onSelectPiece)) return;

    const onClick = (event: MouseEvent) => {
      // Convert mouse coordinates to normalized device coordinates
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Update raycaster
      raycaster.setFromCamera(mouse, camera);

      // Priority 0: Check ghost preview first (handled by separate useEffect)
      // Skip if clicking on ghost - that handler will manage it
      const ghostMesh = previewMeshRef.current;
      if (ghostMesh) {
        const ghostIntersections = raycaster.intersectObject(ghostMesh);
        if (ghostIntersections.length > 0) {
          // Ghost click is handled by the ghost interaction handler
          return;
        }
      }

      // Priority 1: Check for intersections with placed pieces (for selection)
      // Skip if placed pieces are hidden
      let clickedPlacedPiece = false;
      if (!hidePlacedPieces) {
        for (const [uid, placedMesh] of placedMeshesRef.current.entries()) {
          const intersections = raycaster.intersectObject(placedMesh);
          if (intersections.length > 0) {
            if (onSelectPiece) {
              onSelectPiece(uid);
              console.log('Selected placed piece:', uid);
            }
            clickedPlacedPiece = true;
            break;
          }
        }
      }
      // Priority 2: If no placed piece clicked, check container cells (for anchor)
      // NOTE: Skip anchor setting if onDrawCell exists - double-click handler manages that
      if (!clickedPlacedPiece && mesh && onClickCell && !onDrawCell) {
        const intersections = raycaster.intersectObject(mesh);
        if (intersections.length > 0) {
          // Deselect any selected piece when clicking container
          if (onSelectPiece && selectedPieceUid) {
            onSelectPiece(null);
          }
          
          // Get the instance index of the clicked sphere
          const instanceId = intersections[0].instanceId;
          if (instanceId !== undefined && instanceId < cells.length) {
            // Build occupiedSet to find the actual unoccupied cell
            const occupiedSet = new Set<string>();
            for (const piece of placedPieces) {
              for (const cell of piece.cells) {
                occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
              }
            }
            
            // Filter to visible cells
            const visibleCells = cells.filter(cell => {
              const key = `${cell.i},${cell.j},${cell.k}`;
              return !occupiedSet.has(key);
            });
            
            if (instanceId < visibleCells.length) {
              const clickedCell = visibleCells[instanceId];
              onClickCell(clickedCell);
              console.log('Clicked container cell:', clickedCell);
            }
          }
        }
      }
    };
    renderer.domElement.addEventListener('click', onClick);
    return () => {
      renderer.domElement.removeEventListener('click', onClick);
    };
  }, [editMode, onClickCell, onSelectPiece, cells, placedPieces, selectedPieceUid, hidePlacedPieces, onDrawCell]);

  // NEW: Complete interaction detection (timing + raycasting)
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const raycaster = raycasterRef.current;
    const mouse = mouseRef.current;
    
    if (!renderer || !camera || !raycaster || !mouse) return;
    if (onInteraction) return; // New system active - skip old handler
    if (!onCycleOrientation && !onPlacePiece && !onDrawCell) return;
    if (editMode) return;

    // OLD handler state (kept for compilation, unused when onInteraction is provided)
    const lastClickTimeRef = { current: 0 };
    const singleClickTimerRef = { current: null as number | null };
    const touchStartPosRef = { current: { x: 0, y: 0 } };
    const touchMovedRef = { current: false };
    const longPressTimerRef = { current: null as number | null };
    const isLongPressRef = { current: false };
    const touchStartedOnGhostRef = { current: false };
    const lastTouchTimeRef = { current: 0 };
    const lastPlacementTimeRef = { current: 0 };

    const DOUBLE_CLICK_DELAY = 300;
    const SINGLE_CLICK_DELAY = 320;
    const LONG_PRESS_DELAY = 600;
    const MOVE_THRESHOLD = 15;
    const PLACEMENT_COOLDOWN = 500;

    // Desktop: Simple click handler (no long press needed)
    const onMouseClick = (e: MouseEvent) => {
      // Suppress click events that come from touch (mobile fires both touch AND click)
      const timeSinceTouch = Date.now() - lastTouchTimeRef.current;
      if (timeSinceTouch < 500) {
        // This click came from a touch event - ignore it, touch handlers will manage
        return;
      }

      // Ignore if clicking on UI elements
      const target = e.target as HTMLElement;
      if (target.closest('button, input, select')) return;
      
      // Must be on canvas
      if (e.target !== renderer.domElement) return;

      // Check if clicking on ghost preview (priority over container)
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Check ghost preview first (highest priority)
      const ghostMesh = previewMeshRef.current;
      if (ghostMesh) {
        const ghostIntersections = raycaster.intersectObject(ghostMesh);
        if (ghostIntersections.length > 0) {
          // Clicking on ghost - handle orientation cycling and placement
          e.preventDefault();
          e.stopPropagation();

          const now = Date.now();
          const timeSinceLastClick = now - lastClickTimeRef.current;

          // Cancel any pending single click
          if (singleClickTimerRef.current) {
            clearTimeout(singleClickTimerRef.current);
            singleClickTimerRef.current = null;
          }

          // Double-click detection (within window of previous click)
          if (timeSinceLastClick > 0 && timeSinceLastClick < DOUBLE_CLICK_DELAY) {
            // This is a double-click on ghost - place piece
            if (onPlacePiece) {
              // Check cooldown to prevent double-placement
              const timeSinceLastPlacement = now - lastPlacementTimeRef.current;
              if (timeSinceLastPlacement < PLACEMENT_COOLDOWN) {
                console.log('🖱️ Double-click ignored - too soon after last placement', { timeSinceLastPlacement });
                lastClickTimeRef.current = 0;
                return;
              }
              
              lastPlacementTimeRef.current = now;
              onPlacePiece();
              console.log('🖱️ Double-click on ghost - placing piece', { timeSinceLastClick });
              lastClickTimeRef.current = 0; // Reset to prevent triple-click
              return;
            }
          }

          // This is potentially a single click on ghost - wait to see if double-click comes
          lastClickTimeRef.current = now;
          
          if (onCycleOrientation) {
            singleClickTimerRef.current = window.setTimeout(() => {
              // Only cycle if no second click came
              if (lastClickTimeRef.current === now) {
                onCycleOrientation();
                console.log('🖱️ Single-click on ghost - cycling orientation');
              }
              singleClickTimerRef.current = null;
            }, SINGLE_CLICK_DELAY);
          }
          return; // Don't check container cells
        }
      }

      // Not clicking ghost - check if clicking empty cell
      if (onDrawCell) {
        const mesh = meshRef.current;
        if (mesh) {
          const intersections = raycaster.intersectObject(mesh);
          if (intersections.length > 0) {
            const intersection = intersections[0];
            const instanceId = intersection.instanceId;
            
            if (instanceId !== undefined && instanceId < cells.length) {
              // Build occupiedSet to find the actual unoccupied cell
              const occupiedSet = new Set<string>();
              for (const piece of placedPieces) {
                for (const cell of piece.cells) {
                  occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
                }
              }
              // IMPORTANT: Also exclude drawing cells so instanceId matches current mesh
              for (const cell of drawingCells) {
                occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
              }
              
              // Filter to visible cells (matches how mesh was built)
              const visibleCells = cells.filter(cell => {
                const key = `${cell.i},${cell.j},${cell.k}`;
                return !occupiedSet.has(key);
              });
              
              if (instanceId < visibleCells.length) {
                const clickedCell = visibleCells[instanceId];
                
                console.log('🖱️ Cell clicked:', {
                  instanceId,
                  totalVisibleCells: visibleCells.length,
                  clickedCellIJK: `(${clickedCell.i}, ${clickedCell.j}, ${clickedCell.k})`,
                  worldPosition: intersection.point,
                  drawingCellsCount: drawingCells.length
                });
                
                const now = Date.now();
                const timeSinceLastClick = now - lastClickTimeRef.current;
                
                // Cancel any pending single click
                if (singleClickTimerRef.current) {
                  clearTimeout(singleClickTimerRef.current);
                  singleClickTimerRef.current = null;
                }
                
                // Double-click detection
                if (timeSinceLastClick > 0 && timeSinceLastClick < DOUBLE_CLICK_DELAY) {
                  // Double-click on empty cell - draw!
                  console.log('🖱️ ✅ Double-click detected - calling onDrawCell');
                  onDrawCell(clickedCell);
                  lastClickTimeRef.current = 0;
                  return;
                }
                
                // This is potentially a single click - wait to see if double-click comes
                lastClickTimeRef.current = now;
                
                if (onClickCell) {
                  singleClickTimerRef.current = window.setTimeout(() => {
                    // Only call onClickCell if no second click came
                    if (lastClickTimeRef.current === now) {
                      onClickCell(clickedCell);
                      console.log('🖱️ Single-click on empty cell - setting anchor');
                    }
                    singleClickTimerRef.current = null;
                  }, SINGLE_CLICK_DELAY);
                }
              }
            }
          }
        }
      }
    };

    // Touch handlers
    const onTouchStart = (e: TouchEvent) => {
      // Ignore if touching UI elements
      const target = e.target as HTMLElement;
      if (target.closest('button, input, select')) return;
      
      // Must be on canvas
      if (e.target !== renderer.domElement) return;
      
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      touchMovedRef.current = false;

      // Check if tapping on ghost preview
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Check ghost preview first
      const ghostMesh = previewMeshRef.current;
      const isTappingGhost = !!(ghostMesh && raycaster.intersectObject(ghostMesh).length > 0);
      touchStartedOnGhostRef.current = isTappingGhost;

      if (isTappingGhost) {
        // Tapping on ghost - handle actions
        e.preventDefault(); // Prevent click event from firing
        
        const now = Date.now();
        const timeSinceLastTap = now - lastClickTimeRef.current;

        // Cancel any pending single tap
        if (singleClickTimerRef.current) {
          clearTimeout(singleClickTimerRef.current);
          singleClickTimerRef.current = null;
        }

        // Double-tap detection
        if (timeSinceLastTap > 0 && timeSinceLastTap < DOUBLE_CLICK_DELAY) {
          if (onPlacePiece) {
            // Check cooldown to prevent double-placement
            const timeSinceLastPlacement = now - lastPlacementTimeRef.current;
            if (timeSinceLastPlacement < PLACEMENT_COOLDOWN) {
              console.log('📱 Double-tap ignored - too soon after last placement', { timeSinceLastPlacement });
              lastClickTimeRef.current = 0;
              return;
            }
            
            e.stopPropagation();
            // Cancel any pending long press timer from first tap
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
            lastPlacementTimeRef.current = now;
            onPlacePiece();
            console.log('📱 Double-tap on ghost - placing piece', { timeSinceLastTap });
            lastClickTimeRef.current = 0; // Reset to prevent triple-tap
            return;
          }
        }

        lastClickTimeRef.current = now;

        // Start long press timer
        if (onPlacePiece) {
          isLongPressRef.current = false;
          longPressTimerRef.current = window.setTimeout(() => {
            if (!touchMovedRef.current) {
              // Check cooldown before placing
              const timeSinceLastPlacement = Date.now() - lastPlacementTimeRef.current;
              if (timeSinceLastPlacement < PLACEMENT_COOLDOWN) {
                console.log('📱 Long press ignored - too soon after last placement', { timeSinceLastPlacement });
                return;
              }
              
              isLongPressRef.current = true;
              lastPlacementTimeRef.current = Date.now();
              onPlacePiece();
              console.log('📱 Long press on ghost - placing piece');
            }
          }, LONG_PRESS_DELAY);
        }
      }
      
      // Priority: Check if tapping a placed piece (especially selected piece)
      // This should take priority over drawing mode
      let tappingPlacedPiece = false;
      for (const [uid, placedMesh] of placedMeshesRef.current.entries()) {
        const intersections = raycaster.intersectObject(placedMesh);
        if (intersections.length > 0) {
          tappingPlacedPiece = true;
          
          // If this is the selected piece and we have delete handler, start long-press for delete
          if (uid === selectedPieceUid && onDeleteSelectedPiece) {
            isLongPressRef.current = false;
            longPressTimerRef.current = window.setTimeout(() => {
              if (!touchMovedRef.current) {
                isLongPressRef.current = true;
                onDeleteSelectedPiece();
                console.log('📱 Long press on selected piece - deleting');
              }
            }, LONG_PRESS_DELAY);
          }
          break; // Stop checking other pieces
        }
      }
      
      // Not tapping ghost or placed piece - check if tapping empty cell for drawing
      // DON'T preventDefault here - let normal click events work for mobile placement
      // Long-press will trigger drawing if held long enough
      if (!tappingPlacedPiece && onDrawCell) {
        const mesh = meshRef.current;
        if (mesh) {
          const intersections = raycaster.intersectObject(mesh);
          if (intersections.length > 0) {
            const intersection = intersections[0];
            const instanceId = intersection.instanceId;
            
            if (instanceId !== undefined && instanceId < cells.length) {
              // Build occupiedSet to get the correct cell from visibleCells
              const occupiedSet = new Set<string>();
              for (const piece of placedPieces) {
                for (const cell of piece.cells) {
                  occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
                }
              }
              // IMPORTANT: Also exclude drawing cells so instanceId matches current mesh
              for (const cell of drawingCells) {
                occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
              }
              
              // Filter to visible cells (matches how mesh was built)
              const visibleCells = cells.filter(cell => {
                const key = `${cell.i},${cell.j},${cell.k}`;
                return !occupiedSet.has(key);
              });
              
              if (instanceId < visibleCells.length) {
                const clickedCell = visibleCells[instanceId];
                
                // Start long-press timer for drawing (but don't block normal clicks)
                isLongPressRef.current = false;
                longPressTimerRef.current = window.setTimeout(() => {
                  if (!touchMovedRef.current) {
                    isLongPressRef.current = true;
                    onDrawCell(clickedCell);
                    console.log('📱 Long press on empty cell - drawing');
                  }
                }, LONG_PRESS_DELAY);
                // Don't return - let normal touch logic continue
              }
            }
          }
        }
      }
      
      // If not tapping ghost, let normal anchor-setting logic handle it
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);

      // Mark as moved if beyond threshold
      if (deltaX > MOVE_THRESHOLD || deltaY > MOVE_THRESHOLD) {
        touchMovedRef.current = true;
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      // Mark that a touch just happened (suppress subsequent click events)
      lastTouchTimeRef.current = Date.now();

      // Clear long press timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      // Ignore if touching UI elements
      const target = e.target as HTMLElement;
      if (target.closest('button, input, select')) return;

      // If this was a long press or movement, don't process as tap
      if (isLongPressRef.current || touchMovedRef.current) {
        if (isLongPressRef.current) {
          // Prevent click event after long press (for drawing or delete)
          e.preventDefault();
          console.log('📱 Long press completed - skipping tap detection');
        }
        isLongPressRef.current = false;
        touchStartedOnGhostRef.current = false; // Reset
        return;
      }

      // Single tap = cycle orientation (after delay) - ONLY if started on ghost
      if (onCycleOrientation && touchStartedOnGhostRef.current) {
        e.preventDefault(); // Prevent click event from firing
        const now = lastClickTimeRef.current;
        setTimeout(() => {
          // Only cycle if no second tap came
          if (lastClickTimeRef.current === now) {
            onCycleOrientation();
            console.log('📱 Single tap on ghost - cycling orientation');
          }
        }, SINGLE_CLICK_DELAY);
      } else if (!touchStartedOnGhostRef.current && e.target === renderer.domElement) {
        // Check what was tapped
        const rect = renderer.domElement.getBoundingClientRect();
        const lastTouch = e.changedTouches[0];
        mouse.x = ((lastTouch.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((lastTouch.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        
        // Priority 1: Check if tapping a placed piece (select it)
        let tappedPlacedPiece = false;
        if (onSelectPiece && !hidePlacedPieces) {
          for (const [uid, placedMesh] of placedMeshesRef.current.entries()) {
            const intersections = raycaster.intersectObject(placedMesh);
            if (intersections.length > 0) {
              onSelectPiece(uid);
              console.log('📱 Single tap on placed piece - selecting:', uid);
              tappedPlacedPiece = true;
              break;
            }
          }
        }
        
        // Priority 2: If not tapping placed piece, check empty cell for anchor
        if (!tappedPlacedPiece && onClickCell) {
          const mesh = meshRef.current;
          if (mesh) {
            const intersections = raycaster.intersectObject(mesh);
            if (intersections.length > 0) {
              const intersection = intersections[0];
              const instanceId = intersection.instanceId;
              
              if (instanceId !== undefined && instanceId < cells.length) {
                // Build occupiedSet to find the actual unoccupied cell
                const occupiedSet = new Set<string>();
                for (const piece of placedPieces) {
                  for (const cell of piece.cells) {
                    occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
                  }
                }
                for (const cell of drawingCells) {
                  occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
                }
                
                const visibleCells = cells.filter(cell => {
                  const key = `${cell.i},${cell.j},${cell.k}`;
                  return !occupiedSet.has(key);
                });
                
                if (instanceId < visibleCells.length) {
                  const clickedCell = visibleCells[instanceId];
                  onClickCell(clickedCell);
                  console.log('📱 Single tap on empty cell - setting anchor');
                }
              }
            }
          }
        }
      }
      
      touchStartedOnGhostRef.current = false; // Reset for next touch
    };

    // Add listeners with capture phase (Shape Editor pattern)
    renderer.domElement.addEventListener('click', onMouseClick, { capture: true });
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
    renderer.domElement.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });

    return () => {
      renderer.domElement.removeEventListener('click', onMouseClick, true);
      renderer.domElement.removeEventListener('touchstart', onTouchStart, true);
      renderer.domElement.removeEventListener('touchmove', onTouchMove, true);
      renderer.domElement.removeEventListener('touchend', onTouchEnd, true);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      if (singleClickTimerRef.current) {
        clearTimeout(singleClickTimerRef.current);
      }
    };
  }, [editMode, onCycleOrientation, onPlacePiece, onDrawCell, onClickCell, onDeleteSelectedPiece, selectedPieceUid, cells, placedPieces, drawingCells]);

  // NEW: Clean interaction system - complete gesture detection + raycasting
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const raycaster = raycasterRef.current;
    const mouse = mouseRef.current;
    
    if (!renderer || !camera || !raycaster || !mouse) return;
    if (!onInteraction) return;
    if (editMode) return;

    // Gesture detection state
    const pendingTapTimerRef = { current: null as NodeJS.Timeout | null };
    const longPressTimerRef = { current: null as NodeJS.Timeout | null };
    const lastTapResultRef = { current: null as { target: 'ghost' | 'cell' | 'piece' | 'background' | null, data?: any } | null };
    const touchMovedRef = { current: false };
    const touchStartPosRef = { current: { x: 0, y: 0 } };
    const longPressFiredRef = { current: false };
    
    const MOVE_THRESHOLD = 15;
    const DOUBLE_TAP_WINDOW = 350; // Increased for better double-click detection
    const LONG_PRESS_DELAY = 500;

    const clearTimers = () => {
      if (pendingTapTimerRef.current) {
        clearTimeout(pendingTapTimerRef.current);
        pendingTapTimerRef.current = null;
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    const performRaycast = (clientX: number, clientY: number): { target: 'ghost' | 'cell' | 'piece' | 'background' | null, data?: any } => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Priority 1: Ghost
      const ghostMesh = previewMeshRef.current;
      if (ghostMesh) {
        const intersections = raycaster.intersectObject(ghostMesh);
        if (intersections.length > 0) {
          return { target: 'ghost' };
        }
      }

      // Priority 2: Placed pieces
      if (!hidePlacedPieces) {
        for (const [uid, placedMesh] of placedMeshesRef.current.entries()) {
          const intersections = raycaster.intersectObject(placedMesh);
          if (intersections.length > 0) {
            return { target: 'piece', data: uid };
          }
        }
      }

      // Priority 3: Cells
      const mesh = meshRef.current;
      if (mesh) {
        const intersections = raycaster.intersectObject(mesh);
        if (intersections.length > 0) {
          const intersection = intersections[0];
          const instanceId = intersection.instanceId;
          
          if (instanceId !== undefined && instanceId < cells.length) {
            const occupiedSet = new Set<string>();
            for (const piece of placedPieces) {
              for (const cell of piece.cells) {
                occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
              }
            }
            for (const cell of drawingCells) {
              occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
            }
            
            const visibleCells = cells.filter(cell => {
              const key = `${cell.i},${cell.j},${cell.k}`;
              return !occupiedSet.has(key);
            });
            
            if (instanceId < visibleCells.length) {
              const clickedCell = visibleCells[instanceId];
              return { target: 'cell', data: clickedCell };
            }
          }
        }
      }

      // Priority 4: Background
      return { target: 'background' };
    };

    const isMobile = 'ontouchstart' in window;

    if (isMobile) {
      // MOBILE: Touch-based gesture detection
      const onTouchStart = (e: TouchEvent) => {
        if (e.target !== renderer.domElement) return;
        if (e.touches.length !== 1) return;
        
        const touch = e.touches[0];
        touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
        touchMovedRef.current = false;
        longPressFiredRef.current = false; // Reset for new gesture

        // Start long press timer
        longPressTimerRef.current = setTimeout(() => {
          if (!touchMovedRef.current) {
            // LONG PRESS detected
            longPressFiredRef.current = true; // Mark that long press fired
            clearTimers();
            const result = performRaycast(touch.clientX, touch.clientY);
            if (result.target) {
              onInteraction(result.target, 'long', result.data);
            }
            lastTapResultRef.current = null;
          }
        }, LONG_PRESS_DELAY);
      };

      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartPosRef.current.x;
        const dy = touch.clientY - touchStartPosRef.current.y;
        if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
          touchMovedRef.current = true;
          clearTimers();
        }
      };

      const onTouchEnd = (e: TouchEvent) => {
        if (e.target !== renderer.domElement) return;
        
        // Cancel long press if not fired yet
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }

        if (touchMovedRef.current) {
          console.log('📱 touchEnd: Was a drag, skipping');
          return;
        }
        if (longPressFiredRef.current) {
          console.log('📱 touchEnd: Long press already handled, skipping tap detection');
          return;
        }
        
        const touch = e.changedTouches[0];
        const result = performRaycast(touch.clientX, touch.clientY);
        
        // Check if there's a pending tap (for double-tap detection)
        if (pendingTapTimerRef.current && lastTapResultRef.current) {
          // Second tap - DOUBLE TAP detected
          clearTimeout(pendingTapTimerRef.current);
          pendingTapTimerRef.current = null;
          
          if (result.target) {
            onInteraction(result.target, 'double', result.data);
          }
          lastTapResultRef.current = null;
        } else {
          // First tap - wait to see if double-tap comes
          lastTapResultRef.current = result;
          pendingTapTimerRef.current = setTimeout(() => {
            // No second tap came - it's a SINGLE TAP
            if (lastTapResultRef.current && lastTapResultRef.current.target) {
              onInteraction(lastTapResultRef.current.target, 'single', lastTapResultRef.current.data);
            }
            lastTapResultRef.current = null;
            pendingTapTimerRef.current = null;
          }, DOUBLE_TAP_WINDOW);
        }
      };

      renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
      renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: true });
      renderer.domElement.addEventListener('touchend', onTouchEnd, { passive: true });

      return () => {
        clearTimers();
        renderer.domElement.removeEventListener('touchstart', onTouchStart);
        renderer.domElement.removeEventListener('touchmove', onTouchMove);
        renderer.domElement.removeEventListener('touchend', onTouchEnd);
      };
    } else {
      // DESKTOP: Click-based gesture detection
      const onClick = (e: MouseEvent) => {
        if (e.target !== renderer.domElement) return;
        
        const result = performRaycast(e.clientX, e.clientY);
        console.log('🖱️ Click detected:', result.target, 'pending:', !!pendingTapTimerRef.current);
        
        // Check if there's a pending click (for double-click detection)
        if (pendingTapTimerRef.current && lastTapResultRef.current) {
          // Second click - DOUBLE CLICK detected
          console.log('🖱️ ✅ DOUBLE CLICK detected on', result.target);
          clearTimeout(pendingTapTimerRef.current);
          pendingTapTimerRef.current = null;
          
          if (result.target) {
            onInteraction(result.target, 'double', result.data);
          }
          lastTapResultRef.current = null;
        } else {
          // First click - wait to see if double-click comes
          console.log('🖱️ First click, waiting for potential double-click...');
          lastTapResultRef.current = result;
          pendingTapTimerRef.current = setTimeout(() => {
            // No second click came - it's a SINGLE CLICK
            console.log('🖱️ Single click confirmed on', lastTapResultRef.current?.target);
            if (lastTapResultRef.current && lastTapResultRef.current.target) {
              onInteraction(lastTapResultRef.current.target, 'single', lastTapResultRef.current.data);
            }
            lastTapResultRef.current = null;
            pendingTapTimerRef.current = null;
          }, DOUBLE_TAP_WINDOW);
        }
      };

      renderer.domElement.addEventListener('click', onClick);
      return () => {
        clearTimers();
        renderer.domElement.removeEventListener('click', onClick);
      };
    }
  }, [editMode, onInteraction, cells, placedPieces, drawingCells, hidePlacedPieces]);

  // Manual Puzzle mode: Long-press on placed piece to delete (mobile only)
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const raycaster = raycasterRef.current;
    const mouse = mouseRef.current;
    
    if (!renderer || !camera || !raycaster || !mouse) return;
    if (editMode || !onDeleteSelectedPiece || !selectedPieceUid) return;

    const longPressTimerRef = { current: null as number | null };
    const touchStartPosRef = { current: { x: 0, y: 0 } };
    const touchMovedRef = { current: false };
    const LONG_PRESS_DELAY = 600; // ms
    const MOVE_THRESHOLD = 15; // px

    const onTouchStart = (e: TouchEvent) => {
      if (e.target !== renderer.domElement) return;
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      touchMovedRef.current = false;

      // Check if tapping on selected placed piece
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Check if tapping the selected placed piece
      const selectedMesh = placedMeshesRef.current.get(selectedPieceUid);
      if (selectedMesh) {
        const intersections = raycaster.intersectObject(selectedMesh);
        if (intersections.length > 0) {
          // Start long press timer for delete
          longPressTimerRef.current = window.setTimeout(() => {
            if (!touchMovedRef.current && onDeleteSelectedPiece) {
              e.preventDefault();
              e.stopPropagation();
              onDeleteSelectedPiece();
              console.log('📱 Long press on selected piece - deleting');
            }
          }, LONG_PRESS_DELAY);
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);

      if (deltaX > MOVE_THRESHOLD || deltaY > MOVE_THRESHOLD) {
        touchMovedRef.current = true;
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    };

    const onTouchEnd = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
    renderer.domElement.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });

    return () => {
      renderer.domElement.removeEventListener('touchstart', onTouchStart, true);
      renderer.domElement.removeEventListener('touchmove', onTouchMove, true);
      renderer.domElement.removeEventListener('touchend', onTouchEnd, true);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, [editMode, onDeleteSelectedPiece, selectedPieceUid]);

  return <div ref={mountRef} style={{ 
    width: "100%", 
    height: "100%", 
    position: "absolute",
    left: 0,
    overflow: "hidden"
  }} />;
}

// —— utils ——
/** Generate highly distinct colors for up to 25+ pieces using optimized HSL distribution (Solution Viewer parity) */
function getPieceColor(pieceId: string): number {
  let hash = 0;
  for (let i = 0; i < pieceId.length; i++) {
    hash = (hash * 31 + pieceId.charCodeAt(i)) >>> 0;
  }
  
  // Vibrant color palette (exact copy from Solution Viewer)
  const vibrantColors = [
    0xff0000, // Bright Red
    0x00ff00, // Bright Green  
    0x0080ff, // Bright Blue
    0xffff00, // Bright Yellow
    0xff8000, // Orange
    0x8000ff, // Purple
    0xff0080, // Hot Pink
    0x00ffff, // Cyan
    0x80ff00, // Lime Green
    0xff4080, // Rose
    0x4080ff, // Sky Blue
    0xffc000, // Gold
    0xc000ff, // Violet
    0x00ff80, // Spring Green
    0xff8040, // Coral
    0x8040ff, // Blue Violet
    0x40ff80, // Sea Green
    0xff4000, // Red Orange
    0x0040ff, // Royal Blue
    0x80ff40, // Yellow Green
    0xff0040, // Crimson
    0x4000ff, // Indigo
    0x00c0ff, // Deep Sky Blue
    0xc0ff00, // Chartreuse
    0xff00c0  // Magenta
  ];
  
  // Select color based on hash
  const colorIndex = hash % vibrantColors.length;
  return vibrantColors[colorIndex];
}

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
