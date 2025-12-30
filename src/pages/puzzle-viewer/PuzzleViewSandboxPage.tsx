import { useEffect, useState, useRef } from 'react';
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

const T_ijk_to_xyz = [
  [0.5, 0.5, 0, 0],
  [0.5, 0, 0.5, 0],
  [0, 0.5, 0.5, 0],
  [0, 0, 0, 1]
];

// Visuals only (physics will use your own sizes later)
const SPHERE_RADIUS = 0.354;
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

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const puzzleGroupRef = useRef<THREE.Group | null>(null);
  const placematGroupRef = useRef<THREE.Group | null>(null);
  const debugHelpersRef = useRef<THREE.Group | null>(null);

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

  const handleSceneReady = (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
    sceneRef.current = scene;
    cameraRef.current = camera;
    console.log('✅ [SANDBOX] Scene ready');
  };

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
    const physicsPieces: PhysicsPiece[] = placedPieces.map((pp, idx) => {
      const spheres = pp.cells.map(c => {
        const v = new THREE.Vector3(c.i, c.j, c.k);
        v.applyMatrix4(M_world);
        return v;
      });
      return {
        id: (pp as any).id ?? `piece_${idx}`,
        spheres,
        bonds: buildBondsForPiece(pp.cells as unknown as IJK[])
      };
    });

    // Flatten all spheres
    const allWorld = physicsPieces.flatMap(p => p.spheres);

    console.log(`✅ WORLD spheres: ${allWorld.length} (from ${physicsPieces.length} pieces)`);

    // 2) Bottom layer (in WORLD)
    const { minY, bottom } = findBottomLayer(allWorld, SPHERE_RADIUS * 0.6);
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
    const sphereGeometry = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);

    const puzzleGroup = new THREE.Group();

    // Also output final physics-ready positions (world only)
    const physicsPiecesAligned: PhysicsPiece[] = physicsPieces.map(p => ({
      id: p.id,
      bonds: p.bonds,
      spheres: p.spheres.map(s => s.clone().applyMatrix4(M_align))
    }));

    // Create per-piece materials with unique colors and render spheres + bonds
    for (const p of physicsPiecesAligned) {
      const pieceColor = getPieceColor(p.id);
      const pieceMaterial = new THREE.MeshStandardMaterial({
        color: pieceColor,
        metalness: 0.9,
        roughness: 0.15,
        transparent: false,
        opacity: 1.0,
        envMapIntensity: 1.5
      });

      // Render spheres for this piece
      for (const pos of p.spheres) {
        const sphere = new THREE.Mesh(sphereGeometry, pieceMaterial);
        sphere.position.copy(pos);
        sphere.castShadow = true;
        sphere.receiveShadow = true;
        puzzleGroup.add(sphere);
      }

      // Render bonds between adjacent spheres in this piece
      const { bondGroup } = buildBonds({
        spherePositions: p.spheres,
        radius: SPHERE_RADIUS,
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
      puzzleGroup.add(bondGroup);
    }

    scene.add(puzzleGroup);
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
        if (Math.abs(s.y - boardCenter.y) < SPHERE_RADIUS * 0.75) {
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

    // 9) Add placemat
    placematData.mesh.userData.isPlacemat = true;
    scene.add(placematData.mesh);
    placematGroupRef.current = placematData.mesh;

    // 10) Debug helpers (all WORLD) - DISABLED
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
  }, [placematData, placedPieces, cells, showDebugHelpers, gridKind]);

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
          <SandboxScene onSceneReady={handleSceneReady} />

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
            )}

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
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>
        </>
      )}
    </div>
  );
}
