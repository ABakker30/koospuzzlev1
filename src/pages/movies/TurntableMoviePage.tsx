// Turntable Movie Page - Standalone turntable effect viewer/recorder
// Follows Blueprint v2: Single responsibility, no cross-page coupling

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import SceneCanvas from '../../components/SceneCanvas';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { ijkToXyz } from '../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { buildEffectContext, type EffectContext } from '../../studio/EffectContext';
import { TurnTableEffect } from '../../effects/turntable/TurnTableEffect';
import { CreditsModal } from '../../components/CreditsModal';
import { DropdownMenu } from '../../components/DropdownMenu';
import { RecordingSetupModal, type RecordingSetup } from '../../components/RecordingSetupModal';
import { SaveMovieModal, type MovieSaveData } from '../../components/SaveMovieModal';
import { RecordingService, type RecordingStatus } from '../../services/RecordingService';
import type { TurnTableConfig } from '../../effects/turntable/presets';
import { DEFAULT_CONFIG } from '../../effects/turntable/presets';
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

export const TurntableMoviePage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  
  // Determine context from URL params
  const from = searchParams.get('from'); // 'gallery' | 'share' | 'solve-complete' | null
  const mode = searchParams.get('mode'); // 'create' | 'view' | null
  
  // Data state
  const [movie, setMovie] = useState<any>(null); // When viewing existing movie
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
  const [activeEffectInstance, setActiveEffectInstance] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Recording state
  const [recordingService] = useState(() => new RecordingService());
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>({ state: 'idle' });
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const recordingStatusRef = useRef(recordingStatus);
  
  // Reveal slider state
  const [revealK, setRevealK] = useState<number>(0);
  const [revealMax, setRevealMax] = useState<number>(0);
  
  // Explosion slider state
  const [explosionFactor, setExplosionFactor] = useState<number>(0); // 0 = assembled, 1 = exploded
  
  // Recording state
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [showRecordingSetup, setShowRecordingSetup] = useState(false);
  const [showSaveMovie, setShowSaveMovie] = useState(false);
  const [recordingSetup, setRecordingSetup] = useState<RecordingSetup | null>(null);
  
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
  
  // Load data based on mode
  useEffect(() => {
    if (!id) {
      setError('No ID provided');
      setLoading(false);
      return;
    }
    
    const loadData = async () => {
      try {
        // Determine if we're viewing a movie or creating from solution
        const isViewMode = mode === 'view' || from === 'gallery' || from === 'share';
        
        if (isViewMode) {
          // Load existing movie from DB
          console.log('📺 Loading movie:', id);
          const { data: movieData, error: movieError } = await supabase
            .from('movies')
            .select('*, solutions(*), puzzles(*)')
            .eq('id', id)
            .single();
          
          if (movieError || !movieData) {
            setError('Movie not found');
            setLoading(false);
            return;
          }
          
          setMovie(movieData);
          setSolution(movieData.solutions);
          console.log('✅ Movie loaded:', movieData.title);
          
          // Increment view count (fire and forget)
          supabase.rpc('increment_movie_views', { movie_id: id }).then();
        } else {
          // Load solution for creating new movie
          console.log('🎬 Loading solution for recording:', id);
          const { data: solutionData, error: solutionError } = await supabase
            .from('solutions')
            .select('*')
            .eq('id', id)
            .single();
          
          if (solutionError || !solutionData) {
            setError('Solution not found');
            setLoading(false);
            return;
          }
          
          setSolution(solutionData);
          console.log('✅ Solution loaded for recording');
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Failed to load data:', err);
        setError('Failed to load data');
        setLoading(false);
      }
    };
    
    loadData();
  }, [id, mode, from]);
  
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
      // No reveal slider - show all pieces
      return Array.from(placed.values());
    }
    
    // Use reveal slider to show 1..N pieces
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
    
    // Find canvas for recording
    const foundCanvas = sceneObjects.renderer?.domElement;
    if (foundCanvas) {
      setCanvas(foundCanvas);
      console.log('🎬 Canvas found for recording');
    }
  };
  
  // Set up recording status listener
  useEffect(() => {
    recordingService.setStatusCallback(setRecordingStatus);
  }, [recordingService]);
  
  // Keep ref in sync with status
  useEffect(() => {
    recordingStatusRef.current = recordingStatus;
  }, [recordingStatus]);
  
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
    console.log('✅ Effect context built');
  }, [realSceneObjects, placed]);
  
  // Auto-activate effect when context is ready
  useEffect(() => {
    if (!effectContext || activeEffectInstance) return;
    
    // Use movie config if viewing, otherwise use defaults for recording
    const config = movie?.effect_config || DEFAULT_CONFIG;
    console.log('🎬 Auto-activating turntable with config:', movie ? 'from movie' : 'default');
    handleActivateEffect(config);
  }, [effectContext, activeEffectInstance, movie]);
  
  // Handle turntable activation
  const handleActivateEffect = (config: TurnTableConfig) => {
    if (!effectContext) {
      console.error('Effect context not ready');
      return;
    }
    
    const instance = new TurnTableEffect();
    instance.init(effectContext);
    instance.setConfig(config);
    setActiveEffectInstance(instance);
    
    instance.setOnComplete(() => {
      const currentRecordingState = recordingStatusRef.current.state;
      console.log('🎬 Turntable effect completed. Recording state:', currentRecordingState);
      setIsPlaying(false);
      
      // If recording, stop it and trigger download
      if (currentRecordingState === 'recording') {
        console.log('🎬 Effect complete during recording - stopping recording...');
        handleStopRecordingAndDownload();
      } else {
        console.log('🎬 Effect complete, but not recording (state:', currentRecordingState, ')');
      }
    });
  };
  
  // Animation loop - tick the active effect on every frame
  useEffect(() => {
    if (!activeEffectInstance) return;
    
    let animationFrameId: number;
    
    const tick = () => {
      // TurnTableEffect expects time in SECONDS, not milliseconds
      activeEffectInstance.tick(performance.now() / 1000);
      animationFrameId = requestAnimationFrame(tick);
    };
    
    animationFrameId = requestAnimationFrame(tick);
    
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [activeEffectInstance]);
  
  // Handle Play/Pause
  const handlePlayPause = () => {
    if (!activeEffectInstance) {
      console.log('No effect instance');
      return;
    }

    const newState = !isPlaying;
    setIsPlaying(newState);
    
    if (newState) {
      activeEffectInstance.play();
      console.log('▶️ Playing effect');
    } else {
      if (activeEffectInstance.pause) {
        activeEffectInstance.pause();
        console.log('⏸️ Paused effect');
      }
    }
  };
  
  // Handle Record button - open setup modal
  const handleRecord = () => {
    console.log('🎬 Record clicked, status:', recordingStatus.state);
    
    if (recordingStatus.state !== 'idle') {
      console.log('Already recording or processing');
      return;
    }
    
    if (!canvas) {
      alert('Canvas not found. Please try again.');
      return;
    }
    
    if (!window.MediaRecorder) {
      alert('Recording not supported in this browser. Try Chrome or Firefox.');
      return;
    }
    
    // Open recording setup modal
    setShowRecordingSetup(true);
  };
  
  // Handle recording start with user-selected settings
  const handleStartRecording = async (setup: RecordingSetup) => {
    setShowRecordingSetup(false);
    setRecordingSetup(setup); // Store for saving to DB later
    
    console.log('🎬 Starting recording with setup:', setup);
    
    try {
      await recordingService.initialize(canvas!, { quality: setup.quality });
      console.log(`🎬 Recording initialized: ${setup.quality} quality, ${setup.aspectRatio} aspect ratio`);
      
      // TODO: Apply aspect ratio to canvas rendering
      // For now, we record at full canvas size
      
      // Stop effect if playing to start fresh
      if (isPlaying && activeEffectInstance?.stop) {
        activeEffectInstance.stop();
        setIsPlaying(false);
      }
      
      // Start recording
      await recordingService.startRecording();
      console.log('🎬 Recording started');
      
      if (activeEffectInstance?.setRecording) {
        activeEffectInstance.setRecording(true);
      }
      
      // Auto-play to start the animation
      if (!isPlaying) {
        handlePlayPause();
      }
      
      console.log('🎬 Recording workflow started - will auto-download when complete');
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Failed to start recording');
    }
  };
  
  // Stop recording and trigger automatic download
  const handleStopRecordingAndDownload = async () => {
    try {
      console.log('🎬 Stopping recording and preparing download...');
      await recordingService.stopRecording();
      
      if (activeEffectInstance?.setRecording) {
        activeEffectInstance.setRecording(false);
      }
      
      // The blob will be available in recordingStatus - handled by useEffect below
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };
  
  // Handle recording completion - show save modal or auto-download
  useEffect(() => {
    console.log('📹 Recording status changed:', {
      state: recordingStatus.state,
      hasBlob: !!recordingStatus.blob,
      blobSize: recordingStatus.blob?.size,
      recordedBlob: !!recordedBlob,
      from, mode
    });
    
    if (recordingStatus.state === 'idle' && recordingStatus.blob && !recordedBlob) {
      console.log('📹 Recording complete! Blob size:', recordingStatus.blob.size, 'bytes');
      setRecordedBlob(recordingStatus.blob);
      
      // If we're in create mode (from solve or standalone), show save modal
      // Otherwise (testing/preview), just auto-download
      const isCreateMode = mode === 'create' || from === 'solve-complete';
      
      if (isCreateMode) {
        console.log('💾 Showing save movie modal');
        setShowSaveMovie(true);
      } else {
        // Auto-download for non-create modes (preview/testing)
        console.log('📹 Triggering auto-download...');
        try {
          const url = URL.createObjectURL(recordingStatus.blob);
          const a = document.createElement('a');
          a.href = url;
          
          const fileExt = recordingStatus.blob.type.includes('webm') ? 'webm' : 'mp4';
          a.download = `${solution?.puzzle_name || 'Puzzle'}-Turntable-${Date.now()}.${fileExt}`;
          
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          setTimeout(() => URL.revokeObjectURL(url), 100);
          console.log('✅ Download initiated!');
        } catch (error) {
          console.error('❌ Download failed:', error);
          alert('Failed to download video. Please try again.');
        }
      }
    }
  }, [recordingStatus, recordedBlob, solution?.puzzle_name, mode, from]);
  
  // Handle save movie to database
  const handleSaveMovie = async (movieData: MovieSaveData) => {
    try {
      console.log('💾 Saving movie to database:', movieData);
      
      // Get the active effect config
      const effectConfig = activeEffectInstance?.getConfig ? 
        activeEffectInstance.getConfig() : 
        DEFAULT_CONFIG;
      
      // Create movie record
      const { data: savedMovie, error: saveError } = await supabase
        .from('movies')
        .insert({
          puzzle_id: solution.puzzle_id,
          solution_id: solution.id,
          title: movieData.title,
          description: movieData.description,
          challenge_text: movieData.challenge_text,
          creator_name: movieData.creator_name,
          effect_type: 'turntable',
          effect_config: effectConfig,
          is_public: movieData.is_public,
          duration_sec: effectConfig.durationSec,
          // Store recording setup metadata
          credits_config: {
            aspectRatio: recordingSetup?.aspectRatio,
            quality: recordingSetup?.quality
          }
        })
        .select()
        .single();
      
      if (saveError || !savedMovie) {
        throw new Error(saveError?.message || 'Failed to save movie');
      }
      
      console.log('✅ Movie saved:', savedMovie.id);
      
      // Close save modal
      setShowSaveMovie(false);
      
      // Show share link
      const shareUrl = `${window.location.origin}/movies/turntable/${savedMovie.id}?from=share`;
      alert(`🎉 Movie saved!\n\nShare link:\n${shareUrl}`);
      
      // Navigate to the movie view
      navigate(`/movies/turntable/${savedMovie.id}?from=gallery`);
      
    } catch (error) {
      console.error('Failed to save movie:', error);
      throw error; // Let modal handle error display
    }
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
            title="Back"
          >
            ← Back
          </button>
        </div>
        
        {/* Center: Title or Transport Controls */}
        <div className="header-center" style={{ 
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          WebkitMaskImage: 'none',
          maskImage: 'none'
        }}>
          {!activeEffectInstance ? (
            // Show title before effect configured
            <div style={{ 
              color: '#fff',
              fontSize: '18px',
              fontWeight: 600
            }}>
              Turntable Movie
            </div>
          ) : (
            // Show transport controls after effect configured
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={handlePlayPause}
                style={{
                  background: isPlaying ? '#f59e0b' : '#10b981',
                  color: '#fff',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 20px',
                  minWidth: '100px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                  transition: 'transform 0.1s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                {isPlaying ? '⏸️ Pause' : '▶️ Play'}
              </button>
              <button
                onClick={handleRecord}
                disabled={recordingStatus.state !== 'idle'}
                style={{
                  background: recordingStatus.state === 'recording' ? '#ef4444' : '#3b82f6',
                  color: '#fff',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 20px',
                  minWidth: '140px',
                  cursor: recordingStatus.state !== 'idle' ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                  opacity: recordingStatus.state !== 'idle' ? 0.7 : 1,
                  transition: 'transform 0.1s ease'
                }}
                onMouseEnter={(e) => {
                  if (recordingStatus.state === 'idle') {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                {recordingStatus.state === 'recording' ? '🎬 Recording...' : 
                 recordingStatus.state === 'stopping' ? '⏳ Saving...' :
                 recordingStatus.state === 'processing' ? '⚙️ Processing...' :
                 '⬤ Record & Download'}
              </button>
            </div>
          )}
        </div>
        
        {/* Right: Menu */}
        <div className="header-right" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <DropdownMenu
            trigger={
              <button
                className="pill"
                style={{
                  background: '#3b82f6',
                  color: '#fff',
                  fontWeight: 600,
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                Menu
                <span style={{ fontSize: '12px' }}>▼</span>
              </button>
            }
            items={[
              {
                icon: '⚙️',
                label: 'Scene Settings',
                onClick: () => setShowEnvSettings(true),
                divider: !!recordedBlob
              },
              ...(recordedBlob ? [
                {
                  icon: '📤',
                  label: 'Share',
                  onClick: () => {
                    // TODO: Implement share functionality
                    console.log('Share movie');
                  }
                },
                {
                  icon: '⬇️',
                  label: 'Download',
                  onClick: handleDownloadVideo
                }
              ] : [])
            ]}
          />
        </div>
      </div>
      
      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', marginTop: '60px' }}>
        {view && placed.size > 0 && (
          <SceneCanvas
            key={`scene-${solution?.id || id}`}
            cells={cells}
            view={view}
            editMode={false}
            mode="add"
            onCellsChange={() => {}}
            placedPieces={visiblePlacedPieces}  // Use filtered pieces from reveal slider
            hidePlacedPieces={false}
            explosionFactor={explosionFactor}   // Wire explosion slider
            settings={envSettings}              // Wire environment settings
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
      
      {/* Modals */}
      <RecordingSetupModal
        isOpen={showRecordingSetup}
        onClose={() => setShowRecordingSetup(false)}
        onStart={handleStartRecording}
      />
      
      <SaveMovieModal
        isOpen={showSaveMovie}
        onClose={() => setShowSaveMovie(false)}
        onSave={handleSaveMovie}
        puzzleName={solution?.puzzle_name || 'Puzzle'}
        effectType="Turntable"
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

export default TurntableMoviePage;
