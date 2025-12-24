import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import SceneCanvas from '../../components/SceneCanvas';
import { PresetSelectorModal } from '../../components/PresetSelectorModal';
import { ENVIRONMENT_PRESETS } from '../../constants/environmentPresets';
import { getPuzzleById, type PuzzleRecord } from '../../api/puzzles';
import { getPuzzleSolutions, type PuzzleSolutionRecord } from '../../api/solutions';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../types/studio';
import { ijkToXyz } from '../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import type { IJK } from '../../types/shape';
import type { PlacedPiece } from '../solve/types/manualSolve';
import { detectGridType } from './placemat/gridDetection';
import { loadPlacemat, computeSphereScaleFactor, type PlacematData } from './placemat/placematLoader';
import { alignSolutionToPlacemat, createAlignmentDebugHelpers } from './placemat/placematAlignment';

// Bright settings for viewer
const VIEWER_SETTINGS: StudioSettings = {
  ...DEFAULT_STUDIO_SETTINGS,
  lights: {
    ...DEFAULT_STUDIO_SETTINGS.lights,
    brightness: 2.5,
  }
};

// FCC transformation matrix
const T_ijk_to_xyz = [
  [0.5, 0.5, 0, 0],
  [0.5, 0, 0.5, 0],  
  [0, 0.5, 0.5, 0],
  [0, 0, 0, 1]
];

interface PuzzleViewSandboxPageProps {}

