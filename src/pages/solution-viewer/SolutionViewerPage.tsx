// Solution Viewer Page - Clean viewer for database solutions
// No effects, just viewing with reveal/explosion/environment controls

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import SceneCanvas from '../../components/SceneCanvas';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { ijkToXyz } from '../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import type { IJK } from '../../types/shape';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../types/studio';
import { StudioSettingsService } from '../../services/StudioSettingsService';
import { SettingsModal } from '../../components/SettingsModal';
import * as THREE from 'three';
import '../../styles/shape.css';

interface PlacedPiece {
  uid: string;
  pieceId: string;
  orientationId: string;
  anchorSphereIndex: 0 | 1 | 2 | 3;
  cells: IJK[];
  placedAt: number;
}

export const SolutionViewerPage: React.FC = () => {
  const navigate = useNavigate();
  const { id: solutionId } = useParams<{ id: string }>();
  
  // Solution data
  const [solution, setSolution] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Puzzle geometry
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [placed, setPlaced] = useState<Map<string, PlacedPiece>>(new Map());
  
  // Scene objects for camera control
  const [realSceneObjects, setRealSceneObjects] = useState<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: any;
    spheresGroup: THREE.Group;
    centroidWorld: THREE.Vector3;
  } | null>(null);
  
  // Reveal slider state
  const [revealK, setRevealK] = useState<number>(0);
  const [revealMax, setRevealMax] = useState<number>(0);
  
  // Explosion slider state
  const [explosionFactor, setExplosionFactor] = useState<number>(0); // 0 = assembled, 1 = exploded
  
  // Environment settings (3D scene: lighting, materials, etc.)
  const settingsService = useRef(new StudioSettingsService());
  const [envSettings, setEnvSettings] = useState<StudioSettings>(() => {
    try {
      const stored = localStorage.getItem('contentStudio_v2');
      return stored ? JSON.parse(stored) : DEFAULT_STUDIO_SETTINGS;
    } catch {
      return DEFAULT_STUDIO_SETTINGS;
    }
  });
  const [showEnvSettings, setShowEnvSettings] = useState(false);
  
  // FCC transformation matrix
  const T_ijk_to_xyz = [
    [0.5, 0.5, 0, 0],
    [0.5, 0, 0.5, 0],  
    [0, 0.5, 0.5, 0],
    [0, 0, 0, 1]
  ];
  
  // Load solution from database
  useEffect(() => {
    if (!solutionId) {
      setError('No solution ID provided');
      setLoading(false);
      return;
    }
    
    const loadSolution = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('solutions')
          .select('*')
          .eq('id', solutionId)
          .single();
        
        if (fetchError || !data) {
          setError('Solution not found');
          setLoading(false);
          return;
        }
        
        setSolution(data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load solution');
        setLoading(false);
      }
    };
    
    loadSolution();
  }, [solutionId]);
  
  // Process solution data when loaded
  useEffect(() => {
    if (!solution) return;
    
    // Extract geometry
    const geometry = solution.final_geometry as IJK[];
    if (!geometry || geometry.length === 0) {
      setError('Solution has no geometry');
      return;
    }
    
    setCells(geometry);
    
    // Compute view transforms
    try {
      const v = computeViewTransforms(geometry, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
      setView(v);
      console.log(`✅ Solution loaded: ${geometry.length} cells, ${solution.placed_pieces?.length || 0} pieces`);
    } catch (err) {
      console.error('Failed to compute view:', err);
      setError('Failed to process geometry');
      return;
    }
    
    // Restore placed pieces
    const placedPieces = solution.placed_pieces || [];
    const placedMap = new Map<string, PlacedPiece>();
    placedPieces.forEach((piece: any) => {
      placedMap.set(piece.uid, {
        uid: piece.uid,
        pieceId: piece.pieceId,
        orientationId: piece.orientationId,
        anchorSphereIndex: piece.anchorSphereIndex,
        cells: piece.cells,
        placedAt: piece.placedAt
      });
    });
    setPlaced(placedMap);
    
    // Enable reveal slider
    setRevealMax(placedMap.size);
    setRevealK(placedMap.size); // Show all initially
    
    console.log(`✅ Loaded ${placedMap.size} pieces from solution`);
  }, [solution]);
  
  // Filter visible pieces based on reveal slider
  const visiblePlacedPieces = useMemo(() => {
    if (revealMax === 0) {
      return Array.from(placed.values());
    }
    
    const sorted = Array.from(placed.values()).sort((a, b) => a.placedAt - b.placedAt);
    return sorted.slice(0, revealK);
  }, [placed, revealK, revealMax]);
  
  // Camera positioning for puzzle pieces
  useEffect(() => {
    if (!realSceneObjects || !view || placed.size === 0) return;
    
    // Calculate bounds from placed pieces
    const M = view.M_world;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    Array.from(placed.values()).flatMap(p => p.cells).forEach((cell) => {
      const x = M[0][0] * cell.i + M[0][1] * cell.j + M[0][2] * cell.k + M[0][3];
      const y = M[1][0] * cell.i + M[1][1] * cell.j + M[1][2] * cell.k + M[1][3];
      const z = M[2][0] * cell.i + M[2][1] * cell.j + M[2][2] * cell.k + M[2][3];
      
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    });
    
    const center = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2
    };
    
    setTimeout(() => {
      if (realSceneObjects.camera && realSceneObjects.controls) {
        const maxSize = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
        const distance = maxSize * 2.5;
        
        realSceneObjects.camera.position.set(
          center.x + distance * 0.7,
          center.y + distance * 0.7,
          center.z + distance * 0.7
        );
        realSceneObjects.camera.lookAt(center.x, center.y, center.z);
        realSceneObjects.controls.target.set(center.x, center.y, center.z);
        realSceneObjects.controls.update();
      }
    }, 500);
  }, [realSceneObjects, view, placed]);
  
  // Track when SceneCanvas is ready
  const handleSceneReady = (sceneObjects: any) => {
    setRealSceneObjects(sceneObjects);
  };
  
  // Loading state
  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff'
      }}>
        Loading solution...
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
        gap: '20px'
      }}>
        <div>{error}</div>
        <button
          className="pill"
          onClick={() => navigate('/gallery')}
          style={{
            background: '#3b82f6',
            color: '#fff',
            fontWeight: 600,
            border: 'none'
          }}
        >
          Back to Gallery
        </button>
      </div>
    );
  }
  
  return (
    <div style={{ 
      height: '100vh', 
      width: '100vw', 
      display: 'flex', 
      flexDirection: 'column',
      background: '#000'
    }}>
      {/* Header */}
      <div className="header" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '60px',
        background: 'rgba(0, 0, 0, 0.95)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 1000
      }}>
        {/* Left: Back button */}
        <div className="header-left">
          <button
            className="pill pill--ghost"
            onClick={() => navigate('/gallery')}
            title="Back to gallery"
          >
            ← Gallery
          </button>
        </div>
        
        {/* Center: Title */}
        <div className="header-center" style={{ 
          color: '#fff',
          fontSize: '18px',
          fontWeight: 600
        }}>
          👁️ Solution Viewer
        </div>
        
        {/* Right: Settings button */}
        <div className="header-right">
          <button
            className="pill pill--ghost"
            onClick={() => setShowEnvSettings(true)}
            title="Environment settings (lighting, materials)"
          >
            🎨 Scene
          </button>
        </div>
      </div>
      
      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', marginTop: '60px' }}>
        {view && placed.size > 0 && (
          <SceneCanvas
            key={`scene-${solutionId}-${placed.size}`}
            cells={cells}
            view={view}
            editMode={false}
            mode="add"
            onCellsChange={() => {}}
            placedPieces={visiblePlacedPieces}
            hidePlacedPieces={false}
            explosionFactor={explosionFactor}
            settings={envSettings}
            containerOpacity={0}
            containerColor="#888888"
            visibility={{
              xray: false,
              emptyOnly: false,
              sliceY: { center: 0.5, thickness: 1.0 }
            }}
            puzzleMode="oneOfEach"
            onSelectPiece={() => {}}
            onSceneReady={handleSceneReady}
          />
        )}
        
        {/* Reveal / Explosion Sliders - Bottom Right */}
        {(revealMax > 0 || explosionFactor > 0) && (
          <div style={{
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            background: 'rgba(0, 0, 0, 0.85)',
            padding: '15px',
            borderRadius: '8px',
            minWidth: '220px',
            zIndex: 100,
            backdropFilter: 'blur(10px)'
          }}>
            {/* Reveal Slider */}
            {revealMax > 0 && (
              <div style={{ marginBottom: explosionFactor > 0 ? '15px' : '0' }}>
                <div style={{ 
                  color: '#fff', 
                  marginBottom: '8px', 
                  fontSize: '13px',
                  fontWeight: 500
                }}>
                  Reveal
                </div>
                <input
                  type="range"
                  min={1}
                  max={revealMax}
                  step={1}
                  value={revealK}
                  onChange={(e) => setRevealK(parseInt(e.target.value, 10))}
                  style={{ 
                    width: '100%',
                    cursor: 'pointer'
                  }}
                />
              </div>
            )}
            
            {/* Explosion Slider */}
            <div>
              <div style={{ 
                color: '#fff', 
                marginBottom: '8px', 
                fontSize: '13px',
                fontWeight: 500
              }}>
                Explosion
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={explosionFactor * 100}
                onChange={(e) => setExplosionFactor(parseInt(e.target.value, 10) / 100)}
                style={{ 
                  width: '100%',
                  cursor: 'pointer'
                }}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Environment Settings Modal */}
      {showEnvSettings && (
        <SettingsModal
          settings={envSettings}
          onSettingsChange={(newSettings) => {
            setEnvSettings(newSettings);
            settingsService.current.saveSettings(newSettings);
          }}
          onClose={() => setShowEnvSettings(false)}
        />
      )}
    </div>
  );
};

export default SolutionViewerPage;
