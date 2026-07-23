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
  highlightedPieceUid?: string | null; // Phase 3A-5: temporary glow highlight
  onSelectPiece?: (uid: string | null) => void;
  onCycleOrientation?: () => void;
  onPlacePiece?: () => void;
  onDeleteSelectedPiece?: () => void;
  // Hint preview (white-glow spheres, same material language as selection)
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
  // PvP: the OPPONENT's in-progress selection, rendered as non-interactive
  // hollow ghost spheres (opponent forming preview)
  opponentFormingCells?: IJK[];
  rejectedPieceCells?: IJK[] | null;
  rejectedPieceId?: string | null;
  onDrawCell?: (ijk: IJK) => void;
};

// Stable default so an absent prop never churns render effects.
const EMPTY_FORMING_CELLS: IJK[] = [];

// ---- In-progress material language ----
// solid = real (placed pieces), glowing = YOURS in progress, hollow = THEIRS
// in progress. No hue is reserved for in-progress states, so the 25-piece
// saturated palette can never collide with them.

// "Hot glass" glow for the local player's own forming selection (and the
// hint/anchor highlight): near-white base + white emissive, intensity pulsed
// as a gentle sine in the scene's single rAF loop.
const SELECTION_GLOW_BASE_COLOR = 0xf4f7ff; // near-white
const SELECTION_GLOW_EMISSIVE = 0xffffff;
const SELECTION_GLOW_MIN = 0.35;
const SELECTION_GLOW_MAX = 0.9;
const SELECTION_GLOW_PERIOD_MS = 1200;
const SELECTION_GLOW_MID = (SELECTION_GLOW_MIN + SELECTION_GLOW_MAX) / 2;

// Hollow ghost for ANY opponent's in-progress selection (remote PvP forming
// preview + the computer opponent's drawing overlay): strongly desaturated
// pale gray-blue, static (no glow, no pulse) — an ultra-faint transparent
// fill plus a thin wireframe shell for the "hollow / immaterial" read.
const GHOST_COLOR = 0xaebfd3;
const GHOST_FILL_OPACITY = 0.18;
const GHOST_WIRE_OPACITY = 0.5;

type OverlayMeshRef = React.MutableRefObject<THREE.InstancedMesh | undefined>;
type OverlayGroupRef = React.MutableRefObject<THREE.Group | undefined>;

/**
 * Render an opponent-owned in-progress selection as a hollow ghost: two
 * passes over the same cells (faint fill + wireframe shell), both fully
 * non-interactive (raycast is a no-op on every mesh).
 */
