// Turntable Movie Page - Standalone turntable effect viewer/recorder
// Follows Blueprint v2: Single responsibility, no cross-page coupling

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import SceneCanvas from '../../components/SceneCanvas';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { ijkToXyz } from '../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { buildEffectContext, type EffectContext } from '../../studio/EffectContext';
import { TransportBar } from '../../studio/TransportBar';
import { TurnTableModal } from '../../effects/turntable/TurnTableModal';
import { TurnTableEffect } from '../../effects/turntable/TurnTableEffect';
import { CreditsModal } from '../../components/CreditsModal';
import type { TurnTableConfig } from '../../effects/turntable/presets';
import type { IJK } from '../../types/shape';
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

export const TurntableMoviePage: React.FC = () => {
  const navigate = useNavigate();
  const { id: solutionId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  
  // Solution data
  const [solution, setSolution] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Puzzle geometry
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [placed, setPlaced] = useState<Map<string, PlacedPiece>>(new Map());
  
  // Scene objects for effect
  const [realSceneObjects, setRealSceneObjects] = useState<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: any;
    spheresGroup: THREE.Group;
    centroidWorld: THREE.Vector3;
  } | null>(null);
  const [effectContext, setEffectContext] = useState<EffectContext | null>(null);
  
  // Turntable effect state
  const [showTurnTableModal, setShowTurnTableModal] = useState(false);
  const [activeEffectInstance, setActiveEffectInstance] = useState<any>(null);
  
  // Recording state
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  
  // FCC transformation matrix
  const T_ijk_to_xyz = [
    [0.5, 0.5, 0, 0],
    [0.5, 0, 0.5, 0],  
    [0, 0.5, 0.5, 0],
    [0, 0, 0, 1]
  ];
  
  // Load solution from database or URL params
  useEffect(() => {
    if (!solutionId) {
      // Try to load from URL params (for shared links)
      const configParam = searchParams.get('config');
      if (configParam) {
        try {
          const config = JSON.parse(decodeURIComponent(configParam));
          // Auto-activate effect from URL
          if (config.cells && config.placements) {
            setSolution({ 
              final_geometry: config.cells,
              placed_pieces: config.placements 
            });
            setLoading(false);
            return;
          }
        } catch (e) {
          console.error('Failed to parse URL config:', e);
        }
      }
      setError('No solution ID or config provided');
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
  }, [solutionId, searchParams]);
  
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
  }, [solution]);
  
  // Build effect context when scene is ready
  useEffect(() => {
    if (!realSceneObjects || placed.size === 0) return;
    
    const ctx = buildEffectContext({
      scene: realSceneObjects.scene,
      camera: realSceneObjects.camera,
      renderer: realSceneObjects.renderer,
      controls: realSceneObjects.controls,
      spheresGroup: realSceneObjects.spheresGroup,
      centroidWorld: realSceneObjects.centroidWorld
    });
    
    setEffectContext(ctx);
    console.log('✅ Effect context ready');
  }, [realSceneObjects, placed]);
  
  // Auto-activate effect from URL params
  useEffect(() => {
    if (!effectContext) return;
    
    const configParam = searchParams.get('config');
    if (configParam && !activeEffectInstance) {
      try {
        const urlConfig = JSON.parse(decodeURIComponent(configParam));
        if (urlConfig.turntable) {
          handleActivateEffect(urlConfig.turntable);
        }
      } catch (e) {
        console.error('Failed to auto-activate from URL:', e);
      }
    }
  }, [effectContext, searchParams]);
  
  // Handle turntable activation
  const handleActivateEffect = (config: TurnTableConfig) => {
    if (!effectContext) {
      console.error('Effect context not ready');
      return;
    }
    
    console.log('🎬 Activating turntable effect:', config);
    
    const instance = new TurnTableEffect();
    
    // Initialize effect with context
    instance.init(effectContext);
    
    // Apply configuration
    instance.setConfig(config);
    
    setActiveEffectInstance(instance);
    
    // Set completion callback for credits
    instance.setOnComplete(() => {
      console.log('🎬 Turntable effect completed');
      setShowCreditsModal(true);
    });
  };
  
  // Handle modal save
  const handleTurnTableSave = (config: TurnTableConfig) => {
    setShowTurnTableModal(false);
    handleActivateEffect(config);
  };
  
  // Handle recording complete
  const handleRecordingComplete = (blob: Blob) => {
    console.log('📹 Recording complete:', blob.size, 'bytes');
    setRecordedBlob(blob);
  };
  
  // Handle credits submit (save movie)
  const handleCreditsSubmit = async (credits: any) => {
    console.log('💾 Saving movie with credits:', credits);
    // TODO: Save to database if needed
    // For now, just close modal
    setShowCreditsModal(false);
  };
  
  // Handle download
  const handleDownloadVideo = () => {
    if (!recordedBlob) return;
    
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `turntable-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
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
          🔄 Turntable Movie
        </div>
        
        {/* Right: Configure button */}
        <div className="header-right">
          <button
            className="pill"
            onClick={() => setShowTurnTableModal(true)}
            disabled={!!activeEffectInstance}
            style={{
              background: activeEffectInstance ? '#555' : '#3b82f6',
              color: '#fff',
              fontWeight: 600,
              border: 'none'
            }}
          >
            ⚙️ Configure
          </button>
        </div>
      </div>
      
      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', marginTop: '60px' }}>
        {view && (
          <SceneCanvas
            cells={cells}
            view={view}
            editMode={false}
            mode="add"
            onCellsChange={() => {}}
            placedPieces={Array.from(placed.values())}
            hidePlacedPieces={false}
            onSceneReady={setRealSceneObjects}
          />
        )}
        
        {/* Transport Bar - Appears after effect is activated */}
        {activeEffectInstance && (
          <TransportBar
            activeEffectId="turntable"
            isLoaded={true}
            activeEffectInstance={activeEffectInstance}
            movieMode={true}
            onRecordingComplete={handleRecordingComplete}
          />
        )}
      </div>
      
      {/* Modals */}
      <TurnTableModal
        isOpen={showTurnTableModal}
        onClose={() => setShowTurnTableModal(false)}
        onSave={handleTurnTableSave}
      />
      
      <CreditsModal
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        onSave={handleCreditsSubmit}
        onDownload={handleDownloadVideo}
        puzzleName={solution?.puzzle_name || 'Puzzle'}
        effectType="turntable"
        recordedBlob={recordedBlob || undefined}
      />
    </div>
  );
};

export default TurntableMoviePage;
