// Gravity Movie View Page - View and play existing gravity movies
// Clean, focused playback experience

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import SceneCanvas from '../../components/SceneCanvas';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { ijkToXyz } from '../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { buildEffectContext, type EffectContext } from '../../studio/EffectContext';
import { MovieGravityPlayer } from '../../effects/gravity/MovieGravityPlayer';
import type { GravityMovieHandle } from '../../effects/gravity/MovieGravityPlayer';
import type { GravityEffectConfig } from '../../effects/gravity/types';
import { DEFAULT_GRAVITY } from '../../effects/gravity/types';
import { RecordingService, type RecordingStatus } from '../../services/RecordingService';
import type { VideoFormat } from '../gallery/ShareOptionsModal';
import type { IJK } from '../../types/shape';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../types/studio';
import * as THREE from 'three';
import '../../styles/shape.css';

interface PlacedPiece {
  uid: string;
  pieceId: string;
  orientationId: string;
  anchorSphereIndex: 0 | 1 | 2 | 3;
  cells: IJK[];
  cellsXYZ: { x: number; y: number; z: number }[];
  placedAt: number;
}

export const GravityMovieViewPage: React.FC = () => {
  const navigate = useNavigate();
  const { movieId } = useParams<{ movieId: string }>();
  const [searchParams] = useSearchParams();
  const shouldDownload = searchParams.get('download') === 'true';
  const videoFormat = (searchParams.get('format') || 'landscape') as VideoFormat;
  
  // Data state
  const [movie, setMovie] = useState<any>(null);
  const [solution, setSolution] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Recording state
  const [recordingService] = useState(() => new RecordingService());
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>({ state: 'idle' });
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const isRecordingRef = useRef(false); // Track recording state for callbacks
  
  // Puzzle geometry
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [placed, setPlaced] = useState<Map<string, PlacedPiece>>(new Map());
  
  // Scene objects for effect context
  const [realSceneObjects, setRealSceneObjects] = useState<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: any;
    spheresGroup: THREE.Group;
    centroidWorld: THREE.Vector3;
  } | null>(null);
  const [effectContext, setEffectContext] = useState<EffectContext | null>(null);
  
  // Gravity effect control
  const gravityPlayerRef = useRef<GravityMovieHandle | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showBonds] = useState(true); // Always create bonds, let GravityEffect control visibility
  
  // Environment settings
  const [envSettings, setEnvSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
  
  // FCC transformation matrix
  const T_ijk_to_xyz = [
    [0.5, 0.5, 0, 0],
    [0.5, 0, 0.5, 0],  
    [0, 0.5, 0.5, 0],
    [0, 0, 0, 1]
  ];

  // Load movie data (match legacy page structure)
  useEffect(() => {
    if (!movieId) {
      setError('No movie ID provided');
      setLoading(false);
      return;
    }

    const loadMovie = async () => {
      try {
        console.log('📺 Loading movie:', movieId);

        // Load existing movie from DB
        const { data: movieData, error: movieError } = await supabase
          .from('movies')
          .select('*, solutions(*)')
          .eq('id', movieId)
          .single();

        if (movieError || !movieData) {
          setError('Movie not found');
          setLoading(false);
          return;
        }

        setMovie(movieData);
        setSolution(movieData.solutions);
        console.log('✅ Movie loaded:', movieData.title || movieData.id);

        // Restore scene settings if stored with movie
        if (movieData.credits_config?.scene_settings) {
          console.log('🎨 Restoring scene settings from movie metadata:', {
            brightness: movieData.credits_config.scene_settings.materials?.brightness,
            hdr: movieData.credits_config.scene_settings.environment?.hdrEnvironment?.enabled,
            lights: movieData.credits_config.scene_settings.lights?.directional
          });
          setEnvSettings(movieData.credits_config.scene_settings);
        } else {
          console.warn('⚠️ No scene settings in movie metadata, using defaults');
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to load movie:', err);
        setError('Failed to load movie');
        setLoading(false);
      }
    };

    loadMovie();
  }, [movieId]);

  // Process solution data when loaded (match legacy page structure)
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
    const M = v.M_world;  // Use the computed view transformation

    placedPieces.forEach((piece: any) => {
      // Transform IJK cells to final XYZ coordinates
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
        cells: piece.cells,  // Keep original IJK for rendering
        cellsXYZ: xyzCells,  // Store final XYZ for sorting/gravity
        placedAt: piece.placedAt
      });
    });

    setPlaced(placedMap);

    console.log(`✅ Loaded ${placedMap.size} pieces from solution`);
  }, [solution]);

  // Compute gravity config from movie
  const initialGravityConfig: GravityEffectConfig = useMemo(() => {
    const baseConfig = movie?.effect_config || DEFAULT_GRAVITY;
    return {
      ...baseConfig,
      preserveControls: true,
    };
  }, [movie]);

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

  // Memoize values to prevent SceneCanvas effects from re-running constantly
  const placedPiecesArray = useMemo(() => Array.from(placed.values()), [placed]);
  const emptySet = useMemo(() => new Set<string>(), []);
  const noOpSelectPiece = useCallback(() => {}, []);

  // Check if all pieces are same type (for coloring)
  const puzzleMode = useMemo(() => {
    if (placed.size === 0) return 'oneOfEach';
    
    const pieces = Array.from(placed.values());
    const firstPieceId = pieces[0]?.pieceId;
    const allSameType = pieces.every(p => p.pieceId === firstPieceId);
    
    return allSameType ? 'unlimited' : 'oneOfEach';
  }, [placed]);

  // Log recording status changes
  useEffect(() => {
    console.log('📊 Recording status changed:', recordingStatus);
  }, [recordingStatus]);

  // Auto-start recording if download parameter is present
  useEffect(() => {
    if (shouldDownload && effectContext && canvas && realSceneObjects && !isPlaying && (recordingStatus.state === 'idle')) {
      console.log('🎬 All requirements ready, starting auto-record');
      startRecordingAndPlay();
    }
  }, [shouldDownload, effectContext, canvas, realSceneObjects, isPlaying, recordingStatus.state]);

  // Store original canvas dimensions
  const originalCanvasDimensions = useRef<{ width: number; height: number } | null>(null);

  // Get recording dimensions based on format
  const getRecordingDimensions = (format: VideoFormat): { width: number; height: number } => {
    switch (format) {
      case 'landscape':
        return { width: 1920, height: 1080 }; // 16:9
      case 'portrait':
        return { width: 1080, height: 1920 }; // 9:16
      case 'square':
        return { width: 1080, height: 1080 }; // 1:1
      default:
        return { width: 1920, height: 1080 };
    }
  };

  const startRecordingAndPlay = async () => {
    if (!canvas || !movie || !gravityPlayerRef.current || !realSceneObjects) {
      console.error('❌ Missing requirements for recording:', {
        hasCanvas: !!canvas,
        hasMovie: !!movie,
        hasGravityPlayer: !!gravityPlayerRef.current,
        hasRealSceneObjects: !!realSceneObjects
      });
      return;
    }

    try {
      console.log('🎬 Starting auto-record and play with format:', videoFormat);
      
      // Store original dimensions
      originalCanvasDimensions.current = {
        width: canvas.width,
        height: canvas.height
      };

      // Get recording dimensions based on format
      const recordingDims = getRecordingDimensions(videoFormat);
      
      // Resize canvas and renderer for recording
      const { renderer, camera } = realSceneObjects;
      renderer.setSize(recordingDims.width, recordingDims.height);
      
      // Update camera aspect ratio
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = recordingDims.width / recordingDims.height;
        camera.updateProjectionMatrix();
      }
      
      console.log(`📐 Canvas resized to ${recordingDims.width}x${recordingDims.height} (${videoFormat})`);
      
      // Initialize and start recording with resized canvas
      await recordingService.initialize(canvas, { quality: 'high' });
      await recordingService.startRecording();
      const status = recordingService.getStatus();
      setRecordingStatus(status);
      
      // Small delay to ensure everything is ready before playing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Set recording flag for callback
      isRecordingRef.current = true;
      console.log('🚩 Set isRecordingRef.current = true');
      
      // Auto-play movie
      console.log('▶️ Calling gravityPlayerRef.current.play()');
      gravityPlayerRef.current.play();
      setIsPlaying(true);
      setIsPaused(false);
      
      console.log('✅ Recording started, movie should be playing');
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      isRecordingRef.current = false; // Clear flag on error
      setRecordingStatus({ state: 'error', error: (error as Error).message });
      
      // Restore original dimensions on error
      if (originalCanvasDimensions.current && realSceneObjects) {
        const { renderer, camera } = realSceneObjects;
        renderer.setSize(originalCanvasDimensions.current.width, originalCanvasDimensions.current.height);
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.aspect = originalCanvasDimensions.current.width / originalCanvasDimensions.current.height;
          camera.updateProjectionMatrix();
        }
      }
    }
  };

  const handleRecordingComplete = async () => {
    console.log('📹 handleRecordingComplete called');
    
    // Clear recording flag
    isRecordingRef.current = false;
    console.log('🚩 Set isRecordingRef.current = false');

    try {
      console.log('🎬 Stopping recording...');
      setRecordingStatus({ state: 'processing' }); // Show "Preparing your video..." message
      await recordingService.stopRecording();
      const status = recordingService.getStatus();
      console.log('📊 Recording status after stop:', status);
      setRecordingStatus(status);

      const blob = status.blob;
      if (!blob) {
        console.error('❌ No recording blob available');
        return;
      }

      console.log('✅ Recording complete, blob size:', blob.size);

      // Create file from blob
      const fileName = `${movie?.title || 'puzzle-movie'}.webm`;
      const file = new File([blob], fileName, { type: 'video/webm' });

      console.log('📤 Attempting to share video file:', {
        fileName,
        fileSize: blob.size,
        fileType: file.type,
        hasNavigatorShare: !!navigator.share,
        hasCanShare: !!navigator.canShare
      });

      // Try native share with the video file
      if (navigator.share) {
        const shareData = {
          files: [file],
          title: movie?.title || 'Puzzle Movie',
          text: `Check out this puzzle movie!`
        };

        // Check if we can share this data
        const canShareFiles = navigator.canShare ? navigator.canShare(shareData) : false;
        console.log('🔍 Can share files?', canShareFiles);

        if (canShareFiles) {
          try {
            console.log('📤 Opening native share with video file...');
            await navigator.share(shareData);
            console.log('✅ Shared video successfully via native share');
            // Navigate back after successful share
            setTimeout(() => {
              navigate(`/gallery?tab=movies&movie=${movieId}&shared=true`);
            }, 500);
            return;
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              console.log('ℹ️ Share cancelled by user');
              // Still navigate back if user cancels
              navigate(`/gallery?tab=movies&movie=${movieId}&shared=true`);
              return;
            }
            console.error('❌ Native share failed:', error);
          }
        } else {
          console.warn('⚠️ Cannot share files with Web Share API on this device/browser');
        }
      } else {
        console.warn('⚠️ Web Share API not available');
      }

      // Fallback: Download the file
      console.log('📥 Falling back to download');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      // Navigate back after download
      setTimeout(() => {
        navigate(`/gallery?tab=movies&movie=${movieId}&shared=true`);
      }, 1000);

    } catch (error) {
      console.error('❌ Failed to handle recording completion:', error);
      setRecordingStatus({ state: 'error', error: (error as Error).message });
    } finally {
      // Restore original canvas dimensions
      if (originalCanvasDimensions.current && realSceneObjects) {
        const { renderer, camera } = realSceneObjects;
        renderer.setSize(originalCanvasDimensions.current.width, originalCanvasDimensions.current.height);
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.aspect = originalCanvasDimensions.current.width / originalCanvasDimensions.current.height;
          camera.updateProjectionMatrix();
        }
        console.log('📐 Canvas dimensions restored');
      }
    }
  };

  // Handle Play/Pause
  const handlePlayPause = () => {
    const player = gravityPlayerRef.current;
    if (!player) {
      console.log('❌ No gravity player');
      return;
    }

    if (isPlaying) {
      // Currently playing - pause it
      player.pause();
      setIsPlaying(false);
      setIsPaused(true);
      console.log('⏸️ Paused effect');
    } else {
      // Not playing - either start fresh or resume
      if (isPaused) {
        // Resume from pause
        player.resume();
        setIsPlaying(true);
        setIsPaused(false);
        console.log('▶️ Resuming effect from pause');
      } else {
        // Start fresh
        player.play();
        setIsPlaying(true);
        setIsPaused(false);
        console.log('▶️ Playing effect from start');
      }
    }
  };

  if (loading) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
      }}>
        Loading movie...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
        gap: '20px',
      }}>
        <div>Error: {error}</div>
        <button
          onClick={() => navigate('/gallery?tab=movies')}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '8px',
            color: '#fff',
            padding: '12px 24px',
            cursor: 'pointer',
          }}
        >
          Back to Gallery
        </button>
      </div>
    );
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      overflow: 'hidden',
      background: '#000',
    }}>
      {/* Close Button - Top Right */}
      {recordingStatus.state !== 'recording' && recordingStatus.state !== 'processing' && (
        <button
          onClick={() => navigate(`/gallery?tab=movies&movie=${movieId}&shared=true`)}
          style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(10px)',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '50%',
          width: '48px',
          height: '48px',
          color: '#fff',
          fontSize: '1.5rem',
          fontWeight: 300,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.transform = 'scale(1.1) rotate(90deg)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.5)';
          e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
        }}
      >
        ✕
      </button>
      )}

      {/* Recording Indicator */}
      {recordingStatus.state === 'recording' && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            left: '20px',
            background: 'rgba(239, 68, 68, 0.9)',
            backdropFilter: 'blur(10px)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '12px',
            padding: '12px 20px',
            color: '#fff',
            fontSize: '0.9rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 1001,
            animation: 'pulse 2s ease-in-out infinite',
          }}
        >
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: '#fff',
              animation: 'blink 1s ease-in-out infinite',
            }}
          />
          <span>Recording...</span>
        </div>
      )}

      {/* Processing Indicator */}
      {recordingStatus.state === 'processing' && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0, 0, 0, 0.9)',
            backdropFilter: 'blur(10px)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '16px',
            padding: '24px 32px',
            color: '#fff',
            fontSize: '1.1rem',
            fontWeight: 600,
            textAlign: 'center',
            zIndex: 1001,
          }}
        >
          <div>Preparing your video...</div>
          <div style={{ fontSize: '0.85rem', marginTop: '8px', opacity: 0.7 }}>
            This will only take a moment
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
      `}</style>

      {/* Play/Pause Button - Bottom Center (Hidden during recording) */}
      {(() => {
        const shouldShow = recordingStatus.state !== 'recording' && recordingStatus.state !== 'processing';
        console.log('🎮 Play button render check:', { state: recordingStatus.state, shouldShow });
        return shouldShow;
      })() && (
        <button
          onClick={handlePlayPause}
          style={{
          position: 'fixed',
          bottom: '30px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: isPlaying 
            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.8), rgba(220, 38, 38, 0.8))'
            : 'linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(22, 163, 74, 0.8))',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '16px',
          color: '#fff',
          padding: '16px 32px',
          fontSize: '1.1rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          zIndex: 1000,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: isPlaying
            ? '0 6px 20px rgba(239, 68, 68, 0.4)'
            : '0 6px 20px rgba(34, 197, 94, 0.4)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateX(-50%) translateY(-3px) scale(1.05)';
          e.currentTarget.style.boxShadow = isPlaying
            ? '0 8px 24px rgba(239, 68, 68, 0.5)'
            : '0 8px 24px rgba(34, 197, 94, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateX(-50%) translateY(0) scale(1)';
          e.currentTarget.style.boxShadow = isPlaying
            ? '0 6px 20px rgba(239, 68, 68, 0.4)'
            : '0 6px 20px rgba(34, 197, 94, 0.4)';
        }}
      >
        <span style={{ fontSize: '1.3rem' }}>{isPlaying ? '⏸' : '▶'}</span>
        <span>{isPlaying ? 'Pause' : 'Play'}</span>
      </button>
      )}

      {/* 3D Canvas - Centered viewport for recording */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: recordingStatus.state === 'recording' ? '#000' : 'transparent',
      }}>
        {/* Viewport container with aspect ratio constraint during recording */}
        <div style={{
          width: recordingStatus.state === 'recording' 
            ? (videoFormat === 'portrait' ? '56.25vmin' : videoFormat === 'square' ? '80vmin' : '100%')
            : '100%',
          height: recordingStatus.state === 'recording'
            ? (videoFormat === 'landscape' ? '56.25vmin' : videoFormat === 'square' ? '80vmin' : '100%')
            : '100%',
          maxWidth: '100%',
          maxHeight: '100%',
          position: 'relative',
          boxShadow: recordingStatus.state === 'recording' ? '0 10px 40px rgba(0,0,0,0.5)' : 'none',
        }}>
          {view && cells.length > 0 && (
            <SceneCanvas
            cells={cells}
            view={view}
            editMode={false}
            mode="add"
            onCellsChange={() => {}}
            layout="fullscreen"
            placedPieces={placedPiecesArray}
            hidePlacedPieces={false}
            temporarilyVisiblePieces={emptySet}
            explosionFactor={0}
            settings={envSettings} // Loaded from movie metadata
            puzzleMode={puzzleMode}
            showBonds={showBonds}
            containerOpacity={0} // Hide container for clean movie view
            containerColor="#888888"
            alwaysShowContainer={true}
            visibility={{
              xray: false,
              emptyOnly: false,
              sliceY: { center: 0.5, thickness: 1.0 },
            }}
            onSelectPiece={noOpSelectPiece}
            onSceneReady={(objects) => {
              setRealSceneObjects(objects);
              setCanvas(objects.renderer.domElement); // Capture canvas for recording
              console.log('🎬 Scene ready for effects');
            }}
          />
        )}
        </div>
      </div>

      {/* Headless gravity controller (no visual) */}
      {effectContext && (
        <MovieGravityPlayer
          ref={gravityPlayerRef}
          effectContext={effectContext}
          baseConfig={initialGravityConfig}
          autoplay={false}
          loop={false}
          onComplete={() => {
            console.log('🏁 Gravity playback complete');
            setIsPlaying(false);
            setIsPaused(false); // Reset paused state so next play starts fresh
            // GravityEffect.complete() will show bonds automatically
            
            // If recording, handle completion (use ref to avoid closure issues)
            console.log('🚩 Checking isRecordingRef.current:', isRecordingRef.current);
            if (isRecordingRef.current) {
              console.log('🎬 Recording was active, calling handleRecordingComplete');
              handleRecordingComplete();
            } else {
              console.log('ℹ️ Not recording');
            }
          }}
        />
      )}

    </div>
  );
};
