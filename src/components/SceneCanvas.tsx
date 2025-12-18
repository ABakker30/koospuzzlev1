import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import type { IJK } from "../types/shape";
import type { ViewTransforms } from "../services/ViewTransforms";
import type { VisibilitySettings } from "../types/lattice";
import type { StudioSettings } from "../types/studio";
import { HDRLoader } from "../services/HDRLoader";
import { getPieceColor, mat4ToThree, estimateSphereRadiusFromView } from "./scene/sceneMath";
import { buildBonds } from "./scene/buildBonds";
import { renderOverlayLayer } from "./scene/renderOverlayLayer";
import { initScene } from "./scene/initScene";
import { renderContainerMesh } from "./scene/renderContainerMesh";

type SceneCanvasLayout = 'fullscreen' | 'embedded';

interface SceneCanvasProps {
  cells: IJK[];
  view: ViewTransforms | null;
  editMode: boolean;
  mode: "add" | "remove";
  onCellsChange: (cells: IJK[]) => void;
  onSave?: () => void;

  // Layout mode
  layout?: SceneCanvasLayout;

  // Environment settings (optional)
  settings?: StudioSettings;

  // ...existing props...
  showBonds?: boolean;  // NEW: if false, bonds/sticks are hidden

  // NEW: Manual Puzzle features
  visibility?: VisibilitySettings;
  onHoverCell?: (ijk: IJK | null) => void;
  onClickCell?: (ijk: IJK) => void;
  anchor?: IJK | null;
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
  computerDrawingCells?: IJK[];  // 
  onDrawCell?: (ijk: IJK) => void;
  // Hint preview (golden spheres)
  hintCells?: IJK[] | null;
  // Hide placed pieces
  hidePlacedPieces?: boolean;
  // Temporarily visible pieces (remain visible even when hidePlacedPieces is true)
  temporarilyVisiblePieces?: Set<string>;
  // Explosion factor (0 = assembled, 1 = exploded)
  explosionFactor?: number;
  // Movie playback: turntable rotation (Y-axis rotation in radians)
  turntableRotation?: number;
  // Always show all container cells (don't filter by occupied) - prevents race conditions in auto-solver
  alwaysShowContainer?: boolean;
  // NEW: Unified interaction callback
  onInteraction?: (
    target: 'ghost' | 'cell' | 'piece' | 'background',
    type: 'single' | 'double' | 'long',
    data?: any
  ) => void;
  // Movie Mode: Scene ready callback for effects system
  onSceneReady?: (objects: {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: any;
    spheresGroup: THREE.Group;
    centroidWorld: THREE.Vector3;
  }) => void;
};

