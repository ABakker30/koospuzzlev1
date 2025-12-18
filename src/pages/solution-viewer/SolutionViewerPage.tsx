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
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../types/studio';
import { StudioSettingsService } from '../../services/StudioSettingsService';
import { SettingsModal } from '../../components/SettingsModal';
import { PieceDetailModal } from './components/PieceDetailModal';
import * as THREE from 'three';
import '../../styles/shape.css';

interface PlacedPiece {
  uid: string;
  pieceId: string;
  orientationId: string;
  anchorSphereIndex: 0 | 1 | 2 | 3;
  cells: IJK[];  // Original IJK (for SceneCanvas rendering)
  cellsXYZ: { x: number; y: number; z: number }[];  // Final XYZ (for sorting)
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
  const [revealMethod, setRevealMethod] = useState<'global' | 'connected' | 'supported'>('global'); // global = lowest Y everywhere, connected = grow from lowest, supported = most supported ground-up
  
  // Explosion slider state
  const [explosionFactor, setExplosionFactor] = useState<number>(0); // 0 = assembled, 1 = exploded
  
  // Auth context for user ID (Phase 3: DB Integration)
  const { user } = useAuth();
  
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
  
  // Piece detail modal state
  const [selectedPieceForDetail, setSelectedPieceForDetail] = useState<PlacedPiece | null>(null);
  
  // Load settings from database when user logs in (Phase 3: DB Integration)
  useEffect(() => {
    if (user?.id) {
      console.log('🔄 [SolutionViewerPage] Loading settings from DB for user:', user.id);
      settingsService.current.loadSettingsFromDB(user.id).then(dbSettings => {
        if (dbSettings) {
          console.log('✅ [SolutionViewerPage] DB settings loaded');
          setEnvSettings(dbSettings);
        }
      });
    }
  }, [user?.id]);

