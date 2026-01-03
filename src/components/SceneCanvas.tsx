import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { IJK } from "../types/shape";
import type { ViewTransforms } from "../services/ViewTransforms";
import type { VisibilitySettings } from "../types/lattice";
import type { StudioSettings } from "../types/studio";
import { HDRLoader } from "../services/HDRLoader";
import { estimateSphereRadiusFromView } from "./scene/sceneMath";
import { renderOverlayLayer } from "./scene/renderOverlayLayer";
import { initScene } from "./scene/initScene";
import { renderContainerMesh } from "./scene/renderContainerMesh";
import { renderPlacedPieces } from "./scene/renderPlacedPieces";
import { attachInteractions } from "./scene/attachInteractions";
import { renderNeighbors } from "./scene/renderNeighbors";

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
  onSelectPiece?: (uid: string | null) => void;
  onCycleOrientation?: () => void;
  onPlacePiece?: () => void;
  onDeleteSelectedPiece?: () => void;
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
  containerOpacity?: number;
  containerColor?: string;
  containerRoughness?: number;
  puzzleMode?: 'oneOfEach' | 'unlimited' | 'single';
  drawingCells?: IJK[];
  computerDrawingCells?: IJK[];
  onDrawCell?: (ijk: IJK) => void;
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
  onHoverCell,
  onClickCell,
  anchor,
  previewOffsets = null,
  placedPieces = [],
  selectedUid = null,
  onSelectPiece,
  containerOpacity = 1.0,
  containerColor = '#ffffff',
  containerRoughness = 0.3,
  puzzleMode = 'unlimited',
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
  const placedPiecesRef = useRef(placedPieces); // Ref to avoid re-attaching interactions on every update

  // Persistent refs for double-click detection (survive effect re-runs)
  const pendingTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapResultRef = useRef<{ target: string | null; data?: any; timestamp?: number } | null>(null);

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
  
  // Keep placedPiecesRef updated without re-attaching interactions
  useEffect(() => {
    placedPiecesRef.current = placedPieces;
  }, [placedPieces]);
  
  // Refs for values that change but shouldn't re-attach interaction listeners
  const viewRef = useRef(view);
  const hidePlacedPiecesRef = useRef(hidePlacedPieces);
  const onInteractionRef = useRef(onInteraction);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { hidePlacedPiecesRef.current = hidePlacedPieces; }, [hidePlacedPieces]);
  useEffect(() => { onInteractionRef.current = onInteraction; }, [onInteraction]);
  
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
    console.log(' SceneCanvas material settings:', {
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
      console.log(' Waiting for initialization before updating lights');
      return;
    }
    
    console.log(' Updating lights with brightness:', brightness, 'directional:', settings?.lights?.directional);
    
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
      console.log(' Applied directional light settings from movie:', settings.lights.directional);
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
    
    console.log(' HDR check (real-time):', {
      enabled: hdrEnabled,
      envId: hdrEnvId,
      intensity: hdrIntensity,
      hasHdrLoader: !!hdrLoader,
      hasPMREM: hdrLoader ? !!(hdrLoader as any).pmremGenerator : false
    });
    
    if (hdrEnabled && hdrEnvId && hdrLoader) {
      // Verify PMREM generator is initialized
      if (!(hdrLoader as any).pmremGenerator) {
        console.warn(' PMREM generator not initialized yet, will retry on next render');
        // Don't return - just skip HDR load this time, don't disable it entirely
      } else {
      
      console.log(' Loading HDR environment:', hdrEnvId);
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
          
          console.log(' HDR environment applied');
        })
        .catch((e) => console.error(' HDR load error:', e));
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
      
      console.log(' HDR disabled - environment and material envMaps cleared');
    }
  }, [brightness, settings?.lights?.backgroundColor, settings?.lights?.directional, settings?.lights?.hdr?.enabled, settings?.lights?.hdr?.envId, settings?.lights?.hdr?.intensity, hdrInitialized]);

  // Update material properties on existing pieces when settings change
  useEffect(() => {
    if (placedMeshesRef.current.size === 0) return;
    
    console.log(' Updating materials on existing pieces:', {
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
    
    console.log(' Camera settings check:', {
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
        console.log(' Perspective FOV updated to:', fovDeg);
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

        console.log(` Saved shape with ${cells.length} cells as ${filename}`);
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

        console.log(` Downloaded shape with ${cells.length} cells as ${filename}`);
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
      console.log(' Camera initialization flag reset for new file');
    };
    
    // Expose camera initialized marker (to prevent auto-reset)
    (window as any).markCameraInitialized = () => {
      hasInitializedCameraRef.current = true;
      console.log(' Camera marked as initialized');
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
        console.log(' Camera position set to', position);
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

    // Debug logging disabled to reduce console noise
    // console.log("HINT CELLS (IJK):", hintCells);

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

    // ONLY for Manual Puzzle mode
    if (!onSelectPiece) return;

    renderPlacedPieces({
      scene,
      placedMeshesRef,
      placedBondsRef,
      placedPiecesGroupRef,
      view,
      placedPieces,
      selectedPieceUid: selectedUid,
      hidePlacedPieces,
      temporarilyVisiblePieces,
      puzzleMode,
      showBonds,
      piecesMetalness,
      piecesRoughness,
      piecesOpacity,
      sphereColorTheme: settings?.sphereColorTheme,
    });
  }, [
    onSelectPiece,
    placedPieces,
    view,
    selectedUid,
    puzzleMode,
    hidePlacedPieces,
    temporarilyVisiblePieces,
    showBonds,
    piecesMetalness,
    piecesRoughness,
    piecesOpacity,
    settings?.sphereColorTheme,
  ]);

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
    if (!scene || !view) return;

    renderNeighbors({
      scene,
      view,
      cells,
      editMode,
      mode,
      containerRoughness,
      neighborMeshRef,
      neighborIJKsRef,
    });
  }, [editMode, mode, cells, view, containerRoughness]);

  // Mouse hover detection for remove mode
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const raycaster = raycasterRef.current;
    const mouse = mouseRef.current;

    if (!renderer || !camera || !raycaster || !mouse) return;
    if (onInteraction) return; // Skip if clean interaction system active
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
    if (onInteraction) return; // Skip if clean interaction system active
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
    if (onInteraction) return; // Skip if clean interaction system active
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
          if (onSelectPiece && selectedUid) {
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
  }, [editMode, onClickCell, onSelectPiece, cells, placedPieces, selectedUid, hidePlacedPieces, onDrawCell]);

  // NEW: Clean interaction system - complete gesture detection + raycasting
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const raycaster = raycasterRef.current;
    const mouse = mouseRef.current;

    if (!renderer || !camera || !raycaster || !mouse) return;
    if (!onInteractionRef.current) return;
    if (editMode) return;

    return attachInteractions({
      renderer,
      camera,
      raycaster,
      mouse,
      viewRef,
      placedPiecesRef,
      placedMeshesRef,
      meshRef,
      visibleCellsRef,
      hidePlacedPiecesRef,
      gestureCompletedRef,
      pendingTapTimerRef,
      lastTapResultRef,
      onInteractionRef,
    });
  }, [editMode]);

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