const SceneCanvas = ({ 
  cells, 
  showBonds = true,     // default: show bonds unless explicitly disabled
  view, 
  editMode, 
  mode, 
  settings,
  layout = 'fullscreen',
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
  containerColor = '#ffffff',
  containerRoughness = 0.3,
  puzzleMode = 'unlimited',
  onCycleOrientation,
  onPlacePiece,
  onDeleteSelectedPiece,
  drawingCells = [],
  computerDrawingCells = [],
  onDrawCell,
  hintCells = null,
  hidePlacedPieces = false,
  temporarilyVisiblePieces = new Set(),
  explosionFactor = 0,
  turntableRotation = 0,
  alwaysShowContainer = false,
  onInteraction,
  onSceneReady
}: SceneCanvasProps) => {
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
  const placedMeshesRef = useRef<Map<string, THREE.InstancedMesh>>(new Map());
  const placedBondsRef = useRef<Map<string, THREE.Group>>(new Map());
  const placedPiecesGroupRef = useRef<THREE.Group | null>(null); // Group for turntable rotation
  const visibleCellsRef = useRef<IJK[]>([]); // Cache for accurate raycasting

  // Light refs for dynamic updates
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const directionalLightsRef = useRef<THREE.DirectionalLight[]>([]);
  const hdrLoaderRef = useRef<HDRLoader | null>(null);
  const drawingBondsRef = useRef<THREE.Group>();
  const drawingMeshRef = useRef<THREE.InstancedMesh>();

  // Hover state for remove mode
  const [hoveredSphere, setHoveredSphere] = useState<number | null>(null);
  
  // HDR initialization state
  const [hdrInitialized, setHdrInitialized] = useState(false);
  const hoveredSphereRef = useRef<number | null>(null);
  
  // Canvas element state for gesture detector (React needs state to track it)
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  
  // DEBUG: Log when component mounts
  useEffect(() => {
    console.log(' SceneCanvas mounted - new gesture detector version');
  }, []);
  
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

  // Used by legacy touch/mouse handlers to suppress follow-on events after a gesture is handled.
  const gestureCompletedRef = useRef(false);

  // Material settings from props
  const brightness = Math.max(0.1, settings?.lights?.brightness ?? 2.7); // Minimum 0.1 to ensure visibility
  const piecesMetalness = settings?.material?.metalness ?? 0.40;
  const piecesRoughness = settings?.material?.roughness ?? 0.10;
  const piecesOpacity = settings?.material?.opacity ?? 1.0;
  
  // Empty cell (container) metalness from settings
  const containerMetalness = settings?.emptyCells?.linkToEnvironment 
    ? settings.material.metalness 
    : (settings?.emptyCells?.customMaterial?.metalness ?? 0);
  
  // Debug logging
  useEffect(() => {
    console.log('🎨 SceneCanvas material settings:', {
      brightness,
      metalness: piecesMetalness,
      roughness: piecesRoughness,
      hasSettings: !!settings
    });
  }, [brightness, piecesMetalness, piecesRoughness, settings]);
  
  // Update lighting dynamically when settings change (like StudioCanvas)
  useEffect(() => {
    const scene = sceneRef.current;
    const hdrLoader = hdrLoaderRef.current;
    const renderer = rendererRef.current;
    
    // Wait for everything to be initialized INCLUDING HDR loader
    if (!ambientLightRef.current || directionalLightsRef.current.length === 0 || !scene || !renderer || !hdrLoader) {
      console.log('⏳ Waiting for initialization before updating lights');
      return;
    }
    
    console.log('💡 Updating lights with brightness:', brightness, 'directional:', settings?.lights?.directional);
    
    // Update ambient light (reduced contribution when using settings)
    ambientLightRef.current.intensity = settings?.lights?.directional 
      ? 0.3 * brightness  // Less ambient when using custom directional settings
      : 0.6 * brightness; // More ambient for default lighting
    
    // Update directional lights
    // If settings.lights.directional exists, use those intensities directly
    // Otherwise fall back to baseIntensities * brightness
    if (settings?.lights?.directional && Array.isArray(settings.lights.directional)) {
      directionalLightsRef.current.forEach((light, i) => {
        light.intensity = settings.lights.directional[i] ?? 0;
      });
      console.log('✅ Applied directional light settings from movie:', settings.lights.directional);
    } else {
      const baseIntensities = [0.8, 0.4, 0.3, 0.3];
      directionalLightsRef.current.forEach((light, i) => {
        light.intensity = baseIntensities[i] * brightness;
      });
    }
    
    // Update background color if specified
    if (settings?.lights?.backgroundColor) {
      scene.background = new THREE.Color(settings.lights.backgroundColor);
    }
    
    // HDR environment map - real-time checkbox updates
    const hdrEnabled = settings?.lights?.hdr?.enabled;
    const hdrEnvId = settings?.lights?.hdr?.envId;
    const hdrIntensity = settings?.lights?.hdr?.intensity ?? 1;
    
    console.log('🔍 HDR check (real-time):', {
      enabled: hdrEnabled,
      envId: hdrEnvId,
      intensity: hdrIntensity,
      hasHdrLoader: !!hdrLoader,
      hasPMREM: hdrLoader ? !!(hdrLoader as any).pmremGenerator : false
    });
    
    if (hdrEnabled && hdrEnvId && hdrLoader) {
      // Verify PMREM generator is initialized
      if (!(hdrLoader as any).pmremGenerator) {
        console.warn('⚠️ PMREM generator not initialized yet, will retry on next render');
        // Don't return - just skip HDR load this time, don't disable it entirely
      } else {
      
      console.log('🌅 Loading HDR environment:', hdrEnvId);
      hdrLoader
        .loadEnvironment(hdrEnvId)
        .then((envMap) => {
          if (!envMap) return;
          scene.environment = envMap;
          
          // Update all placed piece materials with HDR
          placedMeshesRef.current.forEach((mesh) => {
            if (mesh.material instanceof THREE.MeshStandardMaterial) {
              mesh.material.envMap = envMap;
              mesh.material.envMapIntensity = hdrIntensity;
              mesh.material.needsUpdate = true;
            }
          });
          
          // Update container mesh if it exists
          if (meshRef.current?.material instanceof THREE.MeshStandardMaterial) {
            meshRef.current.material.envMap = envMap;
            meshRef.current.material.envMapIntensity = hdrIntensity;
            meshRef.current.material.needsUpdate = true;
          }
          
          console.log('✅ HDR environment applied');
        })
        .catch((e) => console.error('❌ HDR load error:', e));
      }
    } else {
      // Disable HDR - clear environment and all material envMaps
      scene.environment = null;
      
      // Clear envMap from all placed piece materials
      placedMeshesRef.current.forEach((mesh) => {
        if (mesh.material instanceof THREE.MeshStandardMaterial) {
          mesh.material.envMap = null;
          mesh.material.needsUpdate = true;
        }
      });
      
      // Clear envMap from container mesh
      if (meshRef.current?.material instanceof THREE.MeshStandardMaterial) {
        meshRef.current.material.envMap = null;
        meshRef.current.material.needsUpdate = true;
      }
      
      console.log('🌑 HDR disabled - environment and material envMaps cleared');
    }
  }, [brightness, settings?.lights?.backgroundColor, settings?.lights?.directional, settings?.lights?.hdr?.enabled, settings?.lights?.hdr?.envId, settings?.lights?.hdr?.intensity, hdrInitialized]);

  // Update material properties on existing pieces when settings change
  useEffect(() => {
    if (placedMeshesRef.current.size === 0) return;
    
    console.log('🎨 Updating materials on existing pieces:', {
      metalness: piecesMetalness,
      roughness: piecesRoughness,
      opacity: piecesOpacity,
      numPieces: placedMeshesRef.current.size
    });
    
    placedMeshesRef.current.forEach((mesh) => {
      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.metalness = piecesMetalness;
        mesh.material.roughness = piecesRoughness;
        mesh.material.opacity = piecesOpacity;
        mesh.material.transparent = piecesOpacity < 1.0;  // Enable transparency if opacity < 1
        mesh.material.needsUpdate = true;
      }
    });
  }, [piecesMetalness, piecesRoughness, piecesOpacity]);

  // Update camera settings when they change
  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const renderer = rendererRef.current;
    
    if (!camera || !renderer) return;
    
    const isOrtho = settings?.camera?.projection === 'orthographic';
    const fovDeg = settings?.camera?.fovDeg ?? 50;
    const orthoZoom = settings?.camera?.orthoZoom ?? 1.0;
    
    console.log('📷 Camera settings check:', {
      projection: isOrtho ? 'orthographic' : 'perspective',
      isPerspective: camera.type === 'PerspectiveCamera',
      fov: fovDeg,
      zoom: orthoZoom
    });
    
    // For perspective camera - just update FOV
    if (!isOrtho && camera.type === 'PerspectiveCamera') {
      if (camera.fov !== fovDeg) {
        camera.fov = fovDeg;
        camera.updateProjectionMatrix();
        console.log('📷 Perspective FOV updated to:', fovDeg);
      }
    }
    
    // Note: Full orthographic camera switching would require recreating the camera
    // and updating all controls, which is complex and risky
    // For now, ortho checkbox is visible but doesn't switch camera types
    // This would need a major refactor to support properly
  }, [settings?.camera?.projection, settings?.camera?.fovDeg, settings?.camera?.orthoZoom]);

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
    
    // Expose camera initialized marker (to prevent auto-reset)
    (window as any).markCameraInitialized = () => {
      hasInitializedCameraRef.current = true;
      console.log('✅ SceneCanvas: Camera marked as initialized');
    };
    
    // Expose scene reference for debugging
    (window as any).sceneRef = {
      scene: sceneRef.current,
      camera: cameraRef.current,
      controls: controlsRef.current,
      renderer: rendererRef.current
    };
    
    // Expose camera position setter for movie playback
    (window as any).setCameraPosition = (position: { x: number; y: number; z: number }) => {
      if (cameraRef.current) {
        cameraRef.current.position.set(position.x, position.y, position.z);
        cameraRef.current.updateProjectionMatrix();
        if (controlsRef.current) {
          controlsRef.current.update();
        }
        console.log('📷 SceneCanvas: Camera position set to', position);
      }
    };
    
    // Expose controls getter for gallery movie playback
    (window as any).getOrbitControls = () => {
      return controlsRef.current;
    };
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    return initScene({
      mountEl: mountRef.current,
      brightness,
      onSceneReady,
      refs: {
        sceneRef,
        cameraRef,
        rendererRef,
        controlsRef,
        placedPiecesGroupRef,
        raycasterRef,
        mouseRef,
        ambientLightRef,
        directionalLightsRef,
        hdrLoaderRef,
      },
      setHdrInitialized,
      setCanvasElement,
    });
  }, []);

  // Synchronous shape processing when data is available
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const controls = controlsRef.current;

    if (!scene || !camera || !renderer) return;
    if (!cells.length || !view) return;

    renderContainerMesh({
      scene,
      camera,
      controls,
      meshRef,
      visibleCellsRef,
      hasInitializedCameraRef,
      isEditingRef,
      cells,
      view,
      placedPieces,
      drawingCells,
      previewOffsets,
      alwaysShowContainer,
      containerColor,
      containerOpacity,
      containerRoughness,
      containerMetalness,
      explosionFactor,
    });
  }, [
    cells,
    view,
    placedPieces,
    drawingCells,
    previewOffsets,
    containerOpacity,
    containerColor,
    containerRoughness,
    containerMetalness,
    explosionFactor,
    alwaysShowContainer,
  ]);

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
    }
    // Note: We do NOT reset camera when cells.length changes from editing
    // The isEditingRef flag already prevents repositioning during edits
  }, [cells.length]);

  // Render drawing cells (yellow) - Manual Puzzle drawing mode
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !view) return;
    
    const radius = estimateSphereRadiusFromView(view);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffdd00, // Yellow
      metalness: 0.3,
      roughness: 0.4,
      transparent: true,
      opacity: 0.9
    });
    
    renderOverlayLayer({
      scene,
      viewMWorld: view.M_world,
      cells: drawingCells,
      showBonds,
      material: mat,
      radius,
      meshRef: drawingMeshRef,
      bondsRef: drawingBondsRef,
      segments: { w: 32, h: 32 },
    });
  }, [drawingCells, view, showBonds]);

  // Render computer drawing cells as silver spheres
  const computerDrawingMeshRef = useRef<THREE.InstancedMesh | undefined>();
  const computerDrawingBondsRef = useRef<THREE.Group | undefined>();
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !view) return;

    const radius = estimateSphereRadiusFromView(view);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xc0c0c0, // Silver
      metalness: 0.6,
      roughness: 0.3,
      transparent: true,
      opacity: 0.9
    });
    
    renderOverlayLayer({
      scene,
      viewMWorld: view.M_world,
      cells: computerDrawingCells,
      showBonds,
      material: mat,
      radius,
      meshRef: computerDrawingMeshRef,
      bondsRef: computerDrawingBondsRef,
      segments: { w: 32, h: 32 },
    });
  }, [computerDrawingCells, view, showBonds]);

  // Render hint cells as golden spheres (0.5s preview before auto-place)
  const hintMeshRef = useRef<THREE.InstancedMesh | undefined>();
  const hintBondsRef = useRef<THREE.Group | undefined>();
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !view) return;

    const radius = estimateSphereRadiusFromView(view);
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffd700', // Gold
      emissive: '#ffd700',
      emissiveIntensity: 0.6,
      metalness: 0.8,
      roughness: 0.2,
      transparent: true,
      opacity: 0.95
    });

    console.log("HINT CELLS (IJK):", hintCells);

    renderOverlayLayer({
      scene,
      viewMWorld: view.M_world,
      cells: hintCells,
      showBonds,
      material: mat,
      radius,
      meshRef: hintMeshRef,
      bondsRef: hintBondsRef,
      segments: { w: 32, h: 32 },
      scale: 1.1, // Slightly larger for hint
      bondRadiusFactor: 0.35 * 1.1, // Slightly larger for hint
    });
  }, [hintCells, view, showBonds]);

  // Render placed pieces with colors (Manual Puzzle mode ONLY)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !view) return;
    
    // ONLY for Manual Puzzle mode - Shape Editor never provides onSelectPiece
    if (!onSelectPiece) return;
    
    // Toggle visibility of placed pieces (keep them in memory, just hide/show)
    // Pieces in temporarilyVisiblePieces remain visible even when hidePlacedPieces is true
    for (const [uid, mesh] of placedMeshesRef.current.entries()) {
      mesh.visible = !hidePlacedPieces || temporarilyVisiblePieces.has(uid);
    }
    for (const [uid, bondGroup] of placedBondsRef.current.entries()) {
      bondGroup.visible = !hidePlacedPieces || temporarilyVisiblePieces.has(uid);
    }
    
    // If hiding all pieces, skip the rest of the rendering logic
    // But if some are temporarily visible, we need to continue to render them
    if (hidePlacedPieces && temporarilyVisiblePieces.size === 0) {
      return;
    }

    const M = mat4ToThree(view.M_world);
    const radius = estimateSphereRadiusFromView(view);

    // Clean up removed pieces (spheres and bonds)
    const currentUids = new Set(placedPieces.map(p => p.uid));
    for (const [uid, mesh] of placedMeshesRef.current.entries()) {
      if (!currentUids.has(uid)) {
        const placedGroup = placedPiecesGroupRef.current;
        if (placedGroup) {
          placedGroup.remove(mesh);
        } else {
          scene.remove(mesh);
        }
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        placedMeshesRef.current.delete(uid);
      }
    }
    for (const [uid, bondGroup] of placedBondsRef.current.entries()) {
      if (!currentUids.has(uid)) {
        const placedGroup = placedPiecesGroupRef.current;
        if (placedGroup) {
          placedGroup.remove(bondGroup);
        } else {
          scene.remove(bondGroup);
        }
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

    for (const piece of placedPieces) {
      const isSelected = piece.uid === selectedPieceUid;
      
      // Clean up existing if selection state changed OR mode changed (affects color)
      if (placedMeshesRef.current.has(piece.uid)) {
        const existingMesh = placedMeshesRef.current.get(piece.uid)!;
        const currentEmissive = (existingMesh.material as THREE.MeshStandardMaterial).emissive.getHex();
        const shouldBeEmissive = isSelected ? 0xffffff : 0x000000;
        
        // Check if we need to recreate: selection changed OR mode changed (stored in userData)
        const needsRecreate = currentEmissive !== shouldBeEmissive || 
                              existingMesh.userData.puzzleMode !== puzzleMode;
        
        if (needsRecreate) {
          // Need to recreate mesh and bonds
          if (placedPiecesGroupRef.current) {
            placedPiecesGroupRef.current.remove(existingMesh);
          } else {
            scene.remove(existingMesh);
          }
          existingMesh.geometry.dispose();
          (existingMesh.material as THREE.Material).dispose();
          placedMeshesRef.current.delete(piece.uid);
          
          // Also remove old bonds
          const existingBonds = placedBondsRef.current.get(piece.uid);
          if (existingBonds) {
            if (placedPiecesGroupRef.current) {
              placedPiecesGroupRef.current.remove(existingBonds);
            } else {
              scene.remove(existingBonds);
            }
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
      // Color strategy: 
      // - oneOfEach: use pieceId (stable color per piece type)
      // - unlimited/single: use uid (unique color per instance)
      const colorKey = puzzleMode === 'oneOfEach' ? piece.pieceId : piece.uid;
      const color = getPieceColor(colorKey, settings?.sphereColorTheme);
      // Material settings from props (updates in real-time via separate effect)
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        metalness: piecesMetalness,  // Use current settings value
        roughness: piecesRoughness,  // Use current settings value
        transparent: piecesOpacity < 1.0,  // Enable transparency if opacity < 1
        opacity: piecesOpacity,  // Use current opacity value
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
      
      // Store puzzleMode in userData to detect mode changes
      mesh.userData.puzzleMode = puzzleMode;

      // Add to placed pieces group (for turntable rotation)
      if (placedPiecesGroupRef.current) {
        placedPiecesGroupRef.current.add(mesh);
      } else {
        scene.add(mesh); // Fallback if group doesn't exist
      }
      placedMeshesRef.current.set(piece.uid, mesh);

      // Create bonds between touching spheres (only if showBonds is true)
      if (showBonds) {
        const { bondGroup } = buildBonds({
          spherePositions,
          radius,
          material: mat,
          bondRadiusFactor: BOND_RADIUS_FACTOR,
          thresholdFactor: 1.1,
          radialSegments: 48
        });
        
        // Enable shadows on all bond meshes
        bondGroup.children.forEach(mesh => {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });

        // Add bonds to placed pieces group (for turntable rotation)
        if (placedPiecesGroupRef.current) {
          placedPiecesGroupRef.current.add(bondGroup);
        } else {
          scene.add(bondGroup); // Fallback if group doesn't exist
        }
        placedBondsRef.current.set(piece.uid, bondGroup);
      }
    }
  }, [onSelectPiece, placedPieces, view, selectedPieceUid, puzzleMode, hidePlacedPieces, temporarilyVisiblePieces, showBonds]);
  // NOTE: piecesMetalness/piecesRoughness NOT in deps - values used during creation, 
  // but changes handled by separate material update effect to avoid geometry recreation

  // Store stable explosion center based on ALL pieces in the solution
  const explosionCenterRef = useRef<{x: number, y: number, z: number} | null>(null);
  const explosionPieceCountRef = useRef<number>(0);
  
  // Apply explosion effect to placed pieces
  useEffect(() => {
    if (!view || placedPieces.length === 0) {
      // Reset when no pieces
      explosionCenterRef.current = null;
      explosionPieceCountRef.current = 0;
      return;
    }
    
    const clampedFactor = Math.max(0, Math.min(1, explosionFactor));
    
    // Compute center ONCE from all cells in all meshes (not just visible pieces)
    // This ensures the center doesn't shift when reveal slider changes
    const M = view.M_world;
    
    // Recalculate center if we have significantly more pieces than last time (e.g., solution completed)
    // This ensures center is based on the FULL solution, not just partial pieces during construction
    const shouldRecalculate = !explosionCenterRef.current || 
                               placedPieces.length > explosionPieceCountRef.current * 1.5;
    
    if (shouldRecalculate) {
      // Calculate center from ALL pieces that exist (iterate through meshes)
      let centerX = 0, centerY = 0, centerZ = 0;
      let totalCells = 0;
      
      for (const piece of placedPieces) {
        for (const cell of piece.cells) {
          const x = M[0][0] * cell.i + M[0][1] * cell.j + M[0][2] * cell.k + M[0][3];
          const y = M[1][0] * cell.i + M[1][1] * cell.j + M[1][2] * cell.k + M[1][3];
          const z = M[2][0] * cell.i + M[2][1] * cell.j + M[2][2] * cell.k + M[2][3];
          centerX += x;
          centerY += y;
          centerZ += z;
          totalCells++;
        }
      }
      
      if (totalCells === 0) return;
      
      centerX /= totalCells;
      centerY /= totalCells;
      centerZ /= totalCells;
      
      explosionCenterRef.current = { x: centerX, y: centerY, z: centerZ };
      explosionPieceCountRef.current = placedPieces.length;
    }
    
    // Safety check - should always have center at this point
    if (!explosionCenterRef.current) return;
    const { x: centerX, y: centerY, z: centerZ } = explosionCenterRef.current;
    
    // Apply explosion to each piece's mesh and bonds
    for (const piece of placedPieces) {
      const mesh = placedMeshesRef.current.get(piece.uid);
      const bonds = placedBondsRef.current.get(piece.uid);
      
      if (!mesh) continue;
      
      // Compute piece centroid
      let pieceCenterX = 0, pieceCenterY = 0, pieceCenterZ = 0;
      for (const cell of piece.cells) {
        const x = M[0][0] * cell.i + M[0][1] * cell.j + M[0][2] * cell.k + M[0][3];
        const y = M[1][0] * cell.i + M[1][1] * cell.j + M[1][2] * cell.k + M[1][3];
        const z = M[2][0] * cell.i + M[2][1] * cell.j + M[2][2] * cell.k + M[2][3];
        pieceCenterX += x;
        pieceCenterY += y;
        pieceCenterZ += z;
      }
      pieceCenterX /= piece.cells.length;
      pieceCenterY /= piece.cells.length;
      pieceCenterZ /= piece.cells.length;
      
      // Explosion vector from center to piece centroid
      const explosionX = pieceCenterX - centerX;
      const explosionY = pieceCenterY - centerY;
      const explosionZ = pieceCenterZ - centerZ;
      
      // Store original position if not already stored
      if (mesh.userData.originalPosition === undefined) {
        mesh.userData.originalPosition = mesh.position.clone();
      }
      
      // Apply explosion offset (1.5x multiplier for good separation)
      const originalPos = mesh.userData.originalPosition;
      mesh.position.set(
        originalPos.x + explosionX * clampedFactor * 1.5,
        originalPos.y + explosionY * clampedFactor * 1.5,
        originalPos.z + explosionZ * clampedFactor * 1.5
      );
      
      // Apply same offset to bonds
      if (bonds) {
        if (bonds.userData.originalPosition === undefined) {
          bonds.userData.originalPosition = bonds.position.clone();
        }
        const bondsOriginalPos = bonds.userData.originalPosition;
        bonds.position.set(
          bondsOriginalPos.x + explosionX * clampedFactor * 1.5,
          bondsOriginalPos.y + explosionY * clampedFactor * 1.5,
          bondsOriginalPos.z + explosionZ * clampedFactor * 1.5
        );
      }
    }
  }, [explosionFactor, placedPieces, view]);

  // Movie playback: Turntable rotation around Y-axis
  useEffect(() => {
    const placedGroup = placedPiecesGroupRef.current;
    if (!placedGroup) return;
    
    // Rotate the placed pieces group around Y-axis (XZ plane rotation)
    placedGroup.rotation.y = turntableRotation;
  }, [turntableRotation]);


  // Edit mode detection
  useEffect(() => {
    if (editMode) {
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
            metalness: 0,  // Neighbors are not metallic
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
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      // CRITICAL: Skip if another handler already completed a gesture
      if (gestureCompletedRef.current) {
        event.stopImmediatePropagation();
        event.preventDefault();
        return;
      }

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
          return;
        }
      }

      const mesh = meshRef.current;
      if (!mesh) return;

      const currentHoveredSphere = hoveredSphereRef.current;

      // First tap: Select cell (turn red)
      if (currentHoveredSphere === null) {
        mesh.setColorAt(touchStartSphereIndex, new THREE.Color(0xff0000));
        mesh.instanceColor!.needsUpdate = true;
        hoveredSphereRef.current = touchStartSphereIndex;
        setHoveredSphere(touchStartSphereIndex);
      }
      // Second tap on same cell: Delete
      else if (currentHoveredSphere === touchStartSphereIndex) {
        event.preventDefault();
        deleteCell(currentHoveredSphere);
      }
      // Tap on different cell: Switch selection
      else {
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
          hoveredNeighborRef.current = null;
          setHoveredNeighbor(null);
          return;
        }
        
        console.log(`Adding cell at IJK: i=${neighborIJK.i}, j=${neighborIJK.j}, k=${neighborIJK.k}`);
        
        // Mark that we're editing to prevent camera auto-centering
        isEditingRef.current = true;
        
        // Create new cells array with the new cell added
        const newCells = [...currentCells, neighborIJK];
        
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
    // CRITICAL: Skip if onInteraction exists - new architecture uses that instead
    if (editMode || (!onClickCell && !onSelectPiece) || onInteraction) return;

    const onClick = (event: MouseEvent) => {
      // Convert mouse coordinates to normalized device coordinates
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Update raycaster
      raycaster.setFromCamera(mouse, camera);

      // Priority 1: Check for intersections with placed pieces (for selection)
      // Skip if placed pieces are hidden
      let clickedPlacedPiece = false;
      if (!hidePlacedPieces) {
        for (const [uid, placedMesh] of placedMeshesRef.current.entries()) {
          const intersections = raycaster.intersectObject(placedMesh);
          if (intersections.length > 0) {
            if (onSelectPiece) {
              onSelectPiece(uid);
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
          if (instanceId !== undefined && instanceId < visibleCellsRef.current.length) {
            const clickedCell = visibleCellsRef.current[instanceId];
            onClickCell(clickedCell);
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
    // gestureCompletedRef is now at component level (line ~154) so all handlers can see it

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

      // Check if clicking empty cell (no ghost preview anymore)
      if (onDrawCell) {
        const mesh = meshRef.current;
        if (mesh) {
          const intersections = raycaster.intersectObject(mesh);
          if (intersections.length > 0) {
            const intersection = intersections[0];
            const instanceId = intersection.instanceId;
            
            if (instanceId !== undefined && instanceId < visibleCellsRef.current.length) {
              const clickedCell = visibleCellsRef.current[instanceId];
              
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
                  }
                  singleClickTimerRef.current = null;
                }, SINGLE_CLICK_DELAY);
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

      // Reset gesture state for new touch
      const touch = e.touches[0];
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      touchMovedRef.current = false;
      gestureCompletedRef.current = false; // Clean state for new gesture

      // Check if tapping on ghost preview
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // No ghost preview - proceed with touch handling
      touchStartedOnGhostRef.current = false;

      if (false) {
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
            gestureCompletedRef.current = true; // Mark gesture complete
            lastClickTimeRef.current = 0; // Reset to prevent triple-tap
            e.stopImmediatePropagation(); // CRITICAL: Stop other touch handlers from firing
            e.preventDefault();
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
                return;
              }
              
              isLongPressRef.current = true;
              lastPlacementTimeRef.current = Date.now();
              onPlacePiece();
              gestureCompletedRef.current = true; // Mark gesture complete to prevent touchend from triggering actions
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
                gestureCompletedRef.current = true; // Mark gesture complete to prevent touchend from triggering actions
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

      // CRITICAL: If a gesture (long-press/double-tap) already completed, don't trigger any more actions
      if (gestureCompletedRef.current) {
        console.log('📱 touchend skipped - gesture already completed');
        e.stopImmediatePropagation(); // Stop OTHER listeners from processing this event
        e.preventDefault();
        gestureCompletedRef.current = false; // Reset for next touch
        touchMovedRef.current = false;
        isLongPressRef.current = false;
        return; // Skip all touchend logic
      }

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
          // Ignore selection for 300ms after placement to prevent re-selecting the piece we just placed
          const timeSinceLastPlacement = Date.now() - lastPlacementTimeRef.current;
          if (timeSinceLastPlacement < 300) {
            console.log('📱 Ignoring piece selection - too soon after placement', { timeSinceLastPlacement });
          } else {
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
      
      // Reset flags for next touch
      touchStartedOnGhostRef.current = false;
      touchMovedRef.current = false;
      isLongPressRef.current = false;
      gestureCompletedRef.current = false; // Always reset, even for normal taps
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
  }, [editMode, onCycleOrientation, onPlacePiece, onDrawCell, onClickCell, onDeleteSelectedPiece, selectedPieceUid, cells, placedPieces, drawingCells, onInteraction]);

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
    const lastPointerPositionRef = { current: null as { clientX: number, clientY: number } | null };
    const touchMovedRef = { current: false };
    const touchStartPosRef = { current: { x: 0, y: 0 } };
    const longPressFiredRef = { current: false };
    
    // Drag detection state (to prevent interactions during camera orbit)
    const dragStartedRef = { current: false }; // True from pointerdown until pointerup
    const isDraggingRef = { current: false };  // True once movement exceeds threshold
    const suppressNextClickRef = { current: false }; // Suppress DOM click event after drag
    const dragStartPosRef = { current: null as { x: number, y: number } | null };
    const DRAG_THRESHOLD_SQ = 100; // ~10px threshold for drag detection
    
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

    // Helper: Get empty cell under cursor that is in front of hit piece
    // Only returns a cell if it's directly under cursor AND closer than the hit piece
    const getEmptyCellUnderCursor = (
      rayOrigin: THREE.Vector3,
      rayDirection: THREE.Vector3,
      maxDistance: number // Distance to front-most piece hit (or Infinity if no piece)
    ): IJK | null => {
      if (!view) return null;

      // Build set of occupied cells
      const occupiedSet = new Set<string>();
      for (const piece of placedPieces) {
        for (const cell of piece.cells) {
          occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
        }
      }

      let nearestCell: IJK | null = null;
      let nearestDistance = Infinity;

      // Get transform matrix and sphere radius
      const M = mat4ToThree(view.M_world);
      const sphereRadius = estimateSphereRadiusFromView(view);
      
      // Tighter tolerance - cell must be very close to ray center (directly under cursor)
      const perpendicularTolerance = 0.03; // Very small - effectively "under cursor"
      
      // Epsilon to ensure we only get cells in FRONT of piece
      const epsilon = 0.01;
      const frontLimit = maxDistance - epsilon;

      // Check all visible lattice cells
      for (const cell of visibleCellsRef.current) {
        const cellKey = `${cell.i},${cell.j},${cell.k}`;
        if (occupiedSet.has(cellKey)) continue; // Skip occupied cells

        // Get world position of this cell by applying transform
        const cellWorldPos = new THREE.Vector3(cell.i, cell.j, cell.k).applyMatrix4(M);
        
        // Vector from ray origin to cell
        const toCellVec = new THREE.Vector3().subVectors(cellWorldPos, rayOrigin);
        
        // Project onto ray to find distance along ray
        const distAlongRay = toCellVec.dot(rayDirection);
        
        // CRITICAL: Skip if behind camera OR not in front of hit piece
        if (distAlongRay < 0 || distAlongRay >= frontLimit) continue;
        
        // Calculate perpendicular distance from cell to ray
        const closestPointOnRay = new THREE.Vector3()
          .copy(rayOrigin)
          .addScaledVector(rayDirection, distAlongRay);
        const perpDistance = cellWorldPos.distanceTo(closestPointOnRay);
        
        // Only consider cells VERY close to ray center (under cursor)
        if (perpDistance < perpendicularTolerance && distAlongRay < nearestDistance) {
          nearestDistance = distAlongRay;
          nearestCell = cell;
        }
      }

      return nearestCell;
    };

    const performRaycast = (clientX: number, clientY: number): { target: 'cell' | 'piece' | 'background' | null, data?: any } => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const rayOrigin = raycaster.ray.origin.clone();
      const rayDirection = raycaster.ray.direction.clone();

      // Check BOTH pieces and cells, then compare distances to decide which is in front
      
      // 1. Check for piece hits
      let pieceHit: { uid: string, distance: number, emptyCellUnderCursor: IJK | null } | null = null;
      
      if (!hidePlacedPieces && placedMeshesRef.current.size > 0) {
        const allPieceMeshes = Array.from(placedMeshesRef.current.values());
        const allIntersections = raycaster.intersectObjects(allPieceMeshes, true);
        
        if (allIntersections.length > 0) {
          const frontMostHit = allIntersections[0];
          
          // Find which piece this intersection belongs to
          let hitPieceUid: string | null = null;
          
          // For InstancedMesh, the intersection.object IS the mesh itself
          for (const [uid, mesh] of placedMeshesRef.current.entries()) {
            if (frontMostHit.object === mesh) {
              hitPieceUid = uid;
              break;
            }
          }
          
          // Fallback: walk up parent hierarchy (for Group-based pieces)
          if (!hitPieceUid) {
            for (const [uid, mesh] of placedMeshesRef.current.entries()) {
              let obj = frontMostHit.object.parent;
              while (obj) {
                if (obj === mesh) {
                  hitPieceUid = uid;
                  break;
                }
                obj = obj.parent;
              }
              if (hitPieceUid) break;
            }
          }
          
          if (hitPieceUid) {
            const hitPoint = frontMostHit.point.clone();
            const hitPieceDistance = rayOrigin.distanceTo(hitPoint);
            const emptyCellUnderCursor = getEmptyCellUnderCursor(rayOrigin, rayDirection, hitPieceDistance);
            
            pieceHit = {
              uid: hitPieceUid,
              distance: hitPieceDistance,
              emptyCellUnderCursor
            };
          }
        }
      }

      // 2. Check for cell hits
      let cellHit: { cell: IJK, distance: number } | null = null;
      
      const mesh = meshRef.current;
      if (mesh) {
        const intersections = raycaster.intersectObject(mesh);
        if (intersections.length > 0) {
          const intersection = intersections[0];
          const instanceId = intersection.instanceId;
          
          if (instanceId !== undefined && instanceId < visibleCellsRef.current.length) {
            const clickedCell = visibleCellsRef.current[instanceId];
            cellHit = {
              cell: clickedCell,
              distance: intersection.distance
            };
          }
        }
      }

      // 3. Compare distances and choose the CLOSER one (in front)
      const epsilon = 0.001;
      
      if (pieceHit && cellHit) {
        // Both hit - choose whichever is closer
        if (pieceHit.distance + epsilon < cellHit.distance) {
          // Piece is in front
          console.log('🎯 [RAYCAST] Piece in front (piece:', pieceHit.distance.toFixed(3), 'cell:', cellHit.distance.toFixed(3) + ')');
          return {
            target: 'piece',
            data: {
              uid: pieceHit.uid,
              hitPieceDistance: pieceHit.distance,
              emptyCellUnderCursor: pieceHit.emptyCellUnderCursor
            }
          };
        } else {
          // Cell is in front (or equal distance)
          console.log('🎯 [RAYCAST] Cell in front (piece:', pieceHit.distance.toFixed(3), 'cell:', cellHit.distance.toFixed(3) + ')');
          return { target: 'cell', data: cellHit.cell };
        }
      } else if (pieceHit) {
        // Only piece hit
        console.log('🎯 [RAYCAST] Only piece hit:', pieceHit.uid);
        return {
          target: 'piece',
          data: {
            uid: pieceHit.uid,
            hitPieceDistance: pieceHit.distance,
            emptyCellUnderCursor: pieceHit.emptyCellUnderCursor
          }
        };
      } else if (cellHit) {
        // Only cell hit
        console.log('🎯 [RAYCAST] Only cell hit:', cellHit.cell);
        return { target: 'cell', data: cellHit.cell };
      }

      // Nothing hit - background
      return { target: 'background' };
    };

    // Cell-only raycast (for double-click/long-press to prioritize cells over pieces)
    const performCellOnlyRaycast = (clientX: number, clientY: number): { target: 'cell', data: IJK } | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Only check cells (skip pieces)
      const mesh = meshRef.current;
      if (mesh) {
        const intersections = raycaster.intersectObject(mesh);
        if (intersections.length > 0) {
          const intersection = intersections[0];
          const instanceId = intersection.instanceId;
          
          if (instanceId !== undefined && instanceId < visibleCellsRef.current.length) {
            const clickedCell = visibleCellsRef.current[instanceId];
            return { target: 'cell', data: clickedCell };
          }
        }
      }

      return null; // No cell hit
    };

    const performPieceOnlyRaycast = (clientX: number, clientY: number): { target: 'piece', data: any } | null => {
      if (hidePlacedPieces) return null;
      if (placedMeshesRef.current.size === 0) return null;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const allPieceMeshes = Array.from(placedMeshesRef.current.values());
      const allIntersections = raycaster.intersectObjects(allPieceMeshes, true);
      if (allIntersections.length === 0) return null;

      const frontMostHit = allIntersections[0];

      let hitPieceUid: string | null = null;
      for (const [uid, mesh] of placedMeshesRef.current.entries()) {
        if (frontMostHit.object === mesh) {
          hitPieceUid = uid;
          break;
        }
      }

      if (!hitPieceUid) {
        for (const [uid, mesh] of placedMeshesRef.current.entries()) {
          let obj = frontMostHit.object.parent;
          while (obj) {
            if (obj === mesh) {
              hitPieceUid = uid;
              break;
            }
            obj = obj.parent;
          }
          if (hitPieceUid) break;
        }
      }

      if (!hitPieceUid) return null;

      const rayOrigin = raycaster.ray.origin.clone();
      const rayDirection = raycaster.ray.direction.clone();
      const hitPoint = frontMostHit.point.clone();
      const hitPieceDistance = rayOrigin.distanceTo(hitPoint);
      const emptyCellUnderCursor = getEmptyCellUnderCursor(rayOrigin, rayDirection, hitPieceDistance);

      return {
        target: 'piece',
        data: {
          uid: hitPieceUid,
          hitPieceDistance,
          emptyCellUnderCursor,
        },
      };
    };

    const isMobile = 'ontouchstart' in window;

    if (isMobile) {
      // MOBILE: Touch-based gesture detection
      const onTouchStart = (e: TouchEvent) => {
        if (e.target !== renderer.domElement) return;
        if (e.touches.length !== 1) return;
        
        const touch = e.touches[0];
        
        // Start drag session tracking
        dragStartedRef.current = true;
        isDraggingRef.current = false;
        dragStartPosRef.current = { x: touch.clientX, y: touch.clientY };
        touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
        touchMovedRef.current = false;
        longPressFiredRef.current = false;
        
        // Start long press timer
        longPressTimerRef.current = setTimeout(() => {
          if (!touchMovedRef.current && !isDraggingRef.current) {
            longPressFiredRef.current = true;
            const result = performRaycast(touch.clientX, touch.clientY);
            if (result.target) {
              onInteraction(result.target, 'long', result.data);
            }
          }
        }, LONG_PRESS_DELAY);
      };

      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        if (!dragStartedRef.current || !dragStartPosRef.current) return;
        
        const touch = e.touches[0];
        
        // Check if movement exceeds threshold
        const dx = touch.clientX - dragStartPosRef.current.x;
        const dy = touch.clientY - dragStartPosRef.current.y;
        const distSq = dx * dx + dy * dy;
        
        if (distSq > DRAG_THRESHOLD_SQ) {
          // Drag detected - mark as dragging and cancel long press
          isDraggingRef.current = true;
          touchMovedRef.current = true;
          
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          
          console.log('📱 Drag detected, will suppress tap');
        }
      };

      const onTouchEnd = (e: TouchEvent) => {
        // CRITICAL: Skip if another handler already completed a gesture
        if (gestureCompletedRef.current) {
          console.log('📱 Interaction handler touchend skipped - gesture completed');
          e.stopImmediatePropagation();
          e.preventDefault();
          return;
        }

        // CRITICAL FIX: If drag session is active AND dragging occurred, terminate WITHOUT any interaction
        if (dragStartedRef.current && isDraggingRef.current) {
          console.log('📱 touchEnd: Drag session ended, clearing ALL timers and skipping interactions');
          clearTimers(); // Cancel all pending gestures
          dragStartedRef.current = false;
          isDraggingRef.current = false;
          dragStartPosRef.current = null;
          return;
        }

        // No drag occurred, allow normal tap processing
        dragStartedRef.current = false;
        isDraggingRef.current = false;

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
        lastPointerPositionRef.current = { clientX: touch.clientX, clientY: touch.clientY }; // Store position
        
        // Check if there's a pending tap (for double-tap detection)
        if (pendingTapTimerRef.current && lastTapResultRef.current) {
          // Second tap - DOUBLE TAP detected
          clearTimeout(pendingTapTimerRef.current);
          pendingTapTimerRef.current = null;
          
          // Use standard raycast result (piece OR cell, whichever is closer)
          // Do NOT override with performPieceOnlyRaycast - that breaks empty cell selection
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
      // DESKTOP: Click-based gesture detection with drag tracking
      const onMouseDown = (e: MouseEvent) => {
        if (e.target !== renderer.domElement) return;
        
        // Start drag session tracking
        dragStartedRef.current = true;
        isDraggingRef.current = false;
        dragStartPosRef.current = { x: e.clientX, y: e.clientY };
      };

      const onMouseMove = (e: MouseEvent) => {
        if (!dragStartedRef.current || !dragStartPosRef.current) return;
        
        // Check if movement exceeds threshold
        const dx = e.clientX - dragStartPosRef.current.x;
        const dy = e.clientY - dragStartPosRef.current.y;
        const distSq = dx * dx + dy * dy;
        
        if (distSq > DRAG_THRESHOLD_SQ) {
          // Drag detected - mark as dragging and suppress next click
          isDraggingRef.current = true;
          suppressNextClickRef.current = true;
          console.log(' Drag detected, will suppress click');
        }
      };

      const onMouseUp = () => {
        // CRITICAL FIX: If drag session is active AND dragging occurred, terminate WITHOUT any interaction
        if (dragStartedRef.current && isDraggingRef.current) {
          console.log(' mouseUp: Drag session ended, clearing ALL timers');
          clearTimers(); // Cancel all pending gestures
          dragStartedRef.current = false;
          isDraggingRef.current = false;
          dragStartPosRef.current = null;
          return;
        }

        // No drag occurred, allow normal click processing
        dragStartedRef.current = false;
        isDraggingRef.current = false;
        dragStartPosRef.current = null;
      };

      const onClick = (e: MouseEvent) => {
        if (e.target !== renderer.domElement) return;
        
        // CRITICAL: Suppress DOM click event caused by OrbitControls after drag
        if (suppressNextClickRef.current) {
          console.log(' Suppressing DOM click caused by drag/OrbitControls damping');
          e.stopPropagation();
          e.preventDefault();
          suppressNextClickRef.current = false; // Reset for future clicks
          return;
        }
        
        const result = performRaycast(e.clientX, e.clientY);
        lastPointerPositionRef.current = { clientX: e.clientX, clientY: e.clientY }; // Store position
        console.log(' Click detected:', result.target, 'pending:', !!pendingTapTimerRef.current);
        
        // Check if there's a pending click (for double-click detection)
        if (pendingTapTimerRef.current && lastTapResultRef.current) {
          // Second click - DOUBLE CLICK detected
          console.log(' ✅ DOUBLE CLICK detected on', result.target);
          clearTimeout(pendingTapTimerRef.current);
          pendingTapTimerRef.current = null;
          
          // Use standard raycast result (piece OR cell, whichever is closer)
          // Do NOT override with performPieceOnlyRaycast - that breaks empty cell selection
          if (result.target) {
            onInteraction(result.target, 'double', result.data);
          }
          lastTapResultRef.current = null;
        } else {
          // First click - wait to see if double-click comes
          console.log(' First click, waiting for potential double-click...');
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

      renderer.domElement.addEventListener('mousedown', onMouseDown);
      renderer.domElement.addEventListener('mousemove', onMouseMove);
      renderer.domElement.addEventListener('mouseup', onMouseUp);
      renderer.domElement.addEventListener('click', onClick);
      
      return () => {
        clearTimers();
        renderer.domElement.removeEventListener('mousedown', onMouseDown);
        renderer.domElement.removeEventListener('mousemove', onMouseMove);
        renderer.domElement.removeEventListener('mouseup', onMouseUp);
        renderer.domElement.removeEventListener('click', onClick);
      };
    }
  }, [editMode, onInteraction, cells, placedPieces, drawingCells, hidePlacedPieces]);

  // ======== DELETED: Phase 1 long-press detector - now handled by onInteraction ========

  return <div 
    ref={mountRef} 
    className={
      layout === 'embedded'
        ? 'scene-root scene-embedded'
        : 'scene-root scene-fullscreen'
    }
    style={{ 
      width: "100%", 
      height: "100%", 
      position: layout === 'embedded' ? 'relative' : 'absolute',
      left: layout === 'embedded' ? undefined : 0,
      overflow: "hidden"
    }} 
  />;
};

// Export without React.memo - manual mode works fine without it
// Material updates happen via effect that depends on settings.material.metalness/roughness
export default SceneCanvas;