  // Save settings to database when they change (Phase 3: DB Integration)
  useEffect(() => {
    if (user?.id) {
      console.log('💾 [SolutionViewerPage] Saving settings to DB');
      settingsService.current.saveSettingsToDB(user.id, envSettings);
    }
  }, [envSettings, user?.id]);
  
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
    let v;
    try {
      v = computeViewTransforms(geometry, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
      setView(v);
      console.log(`✅ Solution loaded: ${geometry.length} cells, ${solution.placed_pieces?.length || 0} pieces`);
    } catch (err) {
      console.error('Failed to compute view:', err);
      setError('Failed to process geometry');
      return;
    }
    
    // Restore placed pieces and transform to final XYZ coordinates
    const placedPieces = solution.placed_pieces || [];
    const placedMap = new Map<string, PlacedPiece>();
    const M = v.M_world;
    
    placedPieces.forEach((piece: any) => {
      // Transform IJK directly to final XYZ (matching SceneCanvas rendering)
      const xyzCells = piece.cells.map((cell: IJK) => ({
        x: M[0][0] * cell.i + M[0][1] * cell.j + M[0][2] * cell.k + M[0][3],
        y: M[1][0] * cell.i + M[1][1] * cell.j + M[1][2] * cell.k + M[1][3],
        z: M[2][0] * cell.i + M[2][1] * cell.j + M[2][2] * cell.k + M[2][3]
      }));
      
      placedMap.set(piece.uid, {
        uid: piece.uid,
        pieceId: piece.pieceId,
        orientationId: piece.orientationId,
        anchorSphereIndex: piece.anchorSphereIndex,
        cells: piece.cells,
        cellsXYZ: xyzCells,
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
    
    const piecesArray = Array.from(placed.values());
    
    // Add minY and centroidY to each piece
    const piecesWithMetrics = piecesArray.map(piece => {
      const minY = Math.min(...piece.cellsXYZ.map(cell => cell.y));
      const centroidY = piece.cellsXYZ.reduce((sum: number, cell) => sum + cell.y, 0) / piece.cellsXYZ.length;
      return { piece, minY, centroidY };
    });
    
    let ordered: typeof piecesWithMetrics;
    
    if (revealMethod === 'connected') {
      // Connected ordering: BFS from lowest piece, grow by adjacency
      
      // Build adjacency graph (pieces are adjacent if their cells are close)
      const neighborThreshold = 2.5; // IJK distance threshold for adjacency
      const neighbors = new Map<number, Set<number>>();
      for (let i = 0; i < piecesArray.length; i++) {
        neighbors.set(i, new Set());
      }
      
      for (let i = 0; i < piecesArray.length; i++) {
        for (let j = i + 1; j < piecesArray.length; j++) {
          const piece1 = piecesArray[i];
          const piece2 = piecesArray[j];
          
          // Check if any cells from piece1 are close to any cells from piece2
          let areNeighbors = false;
          for (const cell1 of piece1.cellsXYZ) {
            for (const cell2 of piece2.cellsXYZ) {
              const dx = cell1.x - cell2.x;
              const dy = cell1.y - cell2.y;
              const dz = cell1.z - cell2.z;
              const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
              if (dist < neighborThreshold) {
                areNeighbors = true;
                break;
              }
            }
            if (areNeighbors) break;
          }
          
          if (areNeighbors) {
            neighbors.get(i)!.add(j);
            neighbors.get(j)!.add(i);
          }
        }
      }
      
      // Find starting piece (lowest minY)
      let startIdx = 0;
      let lowestY = piecesWithMetrics[0].minY;
      for (let i = 1; i < piecesWithMetrics.length; i++) {
        if (piecesWithMetrics[i].minY < lowestY) {
          lowestY = piecesWithMetrics[i].minY;
          startIdx = i;
        }
      }
      
      // BFS: always pick lowest-Y from frontier
      const revealed = new Set<number>();
      const frontier = new Set<number>([startIdx]);
      ordered = [];
      
      while (frontier.size > 0 && ordered.length < piecesWithMetrics.length) {
        // Pick piece with lowest minY from frontier
        let bestIdx = -1;
        let bestY = Infinity;
        let bestCentroidY = Infinity;
        let bestPlacedAt = Infinity;
        
        for (const idx of frontier) {
          const item = piecesWithMetrics[idx];
          const isLower = item.minY < bestY - 1e-6 ||
                          (Math.abs(item.minY - bestY) < 1e-6 && item.centroidY < bestCentroidY - 1e-6) ||
                          (Math.abs(item.minY - bestY) < 1e-6 && Math.abs(item.centroidY - bestCentroidY) < 1e-6 && item.piece.placedAt < bestPlacedAt);
          
          if (bestIdx === -1 || isLower) {
            bestIdx = idx;
            bestY = item.minY;
            bestCentroidY = item.centroidY;
            bestPlacedAt = item.piece.placedAt;
          }
        }
        
        // Reveal this piece
        ordered.push(piecesWithMetrics[bestIdx]);
        revealed.add(bestIdx);
        frontier.delete(bestIdx);
        
        // Add neighbors to frontier
        for (const neighborIdx of neighbors.get(bestIdx)!) {
          if (!revealed.has(neighborIdx) && !frontier.has(neighborIdx)) {
            frontier.add(neighborIdx);
          }
        }
      }
      
      // If any pieces weren't reached (disconnected components), add them at end
      if (ordered.length < piecesWithMetrics.length) {
        const remaining = piecesWithMetrics
          .map((item, i) => ({ item, idx: i }))
          .filter(({ idx }) => !revealed.has(idx))
          .sort((a, b) => {
            if (Math.abs(a.item.minY - b.item.minY) > 1e-6) return a.item.minY - b.item.minY;
            if (Math.abs(a.item.centroidY - b.item.centroidY) > 1e-6) return a.item.centroidY - b.item.centroidY;
            return a.item.piece.placedAt - b.item.piece.placedAt;
          });
        
        for (const { item } of remaining) {
          ordered.push(item);
        }
      }
    } else {
      // Global ordering: sort all pieces by minY (original behavior)
      ordered = piecesWithMetrics.slice().sort((a, b) => {
        if (Math.abs(a.minY - b.minY) > 1e-6) return a.minY - b.minY;
        if (Math.abs(a.centroidY - b.centroidY) > 1e-6) return a.centroidY - b.centroidY;
        return a.piece.placedAt - b.piece.placedAt;
      });
    }
    
    return ordered.map(item => item.piece).slice(0, revealK);
  }, [placed, revealK, revealMax, revealMethod]);
  
  // Camera positioning for puzzle pieces
  useEffect(() => {
    if (!realSceneObjects || placed.size === 0) return;
    
    // Calculate bounds from placed pieces using pre-computed XYZ
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    Array.from(placed.values()).flatMap(p => p.cellsXYZ).forEach((cell) => {
      minX = Math.min(minX, cell.x); maxX = Math.max(maxX, cell.x);
      minY = Math.min(minY, cell.y); maxY = Math.max(maxY, cell.y);
      minZ = Math.min(minZ, cell.z); maxZ = Math.max(maxZ, cell.z);
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
  }, [realSceneObjects, placed]);
  
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
            className="pill"
            onClick={() => navigate('/')}
            title="Home"
            style={{
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              color: '#fff',
              fontWeight: 700,
              border: 'none',
              fontSize: '16px',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
          >
            🏠
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
            cells={[]}
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
            onInteraction={(target, type, data) => {
              // Double-click on piece opens detail modal
              if (target === 'piece' && type === 'double' && data?.uid) {
                const piece = placed.get(data.uid);
                if (piece) {
                  setSelectedPieceForDetail(piece);
                }
              }
            }}
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
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px'
                }}>
                  <div style={{ 
                    color: '#fff', 
                    fontSize: '13px',
                    fontWeight: 500
                  }}>
                    Reveal
                  </div>
                  <button
                    onClick={() => {
                      const next = revealMethod === 'global' ? 'connected' : 
                                  revealMethod === 'connected' ? 'supported' : 'global';
                      setRevealMethod(next);
                    }}
                    title={
                      revealMethod === 'global' ? 'Global: lowest Y everywhere → Click for Connected' :
                      revealMethod === 'connected' ? 'Connected: grows from lowest piece → Click for Supported' :
                      'Supported: most stable ground-up assembly → Click for Global'
                    }
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '4px',
                      color: '#fff',
                      fontSize: '10px',
                      padding: '2px 6px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    }}
                  >
                    {revealMethod === 'global' ? '🌍 Global' : 
                     revealMethod === 'connected' ? '🔗 Connected' : '🏗️ Supported'}
                  </button>
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
      
      {/* Piece Detail Modal */}
      {selectedPieceForDetail && (
        <PieceDetailModal
          isOpen={true}
          pieceId={selectedPieceForDetail.pieceId}
          cells={selectedPieceForDetail.cells}
          envSettings={envSettings}
          onClose={() => setSelectedPieceForDetail(null)}
        />
      )}
    </div>
  );
};

export default SolutionViewerPage;
