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

const T_ijk_to_xyz = [
  [0.5, 0.5, 0, 0],
  [0.5, 0, 0.5, 0],  
  [0, 0.5, 0.5, 0],
  [0, 0, 0, 1]
];

const SPHERE_RADIUS = 0.354;
const SPHERE_SEGMENTS = 64;

interface PuzzleViewSandboxPageProps {}

export function PuzzleViewSandboxPage({}: PuzzleViewSandboxPageProps) {
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
  
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const puzzleGroupRef = useRef<THREE.Group | null>(null);
  const placematGroupRef = useRef<THREE.Group | null>(null);
  const debugHelpersRef = useRef<THREE.Group | null>(null);

  // Load puzzle and solutions data
  useEffect(() => {
    if (!solutionId) {
      setError('No solution ID provided');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        console.log(`🎯 [SANDBOX] Loading solution ${solutionId} for geometry verification`);
        setLoading(true);
        setError(null);

        const puzzleData = await getPuzzleById(solutionId);
        if (!puzzleData) throw new Error('Puzzle not found');
        console.log('✅ [SANDBOX] Puzzle loaded:', puzzleData.name);

        const solutionRecords = await getPuzzleSolutions(puzzleData.id);
        setSolutions(solutionRecords);

        const solutionWithImage = solutionRecords.find(s => s.thumbnail_url);
        
        if (solutionWithImage) {
          console.log('✅ [SANDBOX] Found solution with image, showing solution view');
          
          const puzzleCells = puzzleData.geometry || [];
          const view = computeViewTransforms(puzzleCells, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
          const gridType = detectGridType(puzzleCells, view);
          console.log('🔍 [SANDBOX] Grid detected:', gridType.type, `(confidence: ${gridType.confidence.toFixed(2)})`);
          
          setCells(puzzleCells);

          // Load placemat
          if (gridType.type) {
            loadPlacemat(gridType.type)
              .then(data => {
                setPlacematData(data);
                console.log('✅ [SANDBOX] Placemat loaded successfully');
              })
              .catch(err => {
                console.error('❌ [SANDBOX] Failed to load placemat:', err);
              });
          }

          if (solutionWithImage.placed_pieces) {
            setPlacedPieces(solutionWithImage.placed_pieces as PlacedPiece[]);
            console.log('✅ [SANDBOX] Placed pieces loaded:', solutionWithImage.placed_pieces.length);
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('❌ [SANDBOX] Failed to load puzzle data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load puzzle');
        setLoading(false);
      }
    };

    loadData();
  }, [solutionId]);

  // Handle Esc key to exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate('/gallery');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const handleClose = () => {
    navigate('/gallery');
  };

  // Handle scene ready
  const handleSceneReady = (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
    sceneRef.current = scene;
    cameraRef.current = camera;
    console.log('✅ [SANDBOX] Scene ready');
  };

  // Build and align puzzle when data is ready
  useEffect(() => {
    if (!sceneRef.current || !placematData || !placedPieces.length || !cells.length) return;

    const scene = sceneRef.current;

    // Clean up existing puzzle group
    if (puzzleGroupRef.current) {
      scene.remove(puzzleGroupRef.current);
      puzzleGroupRef.current.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
      });
      puzzleGroupRef.current = null;
    }

    // Clean up existing placemat
    if (placematGroupRef.current) {
      scene.remove(placematGroupRef.current);
      placematGroupRef.current = null;
    }

    // Clean up debug helpers
    if (debugHelpersRef.current) {
      scene.remove(debugHelpersRef.current);
      debugHelpersRef.current = null;
    }

    console.log('\n========== BUILDING PUZZLE ==========');

    // 1. COMPUTE ORIGINAL VIEW TRANSFORM
    const view = computeViewTransforms(cells, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
    const M_world_flat = view.M_world.flat();
    const M_world_transposed = [
      M_world_flat[0], M_world_flat[4], M_world_flat[8], M_world_flat[12],
      M_world_flat[1], M_world_flat[5], M_world_flat[9], M_world_flat[13],
      M_world_flat[2], M_world_flat[6], M_world_flat[10], M_world_flat[14],
      M_world_flat[3], M_world_flat[7], M_world_flat[11], M_world_flat[15]
    ];
    const M_world_original = new THREE.Matrix4().fromArray(M_world_transposed);

    // 2. CONVERT TO ORIGINAL WORLD POSITIONS (for alignment calculation)
    const originalWorldPositions: THREE.Vector3[] = [];
    placedPieces.forEach(piece => {
      piece.cells.forEach(cell => {
        const pos = new THREE.Vector3(cell.i, cell.j, cell.k);
        pos.applyMatrix4(M_world_original);
        originalWorldPositions.push(pos);
      });
    });

    console.log(`✅ Converted ${originalWorldPositions.length} cells to world positions`);

    // 3. FIND BOTTOM LAYER CENTER (using original positions for alignment calculation)
    let minY = Infinity;
    originalWorldPositions.forEach(p => { minY = Math.min(minY, p.y); });
    
    const bottomLayer = originalWorldPositions.filter(p => Math.abs(p.y - minY) <= SPHERE_RADIUS * 0.5);
    
    const bottomCenter = new THREE.Vector3();
    bottomLayer.forEach(p => {
      bottomCenter.x += p.x;
      bottomCenter.z += p.z;
    });
    bottomCenter.x /= bottomLayer.length;
    bottomCenter.z /= bottomLayer.length;
    bottomCenter.y = minY;

    let puzzleCenter = bottomLayer[0];
    let minDist = Infinity;
    bottomLayer.forEach(p => {
      const dist = Math.sqrt((p.x - bottomCenter.x) ** 2 + (p.z - bottomCenter.z) ** 2);
      if (dist < minDist) {
        minDist = dist;
        puzzleCenter = p;
      }
    });

    console.log(`📍 Puzzle center sphere: (${puzzleCenter.x.toFixed(3)}, ${puzzleCenter.y.toFixed(3)}, ${puzzleCenter.z.toFixed(3)})`);

    // 5. FIND BOARD CENTER
    const gridCenter = new THREE.Vector3();
    placematData.gridCenters.forEach(c => gridCenter.add(c));
    gridCenter.divideScalar(placematData.gridCenters.length);

    let boardCenter = placematData.gridCenters[0];
    let minGridDist = Infinity;
    placematData.gridCenters.forEach(c => {
      const dist = c.distanceTo(gridCenter);
      if (dist < minGridDist) {
        minGridDist = dist;
        boardCenter = c;
      }
    });

    console.log(`🎯 Board center: (${boardCenter.x.toFixed(3)}, ${boardCenter.y.toFixed(3)}, ${boardCenter.z.toFixed(3)})`);

    // 6. TRANSLATE PUZZLE TO BOARD CENTER FIRST
    const centerTranslation = new THREE.Vector3(
      boardCenter.x - puzzleCenter.x,
      boardCenter.y - puzzleCenter.y,
      boardCenter.z - puzzleCenter.z
    );

    // Translate all bottom layer spheres to centered position
    const centeredBottomLayer = bottomLayer.map(p => new THREE.Vector3(
      p.x + centerTranslation.x,
      p.y + centerTranslation.y,
      p.z + centerTranslation.z
    ));

    console.log(`📍 Translated puzzle center to: (${(puzzleCenter.x + centerTranslation.x).toFixed(3)}, ${(puzzleCenter.y + centerTranslation.y).toFixed(3)}, ${(puzzleCenter.z + centerTranslation.z).toFixed(3)})`);

    // 7. FIND NEIGHBORS FROM CENTERED POSITION (both from board center now)
    // Find all neighbors to board center from centered puzzle
    const puzzleNeighbors = centeredBottomLayer
      .map(p => ({
        pos: p,
        dist: Math.sqrt((p.x - boardCenter.x) ** 2 + (p.z - boardCenter.z) ** 2),
        angle: Math.atan2(p.z - boardCenter.z, p.x - boardCenter.x) * 180 / Math.PI
      }))
      .filter(n => n.dist > 0.1)
      .sort((a, b) => a.dist - b.dist);

    // Find all neighbors to board center and their angles
    const boardNeighbors = placematData.gridCenters
      .map(c => ({
        pos: c,
        dist: Math.sqrt((c.x - boardCenter.x) ** 2 + (c.z - boardCenter.z) ** 2),
        angle: Math.atan2(c.z - boardCenter.z, c.x - boardCenter.x) * 180 / Math.PI
      }))
      .filter(n => n.dist > 0.1)
      .sort((a, b) => a.dist - b.dist);

    console.log(`🔍 Found ${puzzleNeighbors.length} puzzle neighbors, ${boardNeighbors.length} board neighbors`);
    console.log(`   Puzzle neighbors (first 6):`);
    puzzleNeighbors.slice(0, 6).forEach((n, i) => {
      console.log(`   [${i}] dist=${n.dist.toFixed(3)}, angle=${n.angle.toFixed(1)}°`);
    });
    console.log(`   Board neighbors (first 6):`);
    boardNeighbors.slice(0, 6).forEach((n, i) => {
      console.log(`   [${i}] dist=${n.dist.toFixed(3)}, angle=${n.angle.toFixed(1)}°`);
    });

    // Find best matching neighbors for triangular grid alignment
    // We want neighbors that give rotation close to 0°, ±60°, ±120°, or 180°
    let bestPuzzleNeighbor = puzzleNeighbors[0];
    let bestBoardNeighbor = boardNeighbors[0];
    let bestRotation = Infinity;

    // Try different neighbor combinations to find best triangular alignment
    const targetRotations = [0, 60, -60, 120, -120, 180];
    puzzleNeighbors.slice(0, 6).forEach(pn => {
      boardNeighbors.slice(0, 6).forEach(bn => {
        const rotation = bn.angle - pn.angle;
        const normalizedRot = ((rotation + 180) % 360) - 180; // Normalize to -180 to 180
        
        // Find closest target rotation
        const closestTarget = targetRotations.reduce((prev, curr) => 
          Math.abs(curr - normalizedRot) < Math.abs(prev - normalizedRot) ? curr : prev
        );
        
        const error = Math.abs(normalizedRot - closestTarget);
        if (error < Math.abs(bestRotation)) {
          bestRotation = normalizedRot;
          bestPuzzleNeighbor = pn;
          bestBoardNeighbor = bn;
        }
      });
    });

    console.log(`📍 Best match: puzzle at ${bestPuzzleNeighbor.angle.toFixed(1)}° → board at ${bestBoardNeighbor.angle.toFixed(1)}°`);
    console.log(`📍 This gives rotation: ${bestRotation.toFixed(1)}°`);

    // 7. USE THE CALCULATED ROTATION FROM BEST MATCH
    // Convert from degrees to radians
    const rotationAngle = bestRotation * Math.PI / 180;

    console.log(`🔄 Rotation angle: ${THREE.MathUtils.radToDeg(rotationAngle).toFixed(2)}°`);

    // 8. CREATE ALIGNMENT TRANSFORM
    // Step 1: Create rotation-around-board-center transform
    // This is: translate board to origin, rotate, translate back
    const rotateAroundBoard = new THREE.Matrix4()
      .makeTranslation(boardCenter.x, boardCenter.y, boardCenter.z)
      .multiply(new THREE.Matrix4().makeRotationY(rotationAngle))
      .multiply(new THREE.Matrix4().makeTranslation(-boardCenter.x, -boardCenter.y, -boardCenter.z));

    // Step 3: Combine: first translate centers, then rotate around board center
    const alignmentTransform = new THREE.Matrix4()
      .copy(rotateAroundBoard)
      .multiply(new THREE.Matrix4().makeTranslation(centerTranslation.x, centerTranslation.y, centerTranslation.z));

    console.log(`📍 Center translation: (${centerTranslation.x.toFixed(3)}, ${centerTranslation.y.toFixed(3)}, ${centerTranslation.z.toFixed(3)})`);
    console.log(`📍 Rotation around board center: ${THREE.MathUtils.radToDeg(rotationAngle).toFixed(2)}°`);

    // 10. APPLY ALIGNMENT TO M_WORLD
    const M_world_aligned = new THREE.Matrix4().multiplyMatrices(alignmentTransform, M_world_original);

    console.log('\n========== TRANSFORMS APPLIED ==========');
    console.log(`Rotation: ${THREE.MathUtils.radToDeg(rotationAngle).toFixed(2)}° around board center`);
    console.log(`Center translation: (${centerTranslation.x.toFixed(3)}, ${centerTranslation.y.toFixed(3)}, ${centerTranslation.z.toFixed(3)})`);

    // 11. CREATE ALIGNED WORLD POSITIONS BY TRANSFORMING EACH POSITION
    const alignedWorldPositions: THREE.Vector3[] = [];
    placedPieces.forEach(piece => {
      piece.cells.forEach(cell => {
        const pos = new THREE.Vector3(cell.i, cell.j, cell.k);
        pos.applyMatrix4(M_world_aligned);
        alignedWorldPositions.push(pos);
      });
    });

    // 12. CREATE PUZZLE GROUP WITH SPHERES AT ALIGNED POSITIONS
    const puzzleGroup = new THREE.Group();
    const sphereGeometry = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      metalness: 0.3,
      roughness: 0.4,
    });

    alignedWorldPositions.forEach(pos => {
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.position.copy(pos);
      sphere.castShadow = true;
      sphere.receiveShadow = true;
      puzzleGroup.add(sphere);
    });

    console.log(`✅ Created ${puzzleGroup.children.length} aligned spheres`);
    console.log(`   Sample aligned positions (first 3):`);
    alignedWorldPositions.slice(0, 3).forEach((pos, i) => {
      console.log(`   [${i}] (${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)})`);
    });

    // 14. ADD PUZZLE TO SCENE
    scene.add(puzzleGroup);
    puzzleGroupRef.current = puzzleGroup;

    // 11. ADD PLACEMAT
    placematData.mesh.userData.isPlacemat = true;
    placematData.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissive = new THREE.Color(0x1e40af);
        child.material.emissiveIntensity = 0.3;
      }
    });
    scene.add(placematData.mesh);
    placematGroupRef.current = placematData.mesh;

    // 12. ADD DEBUG HELPERS
    if (showDebugHelpers) {
      const helpersGroup = new THREE.Group();

      // Grid center spheres
      const gridGeometry = new THREE.SphereGeometry(0.05, 16, 16);
      const gridMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff00ff, 
        wireframe: true,
        transparent: true,
        opacity: 0.6
      });

      placematData.gridCenters.forEach((center) => {
        const material = center.equals(boardCenter)
          ? new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true, transparent: true, opacity: 0.8 })
          : gridMaterial;
        const sphere = new THREE.Mesh(gridGeometry, material);
        sphere.position.copy(center);
        helpersGroup.add(sphere);
      });

      // Axis arrows
      helpersGroup.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 10, 0xff0000));
      helpersGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 10, 0x0000ff));

      // Show puzzle center (RED sphere)
      const puzzleCenterMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );
      puzzleCenterMarker.position.copy(puzzleCenter);
      helpersGroup.add(puzzleCenterMarker);

      // Show board center (YELLOW sphere - larger)
      const boardCenterMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffff00 })
      );
      boardCenterMarker.position.copy(boardCenter);
      helpersGroup.add(boardCenterMarker);

      // Show transformed puzzle center (where it SHOULD be after transforms)
      // Apply the alignment transform to puzzle center to verify
      const transformedPuzzleCenter = puzzleCenter.clone();
      transformedPuzzleCenter.applyMatrix4(alignmentTransform);
      const transformedMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x00ff00 })
      );
      transformedMarker.position.copy(transformedPuzzleCenter);
      helpersGroup.add(transformedMarker);

      // Line from puzzle center to board center
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff });
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([puzzleCenter, boardCenter]);
      const line = new THREE.Line(lineGeometry, lineMaterial);
      helpersGroup.add(line);

      scene.add(helpersGroup);
      debugHelpersRef.current = helpersGroup;
      console.log('✅ Debug helpers added');
      console.log(`   🔴 Puzzle center (original): (${puzzleCenter.x.toFixed(3)}, ${puzzleCenter.y.toFixed(3)}, ${puzzleCenter.z.toFixed(3)})`);
      console.log(`   🟡 Board center (target): (${boardCenter.x.toFixed(3)}, ${boardCenter.y.toFixed(3)}, ${boardCenter.z.toFixed(3)})`);
      console.log(`   🟢 Transformed puzzle center: (${transformedPuzzleCenter.x.toFixed(3)}, ${transformedPuzzleCenter.y.toFixed(3)}, ${transformedPuzzleCenter.z.toFixed(3)})`);
    }

    console.log('========== PUZZLE READY ==========\n');
  }, [sceneRef.current, placematData, placedPieces, cells, showDebugHelpers]);

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
            onClick={handleClose}
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
              SANDBOX - Geometry Verification
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
            <div
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '14px',
                padding: '8px 12px',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
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
              onClick={handleClose}
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
