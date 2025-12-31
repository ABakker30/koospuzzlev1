import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';

import { SandboxScene } from './SandboxScene';
import { getPuzzleById } from '../../api/puzzles';
import { getPuzzleSolutions, type PuzzleSolutionRecord } from '../../api/solutions';
import { computeViewTransforms } from '../../services/ViewTransforms';
import { ijkToXyz } from '../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import type { IJK } from '../../types/shape';
import type { PlacedPiece } from '../solve/types/manualSolve';
import { detectGridType } from './placemat/gridDetection';
import { loadPlacemat, type PlacematData } from './placemat/placematLoader';
import { getPieceColor } from '../../components/scene/sceneMath';
import { buildBonds } from '../../components/scene/buildBonds';
import { PresetSelectorModal } from '../../components/PresetSelectorModal';
import { ENVIRONMENT_PRESETS } from '../../constants/environmentPresets';
import type { StudioSettings } from '../../types/studio';
import { PlacematSettingsModal, loadPlacematSettings, type PlacematSettings } from './PlacematSettingsModal';
import { usePhysicsSimulation, PhysicsSettingsModal, loadPhysicsSettings, type PhysicsSettings } from './physics';

const T_ijk_to_xyz = [
  [0.5, 0.5, 0, 0],
  [0.5, 0, 0.5, 0],
  [0, 0.5, 0.5, 0],
  [0, 0, 0, 1]
];

// Visual/local units before scaling: sphere radius = 0.354
// Real-world: sphere diameter = 25mm, radius = 12.5mm = 0.0125m
// WORLD_SCALE converts local units to meters: 0.0125 / 0.354 ≈ 0.0353
const SPHERE_RADIUS_LOCAL = 0.354;  // Local units (before scaling)
const SPHERE_RADIUS_WORLD = 0.0125; // Real-world meters (after scaling)
const WORLD_SCALE = SPHERE_RADIUS_WORLD / SPHERE_RADIUS_LOCAL; // ≈ 0.0353
const SPHERE_SEGMENTS = 48;

// If your yaw ends up consistently 180° wrong, toggle this.
const FLIP_PUZZLE_HEADING = false;

// ---------- helpers (pure / local) ----------
function mat4FromViewMatrix(viewM: number[][]): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.set(
    viewM[0][0], viewM[0][1], viewM[0][2], viewM[0][3],
    viewM[1][0], viewM[1][1], viewM[1][2], viewM[1][3],
    viewM[2][0], viewM[2][1], viewM[2][2], viewM[2][3],
    viewM[3][0], viewM[3][1], viewM[3][2], viewM[3][3],
  );
  return m;
}

function snapDegrees(deg: number, step: number): number {
  // Normalize to (-180, 180]
  const norm = ((deg + 180) % 360) - 180;
  const snapped = Math.round(norm / step) * step;
  // Normalize again to avoid weird 360s
  return ((snapped + 180) % 360) - 180;
}

function yawDegreesFromXZ(v: THREE.Vector3): number {
  return Math.atan2(v.z, v.x) * 180 / Math.PI;
}

function findBottomLayer(points: THREE.Vector3[], yEps: number): { minY: number; bottom: THREE.Vector3[] } {
  let minY = Infinity;
  for (const p of points) minY = Math.min(minY, p.y);
  const bottom = points.filter(p => Math.abs(p.y - minY) <= yEps);
  return { minY, bottom };
}

function nearestToXZ(target: THREE.Vector3, points: THREE.Vector3[], minDist = 1e-6): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null;
  let bestD = Infinity;
  for (const p of points) {
    const dx = p.x - target.x;
    const dz = p.z - target.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > minDist && d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

type PhysicsBond = { a: number; b: number };
type PhysicsPiece = { id: string; spheres: THREE.Vector3[]; bonds: PhysicsBond[] };

function buildBondsForPiece(cells: IJK[]): PhysicsBond[] {
  // Bonds exist between spheres at IJK distance 1 (Manhattan in this lattice encoding).
  // This is “sound enough” for your use: bonds only between immediate neighbors.
  const bonds: PhysicsBond[] = [];
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const di = Math.abs(cells[i].i - cells[j].i);
      const dj = Math.abs(cells[i].j - cells[j].j);
      const dk = Math.abs(cells[i].k - cells[j].k);
      const man = di + dj + dk;
      if (man === 1) bonds.push({ a: i, b: j });
    }
  }
  return bonds;
}

