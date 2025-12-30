import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { SandboxScene } from './SandboxScene';
import { getPuzzleById, type PuzzleRecord } from '../../api/puzzles';
import { getPuzzleSolutions, type PuzzleSolutionRecord } from '../../api/solutions';
import { computeViewTransforms } from '../../services/ViewTransforms';
import type { IJK } from '../../types/shape';
import type { PlacedPiece } from '../solve/types/manualSolve';
import { detectGridType } from './placemat/gridDetection';
import { loadPlacemat, type PlacematData } from './placemat/placematLoader';

const SPHERE_RADIUS = 0.354;
const SPHERE_SEGMENTS = 64;

interface PuzzleViewSandboxPageProps {}

export function PuzzleViewSandboxPage({}: PuzzleViewSandboxPageProps) {
  const { solutionId } = useParams<{ solutionId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [puzzle, setPuzzle] = useState<PuzzleRecord | null>(null);
  const [solutions, setSolutions] = useState<PuzzleSolutionRecord[]>([]);
  const [cells, setCells] = useState<IJK[]>([]);
  const [placedPieces, setPlacedPieces] = useState<PlacedPiece[]>([]);
  const [showDebugHelpers, setShowDebugHelpers] = useState(true);
  const [placematData, setPlacematData] = useState<PlacematData | null>(null);
  
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const puzzleGroupRef = useRef<THREE.Group | null>(null);
  const placematGroupRef = useRef<THREE.Group | null>(null);

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

        // For now, use solutionId as puzzleId (will be updated when proper solution loading added)
        const puzzleData = await getPuzzleById(solutionId);
        if (!puzzleData) {
          throw new Error('Puzzle not found');
        }
        setPuzzle(puzzleData);

        // Load solutions
        const solutionsData = await getPuzzleSolutions(solutionId);
        setSolutions(solutionsData || []);

        // Determine view mode: prefer solution with thumbnail_url
        const solutionWithImage = solutionsData?.find(s => s.thumbnail_url);
        if (solutionWithImage) {
          setViewMode('solution');
          console.log('✅ [SANDBOX] Found solution with image, showing solution view');
        } else {
          setViewMode('shape');
          console.log('📦 [SANDBOX] No solution images, showing shape view');
        }

        // Set up geometry
        if (puzzleData.geometry && Array.isArray(puzzleData.geometry)) {
          const puzzleCells = puzzleData.geometry as IJK[];
          setCells(puzzleCells);
          
          // Compute view transforms with proper FCC lattice orientation
          // Use groundMode: 'none' to disable Y-offset - placemat defines ground plane
          const transforms = computeViewTransforms(
            puzzleCells,
            ijkToXyz,
            T_ijk_to_xyz,
            quickHullWithCoplanarMerge,
            { groundMode: 'none' }
          );
          setView(transforms);
          console.log('✅ [SANDBOX] View transforms computed');
          
          // Detect grid type and load appropriate placemat
          const gridDetection = detectGridType(puzzleCells, transforms);
          console.debug(`[SANDBOX] Detected grid type: ${gridDetection.type}`);
          console.log(`🔍 [SANDBOX] Grid detected: ${gridDetection.type} (confidence: ${gridDetection.confidence.toFixed(2)})`);
          
          loadPlacemat(gridDetection.type)
            .then(data => {
              setPlacematData(data);
              console.log('✅ [SANDBOX] Placemat loaded successfully');
            })
            .catch(err => {
              console.error('❌ [SANDBOX] Failed to load placemat:', err);
            });
        }

        // Set up placed pieces if solution exists
        if (solutionWithImage && solutionWithImage.placed_pieces) {
          setPlacedPieces(solutionWithImage.placed_pieces as PlacedPiece[]);
          console.log('✅ [SANDBOX] Placed pieces loaded:', solutionWithImage.placed_pieces.length);
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

  // Handle preset selection
  const handlePresetSelect = (preset: StudioSettings, presetKey: string) => {
    setEnvSettings(preset);
    setCurrentPreset(presetKey);
    try {
      localStorage.setItem('puzzleViewer.environmentPreset', presetKey);
    } catch {
      // ignore
    }
    console.log('✅ [SANDBOX] Environment preset changed:', presetKey);
    setShowPresetModal(false);
  };

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

  // Handle scene ready - capture scene objects for placemat placement
  const handleSceneReady = (objects: {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    spheresGroup: THREE.Group;
  }) => {
    sceneObjectsRef.current = objects;
    console.log('✅ [SANDBOX] Scene ready, objects captured');
  };

  // Helper function to create grid center visualization spheres
  const createGridHelperSpheres = (
    gridCenters: THREE.Vector3[],
    gridType: 'square' | 'triangular'
  ): THREE.Group => {
    const group = new THREE.Group();
    const MM_TO_UNITS = 0.708 / 25; // conversion from mm to puzzle units
    const radiusMM = 5; // 5mm radius as requested
    const size = radiusMM * MM_TO_UNITS; // convert to puzzle units
    const color = gridType === 'square' ? 0x00ff00 : 0xff00ff; // green for square, magenta for triangular
    
    // Find geometric center of all grid centers
    const center = new THREE.Vector3();
    gridCenters.forEach(c => center.add(c));
    center.divideScalar(gridCenters.length);
    
    // Find closest grid center to the geometric center
    let centralIndex = 0;
    let minDist = Infinity;
    gridCenters.forEach((c, i) => {
      const dist = c.distanceTo(center);
      if (dist < minDist) {
        minDist = dist;
        centralIndex = i;
      }
    });
    
    const geometry = new THREE.SphereGeometry(size, 16, 16);
    const normalMaterial = new THREE.MeshBasicMaterial({ 
      color, 
      wireframe: true,
      transparent: true,
      opacity: 0.6
    });
    const centralMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00, // yellow for center
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });
    
    gridCenters.forEach((center, i) => {
      const material = i === centralIndex ? centralMaterial : normalMaterial;
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.copy(center);
      group.add(sphere);
    });
    
    console.log(`🔮 [SANDBOX] Created ${gridCenters.length} grid helper spheres (${radiusMM}mm radius) for ${gridType} grid`);
    console.log(`   Center sphere at index ${centralIndex}: (${gridCenters[centralIndex].x.toFixed(2)}, ${gridCenters[centralIndex].y.toFixed(2)}, ${gridCenters[centralIndex].z.toFixed(2)})`);
    return group;
  };

  // Apply placemat and position solution when both scene and placemat are ready
  useEffect(() => {
    if (!sceneObjectsRef.current || !placematData || cells.length === 0 || !view) return;

    const { scene, spheresGroup } = sceneObjectsRef.current;

    // Remove existing placemat if any
    const existingPlacemat = scene.children.find(c => c.userData.isPlacemat);
    if (existingPlacemat) {
      scene.remove(existingPlacemat);
    }

    // Remove existing debug helpers if any
    if (debugHelpersRef.current) {
      scene.remove(debugHelpersRef.current);
      debugHelpersRef.current = null;
    }
    
    if (alignmentDebugHelpersRef.current) {
      scene.remove(alignmentDebugHelpersRef.current);
      alignmentDebugHelpersRef.current = null;
    }

    // ============================================================
    // Add lid at origin (already properly positioned from loader)
    // ============================================================
    
    placematData.mesh.userData.isPlacemat = true;
    
    // Make material more visible - add slight emissive glow
    placematData.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissive = new THREE.Color(0x1e40af);
        child.material.emissiveIntensity = 0.3;
      }
    });
    
    // Add lid to scene at origin
    scene.add(placematData.mesh);
    console.log('✅ [SANDBOX] Lid added at origin');
    
    // Show puzzle spheres
    spheresGroup.visible = true;

    // ============================================================
    // Position solution: Move bottom-left sphere to origin
    // ============================================================

    // --- POSITION SOLUTION: central bottom sphere at yellow grid center ---
    // Convert IJK cells to world coordinates using properly transposed matrix
    const M_world_flat = view.M_world.flat();
    const M_world_transposed = [
      M_world_flat[0], M_world_flat[4], M_world_flat[8], M_world_flat[12],
      M_world_flat[1], M_world_flat[5], M_world_flat[9], M_world_flat[13],
      M_world_flat[2], M_world_flat[6], M_world_flat[10], M_world_flat[14],
      M_world_flat[3], M_world_flat[7], M_world_flat[11], M_world_flat[15]
    ];
    const M_world_matrix = new THREE.Matrix4().fromArray(M_world_transposed);
    
    const solutionPositions = cells.map(cell => {
      const v = new THREE.Vector3(cell.i, cell.j, cell.k);
      v.applyMatrix4(M_world_matrix);
      return v;
    });

    // Find bottom layer spheres using sphere radius for tolerance
    let minY = Infinity;
    for (const p of solutionPositions) minY = Math.min(minY, p.y);
    
    // Calculate sphere radius from transform matrix for proper tolerance
    const M_flat_temp = view.M_world.flat();
    const M_transposed_temp = [
      M_flat_temp[0], M_flat_temp[4], M_flat_temp[8], M_flat_temp[12],
      M_flat_temp[1], M_flat_temp[5], M_flat_temp[9], M_flat_temp[13],
      M_flat_temp[2], M_flat_temp[6], M_flat_temp[10], M_flat_temp[14],
      M_flat_temp[3], M_flat_temp[7], M_flat_temp[11], M_flat_temp[15]
    ];
    const m_temp = new THREE.Matrix4().fromArray(M_transposed_temp);
    const p0_temp = new THREE.Vector3(0, 0, 0).applyMatrix4(m_temp);
    const p1_temp = new THREE.Vector3(1, 0, 0).applyMatrix4(m_temp);
    const sphereRadiusTemp = 0.5 * p0_temp.distanceTo(p1_temp);
    const yEps1 = sphereRadiusTemp * 0.5;
    
    const bottomSpheres = solutionPositions.filter(p => Math.abs(p.y - minY) <= yEps1);
    
    console.log(`   📍 Found ${bottomSpheres.length} spheres in bottom layer (minY=${minY.toFixed(2)}, tolerance=${yEps1.toFixed(3)})`);
    
    // Find geometric center of bottom layer (XZ only)
    const bottomCenter = new THREE.Vector3();
    bottomSpheres.forEach(p => {
      bottomCenter.x += p.x;
      bottomCenter.z += p.z;
    });
    bottomCenter.x /= bottomSpheres.length;
    bottomCenter.z /= bottomSpheres.length;
    bottomCenter.y = minY;
    
    // Find closest bottom sphere to geometric center (in XZ plane)
    let centralBottomSphere = bottomSpheres[0];
    let minDist = Infinity;
    bottomSpheres.forEach(p => {
      const dx = p.x - bottomCenter.x;
      const dz = p.z - bottomCenter.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minDist) {
        minDist = dist;
        centralBottomSphere = p;
      }
    });
    
    // Find central grid center (yellow sphere)
    const gridCenter = new THREE.Vector3();
    placematData.gridCenters.forEach(c => gridCenter.add(c));
    gridCenter.divideScalar(placematData.gridCenters.length);
    
    let centralGridCenter = placematData.gridCenters[0];
    let minGridDist = Infinity;
    placematData.gridCenters.forEach(c => {
      const dist = c.distanceTo(gridCenter);
      if (dist < minGridDist) {
        minGridDist = dist;
        centralGridCenter = c;
      }
    });
    
    console.log(`   📍 Central bottom sphere at: (${centralBottomSphere.x.toFixed(2)}, ${centralBottomSphere.y.toFixed(2)}, ${centralBottomSphere.z.toFixed(2)})`);
    console.log(`   🎯 Central grid center at: (${centralGridCenter.x.toFixed(2)}, ${centralGridCenter.y.toFixed(2)}, ${centralGridCenter.z.toFixed(2)})`);
    
    // Create grid visualization helpers if enabled (do this BEFORE auto-align so they always show)
    if (showDebugHelpers) {
      const helpersGroup = createGridHelperSpheres(
        placematData.gridCenters,
        placematData.gridType
      );
      
      // Add X and Z axis arrows from origin
      const axisLength = 50;
      const arrowLength = 5;
      
      // X axis (red)
      const xAxisArrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0), // direction
        new THREE.Vector3(0, 0, 0), // origin
        axisLength,
        0xff0000, // red
        arrowLength,
        arrowLength * 0.6
      );
      helpersGroup.add(xAxisArrow);
      
      // Z axis (blue)
      const zAxisArrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, 1), // direction
        new THREE.Vector3(0, 0, 0), // origin
        axisLength,
        0x0000ff, // blue
        arrowLength,
        arrowLength * 0.6
      );
      helpersGroup.add(zAxisArrow);
      
      debugHelpersRef.current = helpersGroup;
      scene.add(helpersGroup);
      console.log('🧭 [SANDBOX] Added X (red) and Z (blue) axis helpers');
    }
    
    // --- GEOMETRIC ALIGNMENT: Align center→neighbor lines ---
    console.log(`\n========== GEOMETRIC ALIGNMENT ==========`);
    
    const gridCenters = placematData.gridCenters; // THREE.Vector3[]
    if (!gridCenters || gridCenters.length === 0) {
      console.warn("⚠️ [SANDBOX] No placemat gridCenters for alignment");
      return;
    }

    // STEP 1: Identify puzzle lowest layer center sphere
    console.log(`\n--- STEP 1: Puzzle Center Sphere ---`);
    console.log(`Puzzle center sphere (original): (${centralBottomSphere.x.toFixed(3)}, ${centralBottomSphere.y.toFixed(3)}, ${centralBottomSphere.z.toFixed(3)})`);
    
    // STEP 2: Identify board center sphere (yellow one)
    console.log(`\n--- STEP 2: Board Center Sphere ---`);
    console.log(`Board center sphere (yellow): (${centralGridCenter.x.toFixed(3)}, ${centralGridCenter.y.toFixed(3)}, ${centralGridCenter.z.toFixed(3)})`);
    
    // STEP 3: Calculate translation to align centers
    console.log(`\n--- STEP 3: Align Centers (calculate translation) ---`);
    const translationOffset = new THREE.Vector3(
      centralGridCenter.x - centralBottomSphere.x,
      -centralBottomSphere.y, // Place on XZ plane (Y=0)
      centralGridCenter.z - centralBottomSphere.z
    );
    console.log(`Translation offset needed: (${translationOffset.x.toFixed(3)}, ${translationOffset.y.toFixed(3)}, ${translationOffset.z.toFixed(3)})`);
    
    // Calculate where all bottom spheres WOULD be after translation (for neighbor finding)
    const translatedBottomSpheres = bottomSpheres.map(p => new THREE.Vector3(
      p.x + translationOffset.x,
      p.y + translationOffset.y,
      p.z + translationOffset.z
    ));
    const translatedCenter = new THREE.Vector3(
      centralBottomSphere.x + translationOffset.x,
      centralBottomSphere.y + translationOffset.y,
      centralBottomSphere.z + translationOffset.z
    );
    console.log(`After translation, puzzle center would be at: (${translatedCenter.x.toFixed(3)}, ${translatedCenter.y.toFixed(3)}, ${translatedCenter.z.toFixed(3)})`);
    console.log(`Distance to board center: ${translatedCenter.distanceTo(centralGridCenter).toFixed(6)} units`);
    
    // STEP 4: Find nearest neighbors (in aligned/translated space)
    console.log(`\n--- STEP 4: Find Nearest Neighbors ---`);
    
    // Find nearest neighbor to puzzle center (after hypothetical translation)
    let puzzleNeighbor = translatedBottomSpheres[0];
    let minPuzzleDist = Infinity;
    
    for (const p of translatedBottomSpheres) {
      const distXZ = Math.sqrt(
        (p.x - translatedCenter.x) ** 2 + 
        (p.z - translatedCenter.z) ** 2
      );
      
      if (distXZ > 0.001 && distXZ < minPuzzleDist) {
        minPuzzleDist = distXZ;
        puzzleNeighbor = p;
      }
    }
    
    console.log(`Puzzle nearest neighbor (translated): (${puzzleNeighbor.x.toFixed(3)}, ${puzzleNeighbor.y.toFixed(3)}, ${puzzleNeighbor.z.toFixed(3)})`);
    console.log(`Distance from puzzle center: ${minPuzzleDist.toFixed(3)} units`);
    
    // Find nearest neighbor to board center
    let gridNeighbor = gridCenters[0];
    let minBoardNeighborDist = Infinity;
    
    for (const c of gridCenters) {
      const distXZ = Math.sqrt(
        (c.x - centralGridCenter.x) ** 2 + 
        (c.z - centralGridCenter.z) ** 2
      );
      
      if (distXZ > 0.001 && distXZ < minBoardNeighborDist) {
        minBoardNeighborDist = distXZ;
        gridNeighbor = c;
      }
    }
    
    console.log(`Board nearest neighbor: (${gridNeighbor.x.toFixed(3)}, ${gridNeighbor.y.toFixed(3)}, ${gridNeighbor.z.toFixed(3)})`);
    console.log(`Distance from board center: ${minBoardNeighborDist.toFixed(3)} units`);
    
    // STEP 5: Calculate lines from center to neighbor
    console.log(`\n--- STEP 5: Calculate Center→Neighbor Lines ---`);
    
    const puzzleLine = new THREE.Vector2(
      puzzleNeighbor.x - translatedCenter.x,
      puzzleNeighbor.z - translatedCenter.z
    );
    const puzzleLineNormalized = puzzleLine.clone().normalize();
    
    const boardLine = new THREE.Vector2(
      gridNeighbor.x - centralGridCenter.x,
      gridNeighbor.z - centralGridCenter.z
    );
    const boardLineNormalized = boardLine.clone().normalize();
    
    console.log(`Puzzle line (XZ): (${puzzleLine.x.toFixed(3)}, ${puzzleLine.y.toFixed(3)}) → normalized: (${puzzleLineNormalized.x.toFixed(3)}, ${puzzleLineNormalized.y.toFixed(3)})`);
    console.log(`Board line (XZ): (${boardLine.x.toFixed(3)}, ${boardLine.y.toFixed(3)}) → normalized: (${boardLineNormalized.x.toFixed(3)}, ${boardLineNormalized.y.toFixed(3)})`);
    
    // STEP 6: Calculate angle between the two lines
    console.log(`\n--- STEP 6: Calculate Angle Between Lines ---`);
    
    const puzzleAngle = Math.atan2(puzzleLineNormalized.y, puzzleLineNormalized.x);
    const boardAngle = Math.atan2(boardLineNormalized.y, boardLineNormalized.x);
    const rotationAngle = boardAngle - puzzleAngle;
    
    console.log(`Puzzle line angle: ${THREE.MathUtils.radToDeg(puzzleAngle).toFixed(2)}° (${puzzleAngle.toFixed(4)} rad)`);
    console.log(`Board line angle: ${THREE.MathUtils.radToDeg(boardAngle).toFixed(2)}° (${boardAngle.toFixed(4)} rad)`);
    console.log(`Rotation needed: ${THREE.MathUtils.radToDeg(rotationAngle).toFixed(2)}° (${rotationAngle.toFixed(4)} rad)`);
    
    // STEP 7: Calculate transformation (DON'T apply to spheresGroup - will be baked into view)
    console.log(`\n--- STEP 7: Calculate Transformations ---`);
    console.log(`Note: Rotation must be applied BEFORE translation (Three.js rotates around origin)`);
    
    // Calculate where center sphere would be after rotation
    const cosR = Math.cos(rotationAngle);
    const sinR = Math.sin(rotationAngle);
    const rotatedCenterX = centralBottomSphere.x * cosR - centralBottomSphere.z * sinR;
    const rotatedCenterZ = centralBottomSphere.x * sinR + centralBottomSphere.z * cosR;
    const rotatedCenterY = centralBottomSphere.y;
    
    console.log(`After rotation, center would be at: (${rotatedCenterX.toFixed(3)}, ${rotatedCenterY.toFixed(3)}, ${rotatedCenterZ.toFixed(3)})`);
    
    // Calculate final translation to align rotated center with board center
    const finalTranslation = new THREE.Vector3(
      centralGridCenter.x - rotatedCenterX,
      -rotatedCenterY,
      centralGridCenter.z - rotatedCenterZ
    );
    
    console.log(`Calculated translation: (${finalTranslation.x.toFixed(3)}, ${finalTranslation.y.toFixed(3)}, ${finalTranslation.z.toFixed(3)})`);
    console.log(`Calculated rotation: Y=${THREE.MathUtils.radToDeg(rotationAngle).toFixed(2)}°`);
    
    // COMPREHENSIVE VERIFICATION: Check alignment of ALL bottom spheres
    console.log(`\n========== VERIFICATION: Bottom Layer Alignment ==========`);
    
    // Helper function to find nearest grid center
    function findNearestGrid(x: number, z: number): { center: THREE.Vector3; distance: number } {
      let nearest = gridCenters[0];
      let minDist = Infinity;
      
      for (const c of gridCenters) {
        const dx = x - c.x;
        const dz = z - c.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minDist) {
          minDist = dist;
          nearest = c;
        }
      }
      
      return { center: nearest, distance: minDist };
    }
    
    // Transform all bottom spheres and check alignment
    console.log(`\nChecking ${bottomSpheres.length} bottom layer spheres after transformation:`);
    let maxError = 0;
    let totalError = 0;
    
    for (let i = 0; i < Math.min(10, bottomSpheres.length); i++) {
      const original = bottomSpheres[i];
      
      // Apply rotation
      const rotX = original.x * cosR - original.z * sinR;
      const rotZ = original.x * sinR + original.z * cosR;
      const rotY = original.y;
      
      // Apply translation
      const finalX = rotX + finalTranslation.x;
      const finalY = rotY + finalTranslation.y;
      const finalZ = rotZ + finalTranslation.z;
      
      // Find nearest grid center
      const { center: nearestGrid, distance: error } = findNearestGrid(finalX, finalZ);
      
      maxError = Math.max(maxError, error);
      totalError += error;
      
      console.log(`[${i}] Original: (${original.x.toFixed(3)}, ${original.y.toFixed(3)}, ${original.z.toFixed(3)})`);
      console.log(`    After transform: (${finalX.toFixed(3)}, ${finalY.toFixed(3)}, ${finalZ.toFixed(3)})`);
      console.log(`    Nearest grid: (${nearestGrid.x.toFixed(3)}, ${nearestGrid.y.toFixed(3)}, ${nearestGrid.z.toFixed(3)})`);
      console.log(`    Error: ${error.toFixed(3)} units`);
    }
    
    const avgError = totalError / Math.min(10, bottomSpheres.length);
    console.log(`\nAlignment Statistics:`);
    console.log(`  Average error: ${avgError.toFixed(3)} units`);
    console.log(`  Maximum error: ${maxError.toFixed(3)} units`);
    
    // Special check: verify the center sphere
    const centerRotX = centralBottomSphere.x * cosR - centralBottomSphere.z * sinR;
    const centerRotZ = centralBottomSphere.x * sinR + centralBottomSphere.z * cosR;
    const centerFinalX = centerRotX + finalTranslation.x;
    const centerFinalZ = centerRotZ + finalTranslation.z;
    const centerFinalY = centralBottomSphere.y + finalTranslation.y;
    
    console.log(`\nCenter Sphere Verification:`);
    console.log(`  Original: (${centralBottomSphere.x.toFixed(3)}, ${centralBottomSphere.y.toFixed(3)}, ${centralBottomSphere.z.toFixed(3)})`);
    console.log(`  After transform: (${centerFinalX.toFixed(3)}, ${centerFinalY.toFixed(3)}, ${centerFinalZ.toFixed(3)})`);
    console.log(`  Target (board center): (${centralGridCenter.x.toFixed(3)}, ${centralGridCenter.y.toFixed(3)}, ${centralGridCenter.z.toFixed(3)})`);
    const centerError = Math.sqrt(
      (centerFinalX - centralGridCenter.x) ** 2 +
      (centerFinalZ - centralGridCenter.z) ** 2
    );
    console.log(`  Center alignment error: ${centerError.toFixed(6)} units`);
    
    // Check the neighbor specifically
    console.log(`\nNeighbor Verification:`);
    const neighborOriginal = bottomSpheres.find(p => 
      Math.abs(p.x - puzzleNeighbor.x + translationOffset.x) < 0.001 &&
      Math.abs(p.z - puzzleNeighbor.z + translationOffset.z) < 0.001
    );
    
    if (neighborOriginal) {
      const nRotX = neighborOriginal.x * cosR - neighborOriginal.z * sinR;
      const nRotZ = neighborOriginal.x * sinR + neighborOriginal.z * cosR;
      const nFinalX = nRotX + finalTranslation.x;
      const nFinalZ = nRotZ + finalTranslation.z;
      
      console.log(`  Neighbor after transform: (${nFinalX.toFixed(3)}, ${nFinalZ.toFixed(3)})`);
      console.log(`  Target (board neighbor): (${gridNeighbor.x.toFixed(3)}, ${gridNeighbor.z.toFixed(3)})`);
      const neighborError = Math.sqrt(
        (nFinalX - gridNeighbor.x) ** 2 +
        (nFinalZ - gridNeighbor.z) ** 2
      );
      console.log(`  Neighbor alignment error: ${neighborError.toFixed(6)} units`);
    }
    
    console.log(`========== VERIFICATION COMPLETE ==========\n`);
    
    // FINAL COORDINATE DUMP: Show actual world positions
    console.log(`\n========== FINAL COORDINATES AFTER ALL TRANSFORMATIONS ==========`);
    
    // Get actual world positions from the spheresGroup after all transformations
    console.log(`\nReading actual sphere positions from scene:`);
    console.log(`spheresGroup.position: (${spheresGroup.position.x.toFixed(3)}, ${spheresGroup.position.y.toFixed(3)}, ${spheresGroup.position.z.toFixed(3)})`);
    console.log(`spheresGroup.rotation.y: ${THREE.MathUtils.radToDeg(spheresGroup.rotation.y).toFixed(2)}°`);
    console.log(`spheresGroup.children.length: ${spheresGroup.children.length}`);
    
    // Check if using InstancedMesh
    const instancedMeshes = spheresGroup.children.filter(c => c instanceof THREE.InstancedMesh);
    console.log(`Found ${instancedMeshes.length} InstancedMesh objects`);
    
    const actualSpheres: THREE.Vector3[] = [];
    
    if (instancedMeshes.length > 0) {
      console.log(`\nReading positions from InstancedMesh (using instance matrices):`);
      const instancedMesh = instancedMeshes[0] as THREE.InstancedMesh;
      console.log(`  InstancedMesh has ${instancedMesh.count} instances`);
      
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      
      for (let i = 0; i < Math.min(10, instancedMesh.count); i++) {
        instancedMesh.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        
        // Transform to world space
        const worldPos = position.clone();
        worldPos.applyMatrix4(spheresGroup.matrixWorld);
        actualSpheres.push(worldPos);
        console.log(`  [${i}] Instance position: (${position.x.toFixed(3)}, ${position.y.toFixed(3)}, ${position.z.toFixed(3)}) → World: (${worldPos.x.toFixed(3)}, ${worldPos.y.toFixed(3)}, ${worldPos.z.toFixed(3)})`);
      }
    } else {
      console.log(`\nReading positions from individual meshes:`);
      spheresGroup.children.forEach((child, i) => {
        if (i < 10 && child instanceof THREE.Mesh) {
          const worldPos = new THREE.Vector3();
          child.getWorldPosition(worldPos);
          actualSpheres.push(worldPos);
          console.log(`  [${i}] World position: (${worldPos.x.toFixed(3)}, ${worldPos.y.toFixed(3)}, ${worldPos.z.toFixed(3)})`);
        }
      });
    }
    
    // Show board grid positions for comparison
    console.log(`\nBoard grid center positions (first 10):`);
    for (let i = 0; i < Math.min(10, gridCenters.length); i++) {
      const g = gridCenters[i];
      console.log(`  [${i}] (${g.x.toFixed(3)}, ${g.y.toFixed(3)}, ${g.z.toFixed(3)})`);
    }
    
    // Find bottom layer spheres in actual scene from InstancedMesh
    console.log(`\nFinding bottom layer in actual scene:`);
    let actualMinY = Infinity;
    const allActualSpheres: THREE.Vector3[] = [];
    
    if (instancedMeshes.length > 0) {
      const instancedMesh = instancedMeshes[0] as THREE.InstancedMesh;
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      
      for (let i = 0; i < instancedMesh.count; i++) {
        instancedMesh.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        const worldPos = position.clone();
        worldPos.applyMatrix4(spheresGroup.matrixWorld);
        allActualSpheres.push(worldPos);
        actualMinY = Math.min(actualMinY, worldPos.y);
      }
    }
    
    console.log(`  Actual minimum Y in scene: ${actualMinY.toFixed(3)}`);
    
    const actualBottomSpheres = allActualSpheres.filter(p => Math.abs(p.y - actualMinY) < 0.2);
    
    console.log(`  Found ${actualBottomSpheres.length} spheres in bottom layer (within 0.2 of minY)`);
    console.log(`\nActual bottom layer positions (first 10):`);
    for (let i = 0; i < Math.min(10, actualBottomSpheres.length); i++) {
      const p = actualBottomSpheres[i];
      const { center: nearest, distance: dist } = findNearestGrid(p.x, p.z);
      console.log(`  [${i}] Sphere: (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}) → Nearest grid: (${nearest.x.toFixed(3)}, ${nearest.z.toFixed(3)}) dist=${dist.toFixed(3)}`);
    }
    
    console.log(`\n========== FINAL COORDINATES COMPLETE ==========\n`);
    
    // APPLY ALIGNMENT: Transform IJK coordinates directly in world space
    console.log(`\n========== APPLYING ALIGNMENT TO PLACED PIECES ==========\n`);
    
    // Create alignment transform (rotation then translation, in world space)
    const rotationMatrix = new THREE.Matrix4().makeRotationY(rotationAngle);
    const translationMatrix = new THREE.Matrix4().makeTranslation(
      finalTranslation.x, finalTranslation.y, finalTranslation.z
    );
    const alignmentTransform = new THREE.Matrix4();
    alignmentTransform.multiply(translationMatrix);
    alignmentTransform.multiply(rotationMatrix);
    
    // M_world matrix for IJK → world transformation
    const M = new THREE.Matrix4().fromArray(M_world_transposed);
    const M_inv = new THREE.Matrix4().copy(M).invert();
    
    // Transform each placed piece's cells: IJK → world → aligned world → aligned IJK
    const alignedPlacedPieces = placedPieces.map(piece => ({
      ...piece,
      cells: piece.cells.map(cell => {
        // 1. IJK → world
        const worldPos = new THREE.Vector3(cell.i, cell.j, cell.k).applyMatrix4(M);
        // 2. Apply alignment in world space
        const alignedWorldPos = worldPos.applyMatrix4(alignmentTransform);
        // 3. World → IJK (inverse transform)
        const alignedIJK = alignedWorldPos.applyMatrix4(M_inv);
        
        return {
          i: alignedIJK.x,
          j: alignedIJK.y,
          k: alignedIJK.z
        };
      })
    }));
    
    console.log(`✅ Transformed ${alignedPlacedPieces.length} pieces with ${alignedPlacedPieces.reduce((sum, p) => sum + p.cells.length, 0)} total cells`);
    console.log(`   Sample aligned IJK: (${alignedPlacedPieces[0].cells[0].i.toFixed(3)}, ${alignedPlacedPieces[0].cells[0].j.toFixed(3)}, ${alignedPlacedPieces[0].cells[0].k.toFixed(3)})`);
    
    // Verify by transforming back to world space
    const verifyWorld = new THREE.Vector3(
      alignedPlacedPieces[0].cells[0].i,
      alignedPlacedPieces[0].cells[0].j,
      alignedPlacedPieces[0].cells[0].k
    ).applyMatrix4(M);
    console.log(`   Verify world position: (${verifyWorld.x.toFixed(3)}, ${verifyWorld.y.toFixed(3)}, ${verifyWorld.z.toFixed(3)})`);
    console.log(`========== ALIGNMENT APPLIED ==========\n`);
    
    // Use aligned pieces with original view (no M_world modification needed)
    setAlignedPlacedPieces(alignedPlacedPieces);
    
    console.log('✅ [SANDBOX] Solution positioned and aligned');
  }, [placematData, cells, view, showDebugHelpers]);

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
      background: '#000',
      paddingBottom: 'env(safe-area-inset-bottom)'
    }}>
      {/* Loading Overlay */}
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

      {/* 3D Canvas - Full screen */}
      {!loading && view && cells.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0
        }}>
          <SceneCanvas
            cells={viewMode === 'shape' ? cells : []}
            view={view}
            editMode={false}
            mode="add"
            onCellsChange={() => {}}
            layout="fullscreen"
            placedPieces={viewMode === 'solution' ? (alignedPlacedPieces || placedPieces) : []}
            hidePlacedPieces={false}
            settings={solutions.length === 0 ? {
              ...envSettings,
              material: {
                ...envSettings.material,
                color: '#ff0000'
              },
              emptyCells: {
                linkToEnvironment: true,
                customMaterial: {
                  ...envSettings.material,
                  color: '#ff0000'
                }
              }
            } : envSettings}
            puzzleMode="unlimited"
            showBonds={true}
            containerOpacity={solutions.length === 0 ? envSettings.material.opacity : (viewMode === 'solution' ? 0 : 0.15)}
            containerColor={solutions.length === 0 ? "#ff0000" : "#888888"}
            containerRoughness={solutions.length === 0 ? envSettings.material.roughness : 0.8}
            alwaysShowContainer={false}
            visibility={{
              xray: false,
              emptyOnly: false,
              sliceY: { center: 0.5, thickness: 1.0 },
            }}
            onSelectPiece={() => {}}
            onSceneReady={handleSceneReady}
          />
        </div>
      )}

      {/* Top Control Buttons */}
      {!loading && puzzle && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          display: 'flex',
          gap: '8px',
          zIndex: 1000
        }}>
          {/* Sandbox Badge */}
          <div
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff',
              fontWeight: 700,
              border: 'none',
              fontSize: '14px',
              padding: '8px 12px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              pointerEvents: 'none'
            }}
          >
            🧪 SANDBOX
          </div>

          {/* Info Button */}
          <button
            onClick={() => setShowInfoModal(true)}
            title="Puzzle Information"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
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
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
          >
            ℹ️
          </button>

          {/* Preset Selector */}
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
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
          >
            ⚙️
          </button>

          {/* Debug Toggle (Sandbox only) */}
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
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
            >
              🐛
            </button>
          )}

          {/* Close Button */}
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Preset Selector Modal */}
      <PresetSelectorModal
        isOpen={showPresetModal}
        currentPreset={currentPreset}
        onClose={() => setShowPresetModal(false)}
        onSelectPreset={handlePresetSelect}
      />

      {/* Info Modal */}
      {showInfoModal && puzzle && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setShowInfoModal(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #d946ef 0%, #c026d3 50%, #a21caf 100%)',
              borderRadius: '20px',
              padding: '32px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShowInfoModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: '#fff',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '4px 8px',
                lineHeight: 1,
                borderRadius: '6px',
                transition: 'all 0.2s'
              }}
            >
              ✕
            </button>

            {/* Modal Content */}
            <h2 style={{
              color: '#fff',
              fontSize: '1.75rem',
              fontWeight: 700,
              margin: '0 0 28px 0',
              textAlign: 'center',
              textShadow: '0 2px 10px rgba(0, 0, 0, 0.3)'
            }}>
              {puzzle.name}
            </h2>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              color: '#fff',
              fontSize: '1.05rem'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.3rem' }}>🧩</span> Cell Count
                </span>
                <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{cells.length} cells</span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.3rem' }}>✓</span> Solutions
                </span>
                <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                  {solutions.length} solution{solutions.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '0.9rem',
                textAlign: 'center'
              }}>
                <strong>🧪 SANDBOX MODE</strong>
                <div style={{ marginTop: '4px', fontSize: '0.85rem' }}>
                  Geometry verification only
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