function renderHollowGhostLayer(opts: {
  scene: THREE.Scene;
  view: ViewTransforms;
  cells: IJK[];
  showBonds: boolean;
  fillMeshRef: OverlayMeshRef;
  fillBondsRef: OverlayGroupRef;
  wireMeshRef: OverlayMeshRef;
  wireBondsRef: OverlayGroupRef;
}) {
  const { scene, view, cells, showBonds, fillMeshRef, fillBondsRef, wireMeshRef, wireBondsRef } = opts;
  const radius = estimateSphereRadiusFromView(view);

  // Pass 1: ultra-faint transparent fill (bonds included so the shape reads).
  const fillMat = new THREE.MeshStandardMaterial({
    color: GHOST_COLOR,
    metalness: 0.0,
    roughness: 0.9,
    transparent: true,
    opacity: GHOST_FILL_OPACITY,
    depthWrite: false, // ghostly: never occludes solid geometry
  });
  renderOverlayLayer({
    scene,
    viewMWorld: view.M_world,
    cells,
    showBonds,
    material: fillMat,
    radius,
    meshRef: fillMeshRef,
    bondsRef: fillBondsRef,
    segments: { w: 32, h: 32 },
    castShadow: false,
    receiveShadow: false,
  });

  // Pass 2: thin wireframe shell (unlit, spheres only; low segment count so
  // the shell reads as sparse lines rather than a near-solid surface).
  const wireMat = new THREE.MeshBasicMaterial({
    color: GHOST_COLOR,
    wireframe: true,
    transparent: true,
    opacity: GHOST_WIRE_OPACITY,
    depthWrite: false,
  });
  renderOverlayLayer({
    scene,
    viewMWorld: view.M_world,
    cells,
    showBonds: false,
    material: wireMat,
    radius,
    meshRef: wireMeshRef,
    bondsRef: wireBondsRef,
    segments: { w: 16, h: 12 },
    castShadow: false,
    receiveShadow: false,
  });

  // Belt-and-suspenders: exclude every ghost mesh from any raycast pass.
  const noRaycast = () => {};
  if (fillMeshRef.current) fillMeshRef.current.raycast = noRaycast;
  if (wireMeshRef.current) wireMeshRef.current.raycast = noRaycast;
  for (const groupRef of [fillBondsRef, wireBondsRef]) {
    if (groupRef.current) {
      groupRef.current.traverse((obj: any) => {
        obj.raycast = noRaycast;
      });
    }
  }
}

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
  highlightedPieceUid = null,
  onSelectPiece,
  containerOpacity = 1.0,
  containerColor = '#ffffff',
  containerRoughness = 0.3,
  puzzleMode = 'unlimited',
  drawingCells = [],
  computerDrawingCells = [],
  opponentFormingCells = EMPTY_FORMING_CELLS,
  rejectedPieceCells = null,
  rejectedPieceId = null,
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

  // Per-frame callback ref for transparent sorting
  const onFrameCallbackRef = useRef<(() => void) | null>(null);
  // Per-frame callback for material animation (selection glow pulse). Driven
  // by the ONE rAF loop that initScene owns — never a second loop.
  const pulseFrameCallbackRef = useRef<(() => void) | null>(null);
  // Store sphere positions AND cells for per-frame re-sorting of transparent cells
  const containerSphereDataRef = useRef<Array<{ pos: THREE.Vector3; cell: IJK }>>([]);

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

  // Memory diagnostic — enable with ?mem=1 (or localStorage debug.mem='1').
  // Renders an on-screen overlay (NOT console — the prod build strips
  // console.log) with JS heap + three.js resource counts once a second, so a
  // leak during a long solve is visible: watch which number climbs
  // (geometries/textures = GPU/mesh leak, heap-only = JS accumulation,
  // pieceMeshes = piece churn).
  useEffect(() => {
    let on = false;
    try {
      on = new URLSearchParams(window.location.search).has('mem')
        || localStorage.getItem('debug.mem') === '1';
    } catch { /* ignore */ }
    if (!on) return;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;top:8px;left:8px;z-index:99999;background:rgba(0,0,0,.82);' +
      'color:#0f0;font:12px/1.5 monospace;padding:8px 10px;border-radius:6px;white-space:pre;pointer-events:none';
    document.body.appendChild(box);
    let peakHeap = 0;
    const tick = () => {
      const info = rendererRef.current?.info;
      const mem = (performance as any).memory;
      const heapMB = mem ? Math.round(mem.usedJSHeapSize / 1048576) : -1;
      const limMB = mem ? Math.round(mem.jsHeapSizeLimit / 1048576) : -1;
      if (heapMB > peakHeap) peakHeap = heapMB;
      box.textContent =
        `heap ${heapMB} / ${limMB} MB  (peak ${peakHeap})\n` +
        `geom ${info?.memory.geometries ?? '?'}  tex ${info?.memory.textures ?? '?'}  prog ${(info as any)?.programs?.length ?? '?'}\n` +
        `pieceMeshes ${placedMeshesRef.current.size}  bonds ${placedBondsRef.current.size}\n` +
        `drawCalls ${info?.render.calls ?? '?'}`;
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => { window.clearInterval(id); box.remove(); };
  }, []);

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
        onFrameCallbackRef,
        pulseFrameCallbackRef,
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
      sphereDataRef: containerSphereDataRef,
      cells,
      view,
      placedPieces,
      drawingCells,
      computerDrawingCells,
      opponentFormingCells,
      rejectedPieceCells,
      previewOffsets,
      alwaysShowContainer,
      containerColor,
      containerOpacity,
      containerRoughness,
      containerMetalness,
      explosionFactor,
    });

    // Set up per-frame callback for transparent sorting (only when transparent cells exist)
    if (containerOpacity < 1.0 && containerSphereDataRef.current.length > 0) {
      onFrameCallbackRef.current = () => {
        const mesh = meshRef.current;
        const sphereData = containerSphereDataRef.current;
        const cam = cameraRef.current;
        if (!mesh || !sphereData.length || !cam) return;

        // Re-sort by distance from current camera position
        const sorted = sphereData
          .map((d, idx) => ({ ...d, idx, dist: d.pos.distanceToSquared(cam.position) }))
          .sort((a, b) => b.dist - a.dist); // Farthest first

        // Update instance matrices in sorted order
        for (let i = 0; i < sorted.length; i++) {
          const m = new THREE.Matrix4();
          m.compose(sorted[i].pos, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
          mesh.setMatrixAt(i, m);
        }
        mesh.instanceMatrix.needsUpdate = true;

        // CRITICAL: Keep visibleCellsRef synchronized with the new instance order
        visibleCellsRef.current = sorted.map(d => d.cell);
      };
    } else {
      onFrameCallbackRef.current = null;
    }
  }, [
    cells,
    view,
    placedPieces,
    drawingCells,
    computerDrawingCells,
    opponentFormingCells,
    rejectedPieceCells,
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

  const drawingMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // Material language: solid = real, glowing = yours in progress, hollow =
  // theirs in progress.
  //
  // Local selection ("hot glass"): near-white solid spheres with a white
  // emissive glow whose intensity pulses gently. The pulse itself runs in the
  // scene's single rAF loop via pulseFrameCallbackRef (installed below, after
  // the hint layer — the hint anchor shares the same glow material language).
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !view) return;

    // Clean up if no cells
    if (!drawingCells || drawingCells.length === 0) {
      drawingMaterialRef.current = null;
      if (drawingMeshRef.current) {
        scene.remove(drawingMeshRef.current);
        drawingMeshRef.current.geometry.dispose();
        (drawingMeshRef.current.material as THREE.Material).dispose();
        drawingMeshRef.current = undefined;
      }
      if (drawingBondsRef.current) {
        scene.remove(drawingBondsRef.current);
        drawingBondsRef.current = undefined;
      }
      return;
    }

    const radius = estimateSphereRadiusFromView(view);

    // Bright white "hot glass": solid, emissive white; emissiveIntensity is
    // animated (sine pulse ~1.2s, 0.35–0.9) by the shared per-frame callback.
    const mat = new THREE.MeshStandardMaterial({
      color: SELECTION_GLOW_BASE_COLOR,
      emissive: SELECTION_GLOW_EMISSIVE,
      emissiveIntensity: SELECTION_GLOW_MID,
      metalness: 0.2,
      roughness: 0.25,
      transparent: true,
      opacity: 0.95,
    });
    drawingMaterialRef.current = mat;

    // Build instanced mesh
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

  // Render computer drawing cells as a hollow ghost — the computer IS an
  // opponent, so its in-progress drawing gets the "theirs in progress"
  // treatment (same as the PvP forming preview below).
  const computerDrawingMeshRef = useRef<THREE.InstancedMesh | undefined>();
  const computerDrawingBondsRef = useRef<THREE.Group | undefined>();
  const computerDrawingWireMeshRef = useRef<THREE.InstancedMesh | undefined>();
  const computerDrawingWireBondsRef = useRef<THREE.Group | undefined>();
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !view) return;

    renderHollowGhostLayer({
      scene,
      view,
      cells: computerDrawingCells,
      showBonds,
      fillMeshRef: computerDrawingMeshRef,
      fillBondsRef: computerDrawingBondsRef,
      wireMeshRef: computerDrawingWireMeshRef,
      wireBondsRef: computerDrawingWireBondsRef,
    });
  }, [computerDrawingCells, view, showBonds]);

  // Render the OPPONENT's forming cells (PvP preview) as hollow ghosts:
  // static, immaterial (faint fill + wireframe shell, no glow/pulse), no
  // shadows, and fully NON-INTERACTIVE (raycast is a no-op so they can never
  // intercept clicks; the interaction system also only ever raycasts the
  // container + placed-piece meshes). Lifecycle (container-occupied-set
  // membership, clears, 30s expiry) is owned by the callers/GamePage.
  const opponentFormingMeshRef = useRef<THREE.InstancedMesh | undefined>();
  const opponentFormingBondsRef = useRef<THREE.Group | undefined>();
  const opponentFormingWireMeshRef = useRef<THREE.InstancedMesh | undefined>();
  const opponentFormingWireBondsRef = useRef<THREE.Group | undefined>();
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !view) return;

    renderHollowGhostLayer({
      scene,
      view,
      cells: opponentFormingCells,
      showBonds,
      fillMeshRef: opponentFormingMeshRef,
      fillBondsRef: opponentFormingBondsRef,
      wireMeshRef: opponentFormingWireMeshRef,
      wireBondsRef: opponentFormingWireBondsRef,
    });
  }, [opponentFormingCells, view, showBonds]);

  // Render rejected piece cells with appear/disappear animation
  const rejectedMeshRef = useRef<THREE.InstancedMesh | undefined>();
  const rejectedBondsRef = useRef<THREE.Group | undefined>();
  const rejectedAnimationRef = useRef<number | null>(null);
  const rejectedMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !view) return;
    
    if (rejectedAnimationRef.current) {
      cancelAnimationFrame(rejectedAnimationRef.current);
      rejectedAnimationRef.current = null;
    }
    
    if (!rejectedPieceCells || rejectedPieceCells.length === 0) {
      rejectedMaterialRef.current = null;
      if (rejectedMeshRef.current) {
        scene.remove(rejectedMeshRef.current);
        rejectedMeshRef.current.geometry.dispose();
        (rejectedMeshRef.current.material as THREE.Material).dispose();
        rejectedMeshRef.current = undefined;
      }
      if (rejectedBondsRef.current) {
        scene.remove(rejectedBondsRef.current);
        rejectedBondsRef.current = undefined;
      }
      return;
    }
    
    const radius = estimateSphereRadiusFromView(view);
    const pieceColor = rejectedPieceId 
      ? new THREE.Color().setHSL(((rejectedPieceId.charCodeAt(0) * 137) % 360) / 360, 0.7, 0.5)
      : new THREE.Color(0xff4444);
    
    const mat = new THREE.MeshStandardMaterial({
      color: pieceColor,
      metalness: piecesMetalness,
      roughness: piecesRoughness,
      transparent: true,
      opacity: 0
    });
    rejectedMaterialRef.current = mat;
    
    renderOverlayLayer({
      scene,
      viewMWorld: view.M_world,
      cells: rejectedPieceCells,
      showBonds,
      material: mat,
      radius,
      meshRef: rejectedMeshRef,
      bondsRef: rejectedBondsRef,
      segments: { w: 32, h: 32 },
    });
    
    const APPEAR_MS = 500;
    const DISAPPEAR_MS = 500;
    const startTime = Date.now();
    
    const animate = () => {
      if (!rejectedMaterialRef.current) return;
      const elapsed = Date.now() - startTime;
      let opacity: number;
      if (elapsed < APPEAR_MS) {
        opacity = elapsed / APPEAR_MS;
      } else if (elapsed < APPEAR_MS + DISAPPEAR_MS) {
        opacity = 1 - (elapsed - APPEAR_MS) / DISAPPEAR_MS;
      } else {
        opacity = 0;
      }
      rejectedMaterialRef.current.opacity = opacity;
      rejectedMaterialRef.current.needsUpdate = true;
      if (rejectedBondsRef.current) {
        rejectedBondsRef.current.traverse((obj: THREE.Object3D) => {
          if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
            obj.material.opacity = opacity;
            obj.material.needsUpdate = true;
          }
        });
      }
      if (elapsed < APPEAR_MS + DISAPPEAR_MS) {
        rejectedAnimationRef.current = requestAnimationFrame(animate);
      }
    };
    
    rejectedAnimationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (rejectedAnimationRef.current) {
        cancelAnimationFrame(rejectedAnimationRef.current);
      }
    };
  }, [rejectedPieceCells, rejectedPieceId, view, showBonds]);

  // Render hint cells as golden spheres with 1s fade-in animation
  const hintMeshRef = useRef<THREE.InstancedMesh | undefined>();
  const hintBondsRef = useRef<THREE.Group | undefined>();
  const hintAnimationRef = useRef<number | null>(null);
  const hintMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !view) return;
    
    // Cancel any existing animation
    if (hintAnimationRef.current) {
      cancelAnimationFrame(hintAnimationRef.current);
      hintAnimationRef.current = null;
    }
    
    // Clean up if no cells
    if (!hintCells || hintCells.length === 0) {
      hintMaterialRef.current = null;
      if (hintMeshRef.current) {
        scene.remove(hintMeshRef.current);
        hintMeshRef.current.geometry.dispose();
        (hintMeshRef.current.material as THREE.Material).dispose();
        hintMeshRef.current = undefined;
      }
      if (hintBondsRef.current) {
        scene.remove(hintBondsRef.current);
        hintBondsRef.current = undefined;
      }
      return;
    }

    const radius = estimateSphereRadiusFromView(view);
    // Same white "hot glass" glow as the local selection (no gold anywhere):
    // the pulse callback below animates emissiveIntensity on this material too.
    const mat = new THREE.MeshStandardMaterial({
      color: SELECTION_GLOW_BASE_COLOR,
      emissive: SELECTION_GLOW_EMISSIVE,
      emissiveIntensity: SELECTION_GLOW_MID,
      metalness: 0.2,
      roughness: 0.25,
      transparent: true,
      opacity: 0  // Start at 0 for fade-in animation
    });
    hintMaterialRef.current = mat;

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
    
    // Animate fade-in over 1 second
    const APPEAR_MS = 1000;
    const TARGET_OPACITY = 0.95;
    const startTime = Date.now();
    
    const animate = () => {
      if (!hintMaterialRef.current) return;
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / APPEAR_MS);
      const opacity = t * TARGET_OPACITY;
      
      hintMaterialRef.current.opacity = opacity;
      hintMaterialRef.current.needsUpdate = true;
      
      // Update bond materials too
      if (hintBondsRef.current) {
        hintBondsRef.current.traverse((obj: THREE.Object3D) => {
          if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
            obj.material.opacity = opacity;
            obj.material.needsUpdate = true;
          }
        });
      }
      
      if (t < 1) {
        hintAnimationRef.current = requestAnimationFrame(animate);
      }
    };
    
    hintAnimationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (hintAnimationRef.current) {
        cancelAnimationFrame(hintAnimationRef.current);
      }
    };
  }, [hintCells, view, showBonds]);

  // Selection glow pulse: gentle sine on emissiveIntensity (~1.2s period,
  // 0.35–0.9) for the local drawing material AND the hint/anchor material.
  // Runs inside the scene's EXISTING rAF loop (initScene) via
  // pulseFrameCallbackRef — no second animation loop.
  useEffect(() => {
    pulseFrameCallbackRef.current = () => {
      const drawingMat = drawingMaterialRef.current;
      const hintMat = hintMaterialRef.current;
      if (!drawingMat && !hintMat) return;
      const phase = (performance.now() / SELECTION_GLOW_PERIOD_MS) * Math.PI * 2;
      const intensity =
        SELECTION_GLOW_MID +
        ((SELECTION_GLOW_MAX - SELECTION_GLOW_MIN) / 2) * Math.sin(phase);
      if (drawingMat) drawingMat.emissiveIntensity = intensity;
      if (hintMat) hintMat.emissiveIntensity = intensity;
    };
    return () => {
      pulseFrameCallbackRef.current = null;
    };
  }, []);

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
      highlightedPieceUid,
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
    highlightedPieceUid,
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
        if (!piece.cells || piece.cells.length === 0) continue;
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
      if (!piece.cells || piece.cells.length === 0) continue;
      
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
    // Rotate placed pieces group
    const placedGroup = placedPiecesGroupRef.current;
    if (placedGroup) {
      placedGroup.rotation.y = turntableRotation;
    }
    
    // Also rotate container mesh (for puzzles without solutions)
    const containerMesh = meshRef.current;
    if (containerMesh) {
      containerMesh.rotation.y = turntableRotation;
    }
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