export function PuzzleViewSandboxPage() {
  const { solutionId } = useParams<{ solutionId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [, setSolutions] = useState<PuzzleSolutionRecord[]>([]);
  const [cells, setCells] = useState<IJK[]>([]);
  const [placedPieces, setPlacedPieces] = useState<PlacedPiece[]>([]);
  const [showDebugHelpers, setShowDebugHelpers] = useState(true);
  const [placematData, setPlacematData] = useState<PlacematData | null>(null);
  const [gridKind, setGridKind] = useState<'square' | 'triangular' | null>(null);
  
  // Environment preset state - default to 'metallic-dark' preset
  const DEFAULT_PRESET = 'metallic-dark';
  const [currentPreset, setCurrentPreset] = useState<string>(() => {
    try {
      return localStorage.getItem('sandbox.environmentPreset') || DEFAULT_PRESET;
    } catch {
      return DEFAULT_PRESET;
    }
  });
  const [envSettings, setEnvSettings] = useState<StudioSettings>(() => {
    try {
      const presetKey = localStorage.getItem('sandbox.environmentPreset');
      if (presetKey && ENVIRONMENT_PRESETS[presetKey]) {
        return ENVIRONMENT_PRESETS[presetKey];
      }
    } catch {
      // ignore
    }
    return ENVIRONMENT_PRESETS[DEFAULT_PRESET];
  });
  const [showPresetModal, setShowPresetModal] = useState(false);
  
  // Placemat material settings
  const [showPlacematModal, setShowPlacematModal] = useState(false);
  const [placematSettings, setPlacematSettings] = useState<PlacematSettings>(() => loadPlacematSettings());
  
  // Physics settings
  const [showPhysicsModal, setShowPhysicsModal] = useState(false);
  const [physicsSettings, setPhysicsSettings] = useState<PhysicsSettings>(() => loadPhysicsSettings());
  
  // Piece color toggle: true = all red, false = individual colors
  const [allRedPieces, setAllRedPieces] = useState(false);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const puzzleGroupRef = useRef<THREE.Group | null>(null);
  const placematGroupRef = useRef<THREE.Group | null>(null);
  const debugHelpersRef = useRef<THREE.Group | null>(null);
  
  // Physics simulation - piece groups tracked for physics sync
  const pieceGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const physicsPiecesRef = useRef<PhysicsPiece[]>([]);
  const placematBoundsRef = useRef<THREE.Box3 | null>(null);
  const visualGroundYRef = useRef<number>(0); // Store visual ground Y for physics sync
  
  // Physics uses WORLD scale (real meters)
const physics = usePhysicsSimulation({ sphereRadius: SPHERE_RADIUS_WORLD, physicsSettings });

  // --- Load puzzle + choose grid + load placemat ---
  useEffect(() => {
    if (!solutionId) {
      setError('No solution ID provided');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        console.log(`🎯 [SANDBOX] Loading solution ${solutionId}`);
        setLoading(true);
        setError(null);

        // NOTE: This is your existing behavior. If this is wrong in your API (solutionId != puzzleId),
        // fix it at the API level or swap this call to the correct one.
        const puzzleData = await getPuzzleById(solutionId);
        if (!puzzleData) throw new Error('Puzzle not found');

        console.log('✅ [SANDBOX] Puzzle loaded:', puzzleData.name);

        const solutionRecords = await getPuzzleSolutions(puzzleData.id);
        setSolutions(solutionRecords);

        const solutionWithPieces = solutionRecords.find(s => s.placed_pieces);
        if (!solutionWithPieces) {
          throw new Error('No solution with placed_pieces found for this puzzle');
        }

        const puzzleCells = puzzleData.geometry || [];
        setCells(puzzleCells);

        const view = computeViewTransforms(puzzleCells, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
        const grid = detectGridType(puzzleCells, view);

        console.log('🔍 [SANDBOX] Grid detected:', grid.type, `(confidence ${grid.confidence.toFixed(2)})`);

        // Map to our simple string
        const kind = (grid.type === 'square' || grid.type === 'triangular') ? grid.type : null;
        setGridKind(kind);

        if (kind) {
          const pm = await loadPlacemat(kind);
          setPlacematData(pm);
          console.log('✅ [SANDBOX] Placemat loaded:', kind);
        } else {
          throw new Error('Grid type could not be determined (square/triangular)');
        }

        setPlacedPieces(solutionWithPieces.placed_pieces as PlacedPiece[]);
        console.log('✅ [SANDBOX] placedPieces:', (solutionWithPieces.placed_pieces as any[]).length);

        setLoading(false);
      } catch (err) {
        console.error('❌ [SANDBOX] Load failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to load');
        setLoading(false);
      }
    };

    loadData();
  }, [solutionId]);

  // Esc to exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('/gallery');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const handleClose = () => navigate('/gallery');

  // Handle preset selection
  const handlePresetSelect = (preset: StudioSettings, presetKey: string) => {
    setEnvSettings(preset);
    setCurrentPreset(presetKey);
    try {
      localStorage.setItem('sandbox.environmentPreset', presetKey);
    } catch {
      // ignore
    }
    console.log('✅ [SANDBOX] Environment preset changed:', presetKey);
    setShowPresetModal(false);
  };

  const handleSceneReady = useCallback((scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
    sceneRef.current = scene;
    cameraRef.current = camera;
    console.log('✅ [SANDBOX] Scene ready');
  }, []);

  // --- Build + align puzzle (world-only after this point) ---
  useEffect(() => {
    if (!sceneRef.current || !placematData || !placedPieces.length || !cells.length || !gridKind) return;

    const scene = sceneRef.current;

    // Cleanup previous
    if (puzzleGroupRef.current) {
      scene.remove(puzzleGroupRef.current);
      puzzleGroupRef.current.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else mat.dispose();
        }
      });
      puzzleGroupRef.current = null;
    }
    if (placematGroupRef.current) {
      scene.remove(placematGroupRef.current);
      placematGroupRef.current = null;
    }
    if (debugHelpersRef.current) {
      scene.remove(debugHelpersRef.current);
      debugHelpersRef.current = null;
    }

    console.log('\n========== SANDBOX ALIGN (CLEAN) ==========');

    // 1) IJK -> WORLD once
    const view = computeViewTransforms(cells, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
    const M_world = mat4FromViewMatrix(view.M_world);

    // Build per-piece world spheres + bonds (physics-friendly)
    // Use pieceId for color assignment to match SceneCanvas behavior
    // Apply GEOMETRY_SCALE to convert to real-world meters
    const physicsPieces: PhysicsPiece[] = placedPieces.map((pp, idx) => {
      const spheres = pp.cells.map(c => {
        const v = new THREE.Vector3(c.i, c.j, c.k);
        v.applyMatrix4(M_world);
        return v;
      });
      return {
        id: pp.pieceId, // Use pieceId to match SceneCanvas color assignment
        spheres,
        bonds: buildBondsForPiece(pp.cells as unknown as IJK[])
      };
    });

    // Flatten all spheres
    const allWorld = physicsPieces.flatMap(p => p.spheres);

    console.log(`✅ WORLD spheres: ${allWorld.length} (from ${physicsPieces.length} pieces)`);

    // 2) Bottom layer (in WORLD)
    const { minY, bottom } = findBottomLayer(allWorld, SPHERE_RADIUS_LOCAL * 0.6);
    if (bottom.length < 2) {
      console.warn('❌ Bottom layer too small to compute neighbor direction');
      return;
    }

    // 3) Choose puzzle center: closest bottom sphere to bottom-layer centroid in XZ
    const bottomCentroid = new THREE.Vector3(0, minY, 0);
    for (const p of bottom) {
      bottomCentroid.x += p.x;
      bottomCentroid.z += p.z;
    }
    bottomCentroid.x /= bottom.length;
    bottomCentroid.z /= bottom.length;

    let puzzleCenter = bottom[0];
    let bestC = Infinity;
    for (const p of bottom) {
      const dx = p.x - bottomCentroid.x;
      const dz = p.z - bottomCentroid.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestC) {
        bestC = d;
        puzzleCenter = p;
      }
    }

    // 4) Board center: pick grid center closest to grid centroid (stable)
    const gridCentroid = new THREE.Vector3();
    for (const c of placematData.gridCenters) gridCentroid.add(c);
    gridCentroid.divideScalar(placematData.gridCenters.length);

    let boardCenter = placematData.gridCenters[0];
    let bestB = Infinity;
    for (const c of placematData.gridCenters) {
      const d = c.distanceTo(gridCentroid);
      if (d < bestB) {
        bestB = d;
        boardCenter = c;
      }
    }

    // 5) Translate puzzle center -> board center (WORLD translation)
    const T_center = new THREE.Vector3(
      boardCenter.x - puzzleCenter.x,
      boardCenter.y - puzzleCenter.y,
      boardCenter.z - puzzleCenter.z
    );

    // 6) Find nearest neighbor direction (in XZ) from center, after translation
    const bottomTranslated = bottom.map(p => p.clone().add(T_center));
    const puzzleCenterTranslated = puzzleCenter.clone().add(T_center);

    const puzzleNN = nearestToXZ(puzzleCenterTranslated, bottomTranslated, 1e-4);
    const boardNN = nearestToXZ(boardCenter, placematData.gridCenters, 1e-4);

    if (!puzzleNN || !boardNN) {
      console.warn('❌ Could not find nearest neighbors for puzzle/board');
      return;
    }

    const vPuzzle = puzzleNN.clone().sub(puzzleCenterTranslated);
    vPuzzle.y = 0;
    const vBoard = boardNN.clone().sub(boardCenter);
    vBoard.y = 0;

    const yawPuzzle = yawDegreesFromXZ(vPuzzle);
    const yawBoard = yawDegreesFromXZ(vBoard);

    let rawRotDeg = yawPuzzle - yawBoard; // NEGATED: rotate puzzle to match board
    if (FLIP_PUZZLE_HEADING) rawRotDeg += 180;

    const snapStep = (gridKind === 'square') ? 90 : 60;
    const snappedRotDeg = snapDegrees(rawRotDeg, snapStep);

    console.log(`📍 Puzzle center (WORLD): (${puzzleCenter.x.toFixed(3)}, ${puzzleCenter.y.toFixed(3)}, ${puzzleCenter.z.toFixed(3)})`);
    console.log(`🎯 Board center:          (${boardCenter.x.toFixed(3)}, ${boardCenter.y.toFixed(3)}, ${boardCenter.z.toFixed(3)})`);
    console.log(`➡️  vPuzzle yaw=${yawPuzzle.toFixed(2)}°, vBoard yaw=${yawBoard.toFixed(2)}°`);
    console.log(`🔄 RAW rot=${rawRotDeg.toFixed(2)}°  |  SNAPPED (${snapStep}°) = ${snappedRotDeg.toFixed(2)}°`);

    // 7) Build ONE alignment matrix:
    // v' = RotateAroundBoard( SnappedYaw ) * TranslateToCenter * v
    const rotRad = THREE.MathUtils.degToRad(rawRotDeg); // USE RAW (unsnapped) for testing

    const M_align = new THREE.Matrix4()
      .makeTranslation(boardCenter.x, boardCenter.y, boardCenter.z)
      .multiply(new THREE.Matrix4().makeRotationY(rotRad))
      .multiply(new THREE.Matrix4().makeTranslation(-boardCenter.x, -boardCenter.y, -boardCenter.z))
      .multiply(new THREE.Matrix4().makeTranslation(T_center.x, T_center.y, T_center.z));

    console.log('✅ Applied alignment matrix (TranslateToCenter then RotateAroundBoard)');

    // 8) Build puzzle visuals in WORLD, then apply M_align to every sphere position (final WORLD)
    const sphereGeometry = new THREE.SphereGeometry(SPHERE_RADIUS_LOCAL, SPHERE_SEGMENTS, SPHERE_SEGMENTS);

    const puzzleGroup = new THREE.Group();

    // Also output final physics-ready positions (world only)
    const physicsPiecesAligned: PhysicsPiece[] = physicsPieces.map(p => ({
      id: p.id,
      bonds: p.bonds,
      spheres: p.spheres.map(s => s.clone().applyMatrix4(M_align))
    }));

    // Create per-piece materials with unique colors and render spheres + bonds
    // Use preset settings for material properties (matching SceneCanvas behavior)
    const hdrIntensity = envSettings.lights?.hdr?.intensity ?? 1.0;
    
    // Clear piece groups for physics tracking
    pieceGroupsRef.current.clear();
    const physicsReadyPieces: PhysicsPiece[] = [];
    
    for (const p of physicsPiecesAligned) {
      const pieceColor = getPieceColor(p.id);
      const pieceMaterial = new THREE.MeshStandardMaterial({
        color: pieceColor,
        metalness: envSettings.material.metalness,
        roughness: envSettings.material.roughness,
        transparent: envSettings.material.opacity < 1.0,
        opacity: envSettings.material.opacity,
        envMapIntensity: hdrIntensity
      });

      // Create a group for this piece (for physics tracking)
      const pieceGroup = new THREE.Group();
      pieceGroup.name = `piece_${p.id}`;
      
      // Calculate piece centroid for group positioning
      const centroid = new THREE.Vector3();
      for (const pos of p.spheres) {
        centroid.add(pos);
      }
      centroid.divideScalar(p.spheres.length);
      pieceGroup.position.copy(centroid);

      // Render spheres for this piece (positions relative to centroid)
      const localSpherePositions: THREE.Vector3[] = [];
      for (const pos of p.spheres) {
        const localPos = pos.clone().sub(centroid);
        localSpherePositions.push(localPos);
        
        const sphere = new THREE.Mesh(sphereGeometry, pieceMaterial);
        sphere.position.copy(localPos);
        sphere.castShadow = true;
        sphere.receiveShadow = true;
        pieceGroup.add(sphere);
      }

      // Render bonds between adjacent spheres in this piece (using local positions)
      const { bondGroup } = buildBonds({
        spherePositions: localSpherePositions,
        radius: SPHERE_RADIUS_LOCAL,
        material: pieceMaterial,
        bondRadiusFactor: 0.35,
        thresholdFactor: 1.1,
        radialSegments: 32
      });
      bondGroup.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      pieceGroup.add(bondGroup);
      
      puzzleGroup.add(pieceGroup);
      
      // Track this piece group for physics
      pieceGroupsRef.current.set(p.id, pieceGroup);
      
      // Store physics-ready piece data (world positions for physics setup)
      physicsReadyPieces.push({
        id: p.id,
        spheres: p.spheres, // World positions
        bonds: p.bonds
      });
    }
    
    // Store puzzle group ref (will be added to worldScaleGroup later)
    puzzleGroupRef.current = puzzleGroup;

    // ===================== DEBUG: GRID vs PUZZLE COMPARISON (DISABLED) =====================
    /*
    // Helper group
    const compareHelpers = new THREE.Group();

    // --- Materials ---
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0xff00ff, // pink
      transparent: false,
      opacity: 1.0,
      wireframe: false,
      depthTest: false // Render on top
    });

    const puzzleMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00, // green
      transparent: false,
      opacity: 1.0,
      wireframe: false,
      depthTest: false // Render on top of everything
    });

    const helperGeom = new THREE.SphereGeometry(0.25, 16, 16); // Much larger

    // --- Draw ALL grid centers (pink) ---
    placematData.gridCenters.forEach(c => {
      const s = new THREE.Mesh(helperGeom, gridMat);
      s.position.copy(c);
      compareHelpers.add(s);
    });

    // --- Collect bottom-layer puzzle spheres AFTER alignment ---
    const bottomAligned: THREE.Vector3[] = [];

    for (const p of physicsPiecesAligned) {
      for (const s of p.spheres) {
        if (Math.abs(s.y - boardCenter.y) < SPHERE_RADIUS_LOCAL * 0.75) {
          bottomAligned.push(s.clone());
        }
      }
    }

    // --- Draw bottom puzzle spheres (green) ---
    console.log(`🟢 Creating ${bottomAligned.length} green spheres for bottom layer`);
    bottomAligned.forEach((p, i) => {
      const s = new THREE.Mesh(helperGeom, puzzleMat);
      s.position.copy(p); // Exact sphere center, no offset
      compareHelpers.add(s);
      if (i < 3) {
        console.log(`  green[${i}]: pos=(${s.position.x.toFixed(3)}, ${s.position.y.toFixed(3)}, ${s.position.z.toFixed(3)})`);
      }
    });
    console.log(`🟢 Green spheres added to compareHelpers group`);

    // Draw cyan lines from each puzzle bottom sphere to its nearest grid center
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.7 });

    for (const p of bottomAligned) {
      let bestG = placematData.gridCenters[0];
      let bestD2 = Infinity;
      for (const g of placematData.gridCenters) {
        const dx = p.x - g.x;
        const dz = p.z - g.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestG = g;
        }
      }
      const geom = new THREE.BufferGeometry().setFromPoints([p, bestG]);
      compareHelpers.add(new THREE.Line(geom, lineMat));
    }

    scene.add(compareHelpers);
    debugHelpersRef.current = compareHelpers;

    // --- Distance diagnostics ---
    function nearestGridDistance(p: THREE.Vector3): number {
      let best = Infinity;
      for (const g of placematData.gridCenters) {
        const dx = p.x - g.x;
        const dz = p.z - g.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < best) best = d;
      }
      return best;
    }

    console.log('================ GRID ↔ PUZZLE DISTANCES ================');

    const distances = bottomAligned.map(p => nearestGridDistance(p));

    distances.slice(0, 12).forEach((d, i) => {
      console.log(`puzzle→grid[${i}]: ${d.toFixed(6)}`);
    });

    const min = Math.min(...distances);
    const max = Math.max(...distances);
    const avg = distances.reduce((a, b) => a + b, 0) / distances.length;

    console.log(`DIST summary:
  count = ${distances.length}
  min   = ${min.toFixed(6)}
  avg   = ${avg.toFixed(6)}
  max   = ${max.toFixed(6)}
`);

    console.log('EXPECTED grid spacing ≈ 25.000');
    console.log('==========================================================');

    // ===================== DEBUG: NEAREST-NEIGHBOR SPACING CHECK =====================

    // Compute nearest-neighbor distance in XZ among a set of points
    function nearestNeighborStatsXZ(points: THREE.Vector3[], label: string) {
      const nn: number[] = [];

      for (let i = 0; i < points.length; i++) {
        let best = Infinity;
        const a = points[i];
        for (let j = 0; j < points.length; j++) {
          if (i === j) continue;
          const b = points[j];
          const dx = a.x - b.x;
          const dz = a.z - b.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > 1e-6 && d < best) best = d;
        }
        if (best < Infinity) nn.push(best);
      }

      nn.sort((a, b) => a - b);

      const min = nn[0];
      const max = nn[nn.length - 1];
      const avg = nn.reduce((s, v) => s + v, 0) / nn.length;

      // show the first few distinct values to see if it's snapping to 25 (or 0.707 etc)
      const sample = nn.slice(0, 12).map(v => v.toFixed(6)).join(', ');

      console.log(`================ NN SPACING (${label}) ================`);
      console.log(`count=${nn.length}`);
      console.log(`min=${min.toFixed(6)} avg=${avg.toFixed(6)} max=${max.toFixed(6)}`);
      console.log(`smallest 12: ${sample}`);
      console.log(`EXPECTED ≈ 25.000 (placemat) and ≈ 25.000 (puzzle bottom)`);
      console.log(`=======================================================`);
    }

    // 1) Board NN spacing (use all grid centers)
    nearestNeighborStatsXZ(placematData.gridCenters, 'BOARD gridCenters');

    // 2) Puzzle NN spacing (bottom aligned points only)
    nearestNeighborStatsXZ(bottomAligned, 'PUZZLE bottomAligned');
    */

    // 9) Add placemat with customizable material settings
    placematData.mesh.userData.isPlacemat = true;
    
    // Use placemat settings from modal (persisted in localStorage)
    const placematMaterial = new THREE.MeshStandardMaterial({
      color: placematSettings.color,
      metalness: placematSettings.metalness,
      roughness: placematSettings.roughness,
      transparent: placematSettings.opacity < 1.0,
      opacity: placematSettings.opacity,
      envMapIntensity: placematSettings.envMapIntensity
    });
    
    placematData.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Dispose old material and replace with new MeshStandardMaterial
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
        child.material = placematMaterial;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    placematGroupRef.current = placematData.mesh;
    
    // Get placemat bounds in LOCAL units (before scaling)
    const placematBoxLocal = new THREE.Box3().setFromObject(placematData.mesh);
    console.log('📦 [SANDBOX] Placemat bounds (local):', placematBoxLocal.min.toArray(), placematBoxLocal.max.toArray());

    // 10) Add visible ground plane (table surface) with shadows
    // Must match physics ground extent to cover removal circle
    const placematBoxSize = new THREE.Vector3();
    const placematBoxCenter = new THREE.Vector3();
    placematBoxLocal.getSize(placematBoxSize);
    placematBoxLocal.getCenter(placematBoxCenter);
    const placematDiagonal = Math.sqrt(placematBoxSize.x * placematBoxSize.x + placematBoxSize.z * placematBoxSize.z);
    const estimatedRemovalRadius = placematDiagonal / 2 + SPHERE_RADIUS_LOCAL * 10;
    const groundHalfExtent = Math.max(placematBoxSize.x * 5, placematBoxSize.z * 5, estimatedRemovalRadius * 1.5);
    const groundSize = groundHalfExtent * 2;
    const groundYLocal = placematBoxLocal.min.y - 0.05; // Small gap below placemat (local units)
    
    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: placematSettings.floorColor ?? '#3a3a3a',
      roughness: placematSettings.floorRoughness ?? 0.9,
      metalness: placematSettings.floorMetalness ?? 0.0,
    });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.name = 'groundMesh';
    groundMesh.rotation.x = -Math.PI / 2; // Lay flat
    groundMesh.position.set(placematBoxCenter.x, groundYLocal, placematBoxCenter.z);
    groundMesh.receiveShadow = true;

    // ============ WORLD SCALE GROUP ============
    // Create parent group containing all geometry, then scale to real-world meters
    const worldScaleGroup = new THREE.Group();
    worldScaleGroup.name = 'worldScaleGroup';
    
    // Add all content to the parent group
    worldScaleGroup.add(puzzleGroup);
    worldScaleGroup.add(placematData.mesh);
    worldScaleGroup.add(groundMesh);
    
    // Apply uniform scale to convert local units to real-world meters
    worldScaleGroup.scale.setScalar(WORLD_SCALE);
    
    // Add scaled group to scene
    scene.add(worldScaleGroup);
    
    console.log(`🌍 [SANDBOX] Applied WORLD_SCALE=${WORLD_SCALE.toFixed(4)} to worldScaleGroup`);
    
    // ============ EXTRACT WORLD-SCALED POSITIONS FOR PHYSICS ============
    // After scaling, extract the actual world positions for physics
    // These are the "golden" coordinates - never use IJK or local units after this
    const physicsReadyPiecesScaled: PhysicsPiece[] = [];
    
    for (const pieceGroup of pieceGroupsRef.current.values()) {
      const pieceId = pieceGroup.name.replace('piece_', '');
      const worldSpheres: THREE.Vector3[] = [];
      
      // Get world position of each sphere mesh in this piece
      pieceGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.SphereGeometry) {
          const worldPos = new THREE.Vector3();
          obj.getWorldPosition(worldPos);
          worldSpheres.push(worldPos);
        }
      });
      
      if (worldSpheres.length > 0) {
        physicsReadyPiecesScaled.push({
          id: pieceId,
          spheres: worldSpheres
        });
      }
    }
    
    // Store SCALED physics pieces - this is the golden reference for all physics
    physicsPiecesRef.current = physicsReadyPiecesScaled;
    console.log(`🎯 [SANDBOX] Physics pieces scaled to world: ${physicsReadyPiecesScaled.length} pieces`);
    if (physicsReadyPiecesScaled.length > 0 && physicsReadyPiecesScaled[0].spheres.length > 0) {
      const sample = physicsReadyPiecesScaled[0].spheres[0];
      console.log(`   Sample sphere world pos: (${sample.x.toFixed(4)}, ${sample.y.toFixed(4)}, ${sample.z.toFixed(4)})`);
    }
    
    // Store scaled placemat bounds for physics
    const placematBoxWorld = new THREE.Box3().setFromObject(placematData.mesh);
    placematBoundsRef.current = placematBoxWorld;
    console.log('📦 [SANDBOX] Placemat bounds (world):', placematBoxWorld.min.toArray().map(n => n.toFixed(4)), placematBoxWorld.max.toArray().map(n => n.toFixed(4)));
    
    // Store visual ground Y in WORLD units
    visualGroundYRef.current = groundYLocal * WORLD_SCALE;
    console.log('🟫 [SANDBOX] Visual ground at Y (world):', visualGroundYRef.current.toFixed(4));

    // 11) Debug helpers (all WORLD) - DISABLED
    if (false && showDebugHelpers) {
      const helpers = new THREE.Group();

      const mkSphere = (r: number, color: number) =>
        new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16), new THREE.MeshBasicMaterial({ color }));

      const mPuzzleCenter = mkSphere(0.18, 0xff0000);
      mPuzzleCenter.position.copy(puzzleCenter);
      helpers.add(mPuzzleCenter);

      const mBoardCenter = mkSphere(0.22, 0xffff00);
      mBoardCenter.position.copy(boardCenter);
      helpers.add(mBoardCenter);

      const mPuzzleCenterAligned = mkSphere(0.18, 0x00ff00);
      mPuzzleCenterAligned.position.copy(puzzleCenter.clone().applyMatrix4(M_align));
      helpers.add(mPuzzleCenterAligned);

      // Show direction vectors from board center after alignment
      const vPuzzleAligned = vPuzzle.clone();
      vPuzzleAligned.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotRad);

      // Thicker custom arrows
      const arrowLength = 3;
      const arrowRadius = 0.05; // Thick arrows
      const arrowHeadLength = 0.3;
      const arrowHeadRadius = 0.15;

      // Cyan arrow (board direction)
      const cyanArrow = new THREE.ArrowHelper(vBoard.clone().normalize(), boardCenter, arrowLength, 0x00ffff, arrowHeadLength, arrowHeadRadius);
      cyanArrow.line.material = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 5 });
      const cyanCyl = new THREE.Mesh(
        new THREE.CylinderGeometry(arrowRadius, arrowRadius, arrowLength - arrowHeadLength, 8),
        new THREE.MeshBasicMaterial({ color: 0x00ffff })
      );
      cyanCyl.position.copy(boardCenter);
      cyanCyl.position.add(vBoard.clone().normalize().multiplyScalar((arrowLength - arrowHeadLength) / 2));
      cyanCyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vBoard.clone().normalize());
      helpers.add(cyanCyl);
      helpers.add(cyanArrow);

      // Magenta arrow (puzzle direction)
      const magentaArrow = new THREE.ArrowHelper(vPuzzleAligned.clone().normalize(), boardCenter, arrowLength, 0xff00ff, arrowHeadLength, arrowHeadRadius);
      magentaArrow.line.material = new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 5 });
      const magentaCyl = new THREE.Mesh(
        new THREE.CylinderGeometry(arrowRadius, arrowRadius, arrowLength - arrowHeadLength, 8),
        new THREE.MeshBasicMaterial({ color: 0xff00ff })
      );
      magentaCyl.position.copy(boardCenter);
      magentaCyl.position.add(vPuzzleAligned.clone().normalize().multiplyScalar((arrowLength - arrowHeadLength) / 2));
      magentaCyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vPuzzleAligned.clone().normalize());
      helpers.add(magentaCyl);
      helpers.add(magentaArrow);

      scene.add(helpers);
      debugHelpersRef.current = helpers;

      console.log(`🔴 Puzzle center orig: ${puzzleCenter.toArray().map(n => n.toFixed(3)).join(', ')}`);
      console.log(`🟡 Board center:       ${boardCenter.toArray().map(n => n.toFixed(3)).join(', ')}`);
      console.log(`🟢 Puzzle center final:${mPuzzleCenterAligned.position.toArray().map(n => n.toFixed(3)).join(', ')}`);
    }

    // 11) This is the handoff point for physics:
    // physicsPiecesAligned is WORLD coords only.
    console.log('🧱 physicsPiecesAligned ready (WORLD only):', physicsPiecesAligned);

    console.log('========== SANDBOX READY ==========\n');
  }, [placematData, placedPieces, cells, showDebugHelpers, gridKind, placematSettings]);

  // Update materials when settings change (matching SceneCanvas behavior)
  useEffect(() => {
    const metalness = envSettings.material.metalness;
    const roughness = envSettings.material.roughness;
    const opacity = envSettings.material.opacity;
    const hdrIntensity = envSettings.lights?.hdr?.intensity ?? 1.0;

    // Update puzzle pieces
    if (puzzleGroupRef.current) {
      puzzleGroupRef.current.traverse(obj => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
          obj.material.metalness = metalness;
          obj.material.roughness = roughness;
          obj.material.opacity = opacity;
          obj.material.transparent = opacity < 1.0;
          obj.material.envMapIntensity = hdrIntensity;
          obj.material.needsUpdate = true;
        }
      });
    }

    // Update placemat with its own settings from PlacematSettingsModal
    if (placematGroupRef.current) {
      placematGroupRef.current.traverse(obj => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
          obj.material.color.set(placematSettings.color);
          obj.material.metalness = placematSettings.metalness;
          obj.material.roughness = placematSettings.roughness;
          obj.material.opacity = placematSettings.opacity;
          obj.material.transparent = placematSettings.opacity < 1.0;
          obj.material.envMapIntensity = placematSettings.envMapIntensity;
          obj.material.needsUpdate = true;
        }
      });
    }

    // Update floor material
    if (sceneRef.current) {
      sceneRef.current.traverse(obj => {
        if (obj instanceof THREE.Mesh && obj.name === 'groundMesh' && obj.material instanceof THREE.MeshStandardMaterial) {
          obj.material.color.set(placematSettings.floorColor ?? '#3a3a3a');
          obj.material.roughness = placematSettings.floorRoughness ?? 0.9;
          obj.material.metalness = placematSettings.floorMetalness ?? 0.0;
          obj.material.needsUpdate = true;
        }
      });
    }

    console.log('✅ [SANDBOX] Materials updated:', { metalness, roughness, opacity, hdrIntensity, placematSettings });
  }, [envSettings, placematSettings]);

  // Update piece colors when allRedPieces toggle changes (without rebuilding geometry)
  useEffect(() => {
    if (!puzzleGroupRef.current) return;
    
    // Iterate through piece groups and update their material colors
    for (const [pieceId, pieceGroup] of pieceGroupsRef.current) {
      const targetColor = allRedPieces ? '#ff0000' : getPieceColor(pieceId);
      pieceGroup.traverse(obj => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
          obj.material.color.set(targetColor);
          obj.material.needsUpdate = true;
        }
      });
    }
    
    console.log(`🔴 [SANDBOX] Piece colors updated: ${allRedPieces ? 'ALL RED' : 'individual colors'}`);
  }, [allRedPieces]);

  if (error) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#ff6b6b'
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.2rem', marginBottom: '16px' }}>⚠️ {error}</p>
          <button
            onClick={() => navigate('/gallery')}
            style={{
              background: '#444',
              border: '1px solid #666',
              color: '#fff',
              padding: '12px 24px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            {t('common.buttons.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100vw',
      height: '100dvh',
      position: 'relative',
      overflow: 'hidden',
      background: '#000'
    }}>
      {loading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.8)',
          zIndex: 100
        }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: '2rem', marginBottom: '16px' }}>⏳</div>
            <p>{t('loading.puzzle')}</p>
            <p style={{ fontSize: '0.9rem', color: '#888', marginTop: '8px' }}>
              SANDBOX - Clean Alignment
            </p>
          </div>
        </div>
      )}

      {!loading && (
        <>
          <SandboxScene onSceneReady={handleSceneReady} settings={envSettings} />

          <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            display: 'flex',
            gap: '8px',
            zIndex: 1000
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '14px',
              padding: '8px 12px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            }}>
              🧪 SANDBOX
            </div>

            {placematData && (
              <>
                <button
                  onClick={() => setShowDebugHelpers(!showDebugHelpers)}
                  title={showDebugHelpers ? "Hide debug helpers" : "Show debug helpers"}
                  style={{
                    background: showDebugHelpers
                      ? 'linear-gradient(135deg, #10b981, #059669)'
                      : 'linear-gradient(135deg, #6b7280, #4b5563)',
                    color: '#fff',
                    fontWeight: 700,
                    border: 'none',
                    fontSize: '22px',
                    padding: '8px 12px',
                    minWidth: '40px',
                    minHeight: '40px',
                    borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                    cursor: 'pointer'
                  }}
                >
                  🐛
                </button>
                
                {/* All Red Pieces Toggle */}
                <button
                  onClick={() => setAllRedPieces(!allRedPieces)}
                  title={allRedPieces ? "Show individual colors" : "Make all pieces red"}
                  style={{
                    background: allRedPieces
                      ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                      : 'linear-gradient(135deg, #6b7280, #4b5563)',
                    color: '#fff',
                    fontWeight: 700,
                    border: 'none',
                    fontSize: '22px',
                    padding: '8px 12px',
                    minWidth: '40px',
                    minHeight: '40px',
                    borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                    cursor: 'pointer'
                  }}
                >
                  🔴
                </button>
                
                {/* Placemat Material Settings Button */}
                <button
                  onClick={() => setShowPlacematModal(true)}
                  title="Placemat Material Settings"
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#fff',
                    fontWeight: 700,
                    border: 'none',
                    fontSize: '22px',
                    padding: '8px 12px',
                    minWidth: '40px',
                    minHeight: '40px',
                    borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                    cursor: 'pointer'
                  }}
                >
                  🎨
                </button>
              </>
            )}
            
            {/* Physics Controls */}
            {placematData && (
              <div style={{
                display: 'flex',
                gap: '8px',
                marginLeft: '16px',
                padding: '8px',
                background: 'rgba(0, 0, 0, 0.4)',
                borderRadius: '8px',
                alignItems: 'center'
              }}>
                <span style={{ color: '#fff', fontSize: '12px', fontWeight: 600 }}>⚛️ PHYSICS</span>
                
                {/* Initialize Physics */}
                {physics.state === 'idle' && (
                  <button
                    onClick={async () => {
                      await physics.initialize();
                      if (placematBoundsRef.current) {
                        // Use the EXACT same Y as the visual ground plane
                        const floorTopY = visualGroundYRef.current;
                        console.log('⚛️ [PHYSICS] Using visual ground Y for physics:', floorTopY.toFixed(4));
                        physics.setupWorld(placematBoundsRef.current, floorTopY);
                        physics.addPieces(physicsPiecesRef.current, pieceGroupsRef.current);
                      }
                    }}
                    title="Initialize Physics"
                    style={{
                      background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                      color: '#fff',
                      fontWeight: 600,
                      border: 'none',
                      fontSize: '12px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    Init
                  </button>
                )}
                
                {/* Drop Pieces - two-press: first elevates, second drops */}
                {(physics.state === 'ready' || physics.state === 'elevated') && (
                  <button
                    onClick={() => physics.startDropExperiment()}
                    title={physics.state === 'elevated' ? "Drop pieces now" : "Elevate pieces to drop height"}
                    style={{
                      background: physics.state === 'elevated' 
                        ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
                        : 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#fff',
                      fontWeight: 600,
                      border: 'none',
                      fontSize: '12px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    {physics.state === 'elevated' ? '🚀 Drop!' : '⬆️ Elevate'}
                  </button>
                )}
                
                {/* Remove Pieces */}
                {physics.state === 'settled' && (
                  <button
                    onClick={() => physics.startRemovalExperiment()}
                    title="Remove pieces one by one"
                    style={{
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      color: '#fff',
                      fontWeight: 600,
                      border: 'none',
                      fontSize: '12px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 Remove
                  </button>
                )}
                
                {/* Reassemble (Phase 3) */}
                {physics.state === 'completed' && (
                  <button
                    onClick={() => physics.startReassemblyExperiment()}
                    title="Reassemble puzzle piece by piece"
                    style={{
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#fff',
                      fontWeight: 600,
                      border: 'none',
                      fontSize: '12px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    🔧 Reassemble
                  </button>
                )}
                
                {/* Reset */}
                {(physics.state === 'settled' || physics.state === 'completed' || physics.state === 'removing' || physics.state === 'reassembling' || physics.state === 'reassembled') && (
                  <button
                    onClick={() => physics.fullReset()}
                    title="Full reset - re-initialize physics"
                    style={{
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                      color: '#fff',
                      fontWeight: 600,
                      border: 'none',
                      fontSize: '12px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    ↩️ Reset
                  </button>
                )}
                
                {/* Status */}
                <span style={{ 
                  color: '#94a3b8', 
                  fontSize: '11px',
                  marginLeft: '8px'
                }}>
                  {physics.state === 'idle' && '⚪ Idle'}
                  {physics.state === 'initializing' && '🔄 Loading...'}
                  {physics.state === 'ready' && '✅ Ready'}
                  {physics.state === 'dropping' && `⬇️ Dropping...`}
                  {physics.state === 'settled' && `✅ Settled (${physics.settledCount})`}
                  {physics.state === 'removing' && `🔄 Removing ${physics.removedCount}/${physics.totalPieces}`}
                  {physics.state === 'completed' && '✅ Removed'}
                  {physics.state === 'reassembling' && `🔧 Placing ${physics.placedCount}/${physics.totalPieces}`}
                  {physics.state === 'reassembled' && '✅ Reassembled!'}
                </span>
                
                {/* Physics Settings Button */}
                <button
                  onClick={() => setShowPhysicsModal(true)}
                  title="Physics Settings"
                  style={{
                    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                    color: '#fff',
                    fontWeight: 600,
                    border: 'none',
                    fontSize: '12px',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    marginLeft: '8px'
                  }}
                >
                  ⚙️
                </button>
              </div>
            )}

            {/* Preset Selector Button */}
            <button
              onClick={() => setShowPresetModal(true)}
              title="Environment Presets"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#fff',
                fontWeight: 700,
                border: 'none',
                fontSize: '22px',
                padding: '8px 12px',
                minWidth: '40px',
                minHeight: '40px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                cursor: 'pointer'
              }}
            >
              ⚙️
            </button>

            {/* Close Button */}
            <button
              onClick={() => navigate('/gallery')}
              title="Back to Gallery"
              style={{
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                color: '#fff',
                fontWeight: 700,
                border: 'none',
                fontSize: '22px',
                padding: '8px 12px',
                minWidth: '40px',
                minHeight: '40px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>
        </>
      )}

      {/* Preset Selector Modal */}
      <PresetSelectorModal
        isOpen={showPresetModal}
        currentPreset={currentPreset}
        onClose={() => setShowPresetModal(false)}
        onSelectPreset={handlePresetSelect}
      />

      {/* Placemat Material Settings Modal */}
      <PlacematSettingsModal
        isOpen={showPlacematModal}
        onClose={() => setShowPlacematModal(false)}
        settings={placematSettings}
        onSettingsChange={setPlacematSettings}
      />

      {/* Physics Settings Modal */}
      <PhysicsSettingsModal
        isOpen={showPhysicsModal}
        onClose={() => setShowPhysicsModal(false)}
        settings={physicsSettings}
        onSettingsChange={setPhysicsSettings}
        physicsState={physics.state}
        onReinitialize={async () => {
          // Fully destroy physics and return to idle
          physics.fullReset();
          // Re-initialize with current settings
          await physics.initialize();
          if (placematBoundsRef.current) {
            // Use the EXACT same Y as the visual ground plane
            const floorTopY = visualGroundYRef.current;
            console.log('⚛️ [PHYSICS] Re-init using visual ground Y:', floorTopY.toFixed(4));
            physics.setupWorld(placematBoundsRef.current, floorTopY);
            physics.addPieces(physicsPiecesRef.current, pieceGroupsRef.current);
          }
        }}
        onDropTest={() => {
          physics.startDropExperiment();
        }}
        onRemoveTest={() => {
          physics.startRemovalExperiment();
        }}
      />
    </div>
  );
}