export function PuzzleViewSandboxPage({}: PuzzleViewSandboxPageProps) {
  const { solutionId } = useParams<{ solutionId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [puzzle, setPuzzle] = useState<PuzzleRecord | null>(null);
  const [solutions, setSolutions] = useState<PuzzleSolutionRecord[]>([]);
  const [viewMode, setViewMode] = useState<'solution' | 'shape'>('shape');
  
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [placedPieces, setPlacedPieces] = useState<PlacedPiece[]>([]);
  const [currentPreset, setCurrentPreset] = useState<string>(() => {
    try {
      return localStorage.getItem('puzzleViewer.environmentPreset') || '';
    } catch {
      return '';
    }
  });
  const [envSettings, setEnvSettings] = useState<StudioSettings>(() => {
    try {
      const presetKey = localStorage.getItem('puzzleViewer.environmentPreset');
      if (presetKey && ENVIRONMENT_PRESETS[presetKey]) {
        return ENVIRONMENT_PRESETS[presetKey];
      }
    } catch {
      // ignore
    }
    return VIEWER_SETTINGS;
  });
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showDebugHelpers, setShowDebugHelpers] = useState(false);
  
  // Placemat state
  const [placematData, setPlacematData] = useState<PlacematData | null>(null);
  const sceneObjectsRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    spheresGroup: THREE.Group;
  } | null>(null);
  const debugHelpersRef = useRef<THREE.Group | null>(null);
  const alignmentDebugHelpersRef = useRef<THREE.Group | null>(null);

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
          const transforms = computeViewTransforms(
            puzzleCells,
            ijkToXyz,
            T_ijk_to_xyz,
            quickHullWithCoplanarMerge
          );
          setView(transforms);
          console.log('✅ [SANDBOX] View transforms computed');
          
          // Detect grid type and load appropriate placemat
          const gridDetection = detectGridType(puzzleCells);
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

  // Apply placemat when both scene and placemat are ready
  useEffect(() => {
    if (!sceneObjectsRef.current || !placematData || cells.length === 0) return;

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

    // Add placemat to scene
    placematData.mesh.userData.isPlacemat = true;
    scene.add(placematData.mesh);
    
    // Calculate PLY grid centers bounding box centroid
    const gridBbox = new THREE.Box3();
    placematData.gridCenters.forEach(center => gridBbox.expandByPoint(center));
    const gridCentroid = gridBbox.getCenter(new THREE.Vector3());
    
    // Calculate placemat mesh bounding box centroid (at origin initially)
    placematData.mesh.position.set(0, 0, 0);
    placematData.mesh.updateMatrixWorld(true);
    const meshBbox = new THREE.Box3().setFromObject(placematData.mesh);
    const meshCentroid = meshBbox.getCenter(new THREE.Vector3());
    
    console.log('🔍 [SANDBOX] Alignment calculation:');
    console.log(`   PLY grid centroid: (${gridCentroid.x.toFixed(2)}, ${gridCentroid.y.toFixed(2)}, ${gridCentroid.z.toFixed(2)})`);
    console.log(`   Placemat mesh centroid: (${meshCentroid.x.toFixed(2)}, ${meshCentroid.y.toFixed(2)}, ${meshCentroid.z.toFixed(2)})`);
    
    // Calculate XY offset to align centroids
    const offsetX = gridCentroid.x - meshCentroid.x;
    const offsetY = gridCentroid.y - meshCentroid.y;
    
    // Calculate Z offset: Preserve native vertical offset from files
    // Native: PLY at 16.5mm, GLTF top at 7.0mm → offset = 9.5mm
    // After scaling: 9.5mm × MM_TO_UNITS = 0.269 units
    const NATIVE_OFFSET_MM = 9.5; // From files: PLY Z - GLTF max Y
    const MM_TO_UNITS = 0.708 / 25; // Same conversion factor used in placematLoader
    const nativeOffsetScaled = NATIVE_OFFSET_MM * MM_TO_UNITS;
    
    // Position placemat so: topSurface + nativeOffset = gridCenters
    const topSurfaceOffset = meshBbox.max.z;
    const offsetZ = gridCentroid.z - nativeOffsetScaled - topSurfaceOffset;
    
    // Apply offset to placemat mesh (align top surface with grid centers Z)
    placematData.mesh.position.set(offsetX, offsetY, offsetZ);
    placematData.mesh.updateMatrixWorld(true);
    
    // Verify alignment
    const meshBboxFinal = new THREE.Box3().setFromObject(placematData.mesh);
    const meshCentroidFinal = meshBboxFinal.getCenter(new THREE.Vector3());
    const sizeFinal = meshBboxFinal.getSize(new THREE.Vector3());
    
    console.log(`   Applied offset: (${offsetX.toFixed(2)}, ${offsetY.toFixed(2)}, ${offsetZ.toFixed(2)})`);
    console.log(`   Final placemat position: (${placematData.mesh.position.x.toFixed(2)}, ${placematData.mesh.position.y.toFixed(2)}, ${placematData.mesh.position.z.toFixed(2)})`);
    console.log(`   Final mesh centroid: (${meshCentroidFinal.x.toFixed(2)}, ${meshCentroidFinal.y.toFixed(2)}, ${meshCentroidFinal.z.toFixed(2)})`);
    console.log(`   Final bounding box size: (${sizeFinal.x.toFixed(2)} x ${sizeFinal.y.toFixed(2)} x ${sizeFinal.z.toFixed(2)})`);
    console.log(`\n✅ [VERTICAL OFFSET PRESERVATION]:`);
    console.log(`   Native offset from files: ${NATIVE_OFFSET_MM.toFixed(2)} mm`);
    console.log(`   Scaled offset: ${nativeOffsetScaled.toFixed(4)} units`);
    console.log(`   PLY grid centers Z: ${gridCentroid.z.toFixed(4)}`);
    console.log(`   Placemat top surface Z: ${meshBboxFinal.max.z.toFixed(4)}`);
    console.log(`   Actual offset (grid - surface): ${(gridCentroid.z - meshBboxFinal.max.z).toFixed(4)} units`);
    console.log(`   Expected offset: ${nativeOffsetScaled.toFixed(4)} units`);
    console.log(`   Offset delta: ${Math.abs((gridCentroid.z - meshBboxFinal.max.z) - nativeOffsetScaled).toFixed(6)} units (should be ≈0)`);
    
    // Make material more visible - add slight emissive glow
    placematData.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissive = new THREE.Color(0x1e40af);
        child.material.emissiveIntensity = 0.3;
      }
    });
    
    console.log('✅ [SANDBOX] Placemat added and aligned with PLY grid centroid');
    
    // Hide puzzle spheres to focus on placemat alignment verification
    spheresGroup.visible = false;
    console.log('🙈 [SANDBOX] Puzzle spheres hidden (debugging placemat alignment)');
    
    // Show yellow spheres at ALL placemat grid centers for verification
    console.log(`\n📊 [PLACEMAT GRID] Loaded ${placematData.gridCenters.length} grid centers from PLY:`);
    
    // Log coordinate ranges
    const xVals = placematData.gridCenters.map(c => c.x);
    const yVals = placematData.gridCenters.map(c => c.y);
    const zVals = placematData.gridCenters.map(c => c.z);
    console.log(`   X range: [${Math.min(...xVals).toFixed(2)}, ${Math.max(...xVals).toFixed(2)}]`);
    console.log(`   Y range: [${Math.min(...yVals).toFixed(2)}, ${Math.max(...yVals).toFixed(2)}]`);
    console.log(`   Z range: [${Math.min(...zVals).toFixed(2)}, ${Math.max(...zVals).toFixed(2)}]`);
    
    // Log first 10 positions
    console.log(`   First 10 positions:`);
    placematData.gridCenters.slice(0, 10).forEach((c, i) => {
      console.log(`     [${i}] (${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)})`);
    });
    
    // Calculate sphere size: 25mm diameter = 12.5mm radius
    const SPHERE_DIAMETER_MM = 25;
    const sphereRadius = (SPHERE_DIAMETER_MM / 2) * MM_TO_UNITS;
    
    const placematDebugGroup = new THREE.Group();
    placematData.gridCenters.forEach(center => {
      const debugSphere = new THREE.Mesh(
        new THREE.SphereGeometry(sphereRadius, 32, 32),
        new THREE.MeshBasicMaterial({ color: 0xffff00 })
      );
      debugSphere.position.copy(center);
      placematDebugGroup.add(debugSphere);
    });
    scene.add(placematDebugGroup);
    console.log(`🟡 [SANDBOX] Added ${placematData.gridCenters.length} yellow debug spheres`);
    console.log(`   Diameter: ${SPHERE_DIAMETER_MM}mm → radius: ${sphereRadius.toFixed(4)} units\n`);

    // Get sphere positions from mesh world space
    spheresGroup.updateMatrixWorld(true);
    const sphereWorldPositions: { x: number; y: number; z: number }[] = [];
    
    // Log mesh structure to debug
    let meshCount = 0;
    let sphereGeomCount = 0;
    
    spheresGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshCount++;
        if (child.geometry instanceof THREE.SphereGeometry) {
          sphereGeomCount++;
          const worldPos = new THREE.Vector3();
          child.getWorldPosition(worldPos);
          sphereWorldPositions.push({ x: worldPos.x, y: worldPos.y, z: worldPos.z });
        }
      }
    });
    
    console.log(`🔍 [SANDBOX] Mesh scan: ${meshCount} total meshes, ${sphereGeomCount} SphereGeometry meshes`);
    
    // Find bottom layer from world positions
    if (sphereWorldPositions.length === 0) {
      console.warn('⚠️ [SANDBOX] No sphere meshes found, falling back to cell positions');
      // Fallback: use IJK cell positions converted to XYZ
      const cellPositions = cells.map(ijk => {
        const xyz = ijkToXyz(ijk);
        return { x: xyz.x, y: xyz.y, z: xyz.z };
      });
      const minY = Math.min(...cellPositions.map(p => p.y));
      const fallbackBottomLayer = cellPositions.filter(p => Math.abs(p.y - minY) < 0.1);
      console.log(`🔍 [SANDBOX] Using ${fallbackBottomLayer.length} cell positions for bottom layer`);
      
      // Debug spheres removed - using placemat grid visualization only
      
      // Perform fallback alignment
      if (fallbackBottomLayer.length > 1 && placematData.gridCenters.length > 0) {
        const scaleFactor = computeSphereScaleFactor(fallbackBottomLayer, placematData.gridCenters);
        spheresGroup.scale.setScalar(scaleFactor);
        console.log(`📏 [SANDBOX] Applied scale factor: ${scaleFactor.toFixed(3)}`);
        
        const alignmentResult = alignSolutionToPlacemat(
          fallbackBottomLayer,
          placematData.gridCenters,
          spheresGroup
        );
        
        console.log(`✅ [SANDBOX] Alignment complete:`);
        console.log(`   Translation: (${alignmentResult.translation.x.toFixed(2)}, ${alignmentResult.translation.z.toFixed(2)})`);
        console.log(`   Rotation: ${(alignmentResult.rotation * 180 / Math.PI).toFixed(2)}°`);
      }
      return;
    }
    
    const minY = Math.min(...sphereWorldPositions.map(p => p.y));
    const bottomLayerCenters = sphereWorldPositions.filter(p => Math.abs(p.y - minY) < 0.1);
    
    console.log(`🔍 [SANDBOX] Found ${bottomLayerCenters.length} bottom-layer spheres at Y=${minY.toFixed(3)}`);
    
    // Debug spheres removed - using placemat grid visualization only
    
    // Perform alignment
    if (bottomLayerCenters.length > 1 && placematData.gridCenters.length > 0) {
      // Step 1: Scale puzzle to match placemat grid spacing
      const scaleFactor = computeSphereScaleFactor(bottomLayerCenters, placematData.gridCenters);
      spheresGroup.scale.setScalar(scaleFactor);
      console.log(`📏 [SANDBOX] Applied scale factor: ${scaleFactor.toFixed(3)}`);
      
      // Step 2: Apply alignment algorithm (centroid centering + grid snapping + rotation)
      const alignmentResult = alignSolutionToPlacemat(
        bottomLayerCenters,
        placematData.gridCenters,
        spheresGroup
      );
      
      console.log(`✅ [SANDBOX] Alignment complete:`);
      console.log(`   Translation: (${alignmentResult.translation.x.toFixed(2)}, ${alignmentResult.translation.z.toFixed(2)})`);
      console.log(`   Rotation: ${(alignmentResult.rotation * 180 / Math.PI).toFixed(2)}°`);
      
      // Create alignment debug helpers if debug mode is on
      if (showDebugHelpers) {
        const alignmentHelpers = createAlignmentDebugHelpers(alignmentResult);
        alignmentDebugHelpersRef.current = alignmentHelpers;
        scene.add(alignmentHelpers);
        console.log('🐛 [SANDBOX] Alignment debug helpers added');
      }
    }

    // Create grid visualization helpers if enabled
    if (showDebugHelpers) {
      const helpersGroup = new THREE.Group();
      
      // Show placemat grid centers (small wireframe spheres)
      placematData.gridCenters.forEach(center => {
        const geometry = new THREE.SphereGeometry(1.5, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(center);
        helpersGroup.add(sphere);
      });
      
      debugHelpersRef.current = helpersGroup;
      scene.add(helpersGroup);
      console.log('🐛 [SANDBOX] Grid debug helpers added');
    }
  }, [placematData, cells, showDebugHelpers]);

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
            placedPieces={viewMode === 'solution' ? placedPieces : []}
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
