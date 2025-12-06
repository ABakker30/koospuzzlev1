// Gravity Movie Page - Standalone turntable effect viewer/recorder
// Follows Blueprint v2: Single responsibility, no cross-page coupling

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import SceneCanvas from '../../components/SceneCanvas';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { ijkToXyz } from '../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { buildEffectContext, type EffectContext } from '../../studio/EffectContext';
// import { GravityEffect } from '../../effects/gravity/GravityEffect'; // no longer needed here
import { GravityModal } from '../../effects/gravity/GravityModal';
import { CreditsModal } from '../../components/CreditsModal';
import { RecordingSetupModal, type RecordingSetup } from '../../components/RecordingSetupModal';
import { SaveMovieModal, type MovieSaveData } from '../../components/SaveMovieModal';
import { InfoModal } from '../../components/InfoModal';
import { SolutionStatsModal, type SolutionStats } from '../../components/modals/SolutionStatsModal';
import { MovieWhatsNextModal } from '../../components/modals/MovieWhatsNextModal';
import { EffectSelectorModal } from '../../components/modals/EffectSelectorModal';
import { ShareWelcomeModal } from '../../components/modals/ShareWelcomeModal';
import { SolveCompleteModal } from '../../components/modals/SolveCompleteModal';
import { ShareOptionsModal } from '../../components/modals/ShareOptionsModal';
import { RecordingService, type RecordingStatus } from '../../services/RecordingService';
import type { GravityEffectConfig } from '../../effects/gravity/types';
import { DEFAULT_GRAVITY } from '../../effects/gravity/types';
import type { IJK } from '../../types/shape';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../types/studio';
import { StudioSettingsService } from '../../services/StudioSettingsService';
import { SettingsModal } from '../../components/SettingsModal';
import { useDraggable } from '../../hooks/useDraggable';
import { useMoviePermissions } from '../../hooks/useMoviePermissions';
import * as THREE from 'three';
import '../../styles/shape.css';

// NEW: headless gravity controller
import MovieGravityPlayer, {
  type GravityMovieHandle,
} from '../../effects/gravity/MovieGravityPlayer';

interface PlacedPiece {
  uid: string;
  pieceId: string;
  orientationId: string;
  anchorSphereIndex: 0 | 1 | 2 | 3;
  cells: IJK[];  // Original IJK (for SceneCanvas rendering)
  cellsXYZ: { x: number; y: number; z: number }[];  // Final XYZ (for sorting/gravity)
  placedAt: number;
}

export const GravityMoviePage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  
  // Determine context from URL params
  const from = searchParams.get('from'); // 'gallery' | 'share' | 'solve-complete' | null
  const mode = searchParams.get('mode'); // 'create' | 'view' | null
  const autoplay = searchParams.get('autoplay') === 'true'; // Auto-start movie on load
  
  // Data state
  const [movie, setMovie] = useState<any>(null); // When viewing existing movie
  const [solution, setSolution] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // User permissions for movie creation/editing
  const puzzleId = solution?.puzzle_id || movie?.solutions?.puzzle_id || null;
  const {
    currentUser,
    userHasSolved,
    canCreateMovie,
    permissionMessage,
    setPermissionMessage,
    checkPermissionAndShowMessage
  } = useMoviePermissions(movie, solution, puzzleId);
  
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
  
  // Gravity effect control (via headless component)
  const gravityPlayerRef = useRef<GravityMovieHandle | null>(null);
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
  
  // Slider panel collapsed state
  const [sliderPanelCollapsed, setSliderPanelCollapsed] = useState(false);
  
  // Recording state
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [showRecordingSetup, setShowRecordingSetup] = useState(false);
  const [showSaveMovie, setShowSaveMovie] = useState(false);
  const [showPageInfo, setShowPageInfo] = useState(false);
  const [recordingSetup, setRecordingSetup] = useState<RecordingSetup | null>(null);
  const [savedMovieId, setSavedMovieId] = useState<string | null>(null);
  const [isRecordingForShare, setIsRecordingForShare] = useState(false); // Flag to skip save modal for social platform recordings
  const [shouldReopenShare, setShouldReopenShare] = useState(false); // Flag to reopen share modal after download recording
  
  // Context-aware modals
  const [showSolutionStats, setShowSolutionStats] = useState(false);
  const [showWhatsNext, setShowWhatsNext] = useState(false);
  const [showShareWelcome, setShowShareWelcome] = useState(false);
  const [showSolveComplete, setShowSolveComplete] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [showEffectSelector, setShowEffectSelector] = useState(false);
  const [solutionStats, setSolutionStats] = useState<SolutionStats | null>(null);
  
  // Effect settings modal
  const [showGravityModal, setShowGravityModal] = useState(false);
  
  // Draggable sliders panel
  const slidersDraggable = useDraggable();
  
  // Function to close all modals
  const closeAllModals = () => {
    setShowCreditsModal(false);
    setShowRecordingSetup(false);
    setShowSaveMovie(false);
    setShowPageInfo(false);
    setShowSolutionStats(false);
    setShowWhatsNext(false);
    setShowShareWelcome(false);
    setShowSolveComplete(false);
    setShowShareOptions(false);
    setShowGravityModal(false);
    setShowEnvSettings(false);
  };
  
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
        let movieData: any = null;
        let solutionData: any = null;
        
        if (isViewMode) {
          // Load existing movie from DB
          console.log('📺 Loading movie:', id);
          const { data, error: movieError } = await supabase
            .from('movies')
            .select('*, solutions(*), puzzles(*)')
            .eq('id', id)
            .single();
          
          movieData = data;
          
          if (movieError || !movieData) {
            setError('Movie not found');
            setLoading(false);
            return;
          }
          
          setMovie(movieData);
          setSolution(movieData.solutions);
          setSavedMovieId(movieData.id); // Set movie ID for sharing
          console.log('✅ Movie loaded:', movieData.title);
          
          // Restore scene settings if stored with movie
          if (movieData.credits_config?.scene_settings) {
            console.log('🎨 Restoring scene settings from movie');
            setEnvSettings(movieData.credits_config.scene_settings);
            settingsService.current.saveSettings(movieData.credits_config.scene_settings);
          }
          
          // Increment view count (fire and forget)
          supabase.rpc('increment_movie_views', { movie_id: id }).then();
        } else {
          // Load solution for creating new movie
          console.log('🎬 Loading solution for recording:', id);
          const { data, error: solutionError } = await supabase
            .from('solutions')
            .select('*')
            .eq('id', id)
            .single();
          
          solutionData = data;
          
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
  }, [id, mode, from, currentUser]);
  
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
    const M = v.M_world;  // Use the computed view transformation
    
    placedPieces.forEach((piece: any, index: number) => {
      // Transform IJK cells to final XYZ coordinates (apply M directly to IJK like SceneCanvas does)
      const xyzCells = piece.cells.map((cell: IJK) => {
        return {
          x: M[0][0] * cell.i + M[0][1] * cell.j + M[0][2] * cell.k + M[0][3],
          y: M[1][0] * cell.i + M[1][1] * cell.j + M[1][2] * cell.k + M[1][3],
          z: M[2][0] * cell.i + M[2][1] * cell.j + M[2][2] * cell.k + M[2][3]
        };
      });
      
      // Debug: Log first 3 pieces to verify transformation
      if (index < 3) {
        const centroidY = xyzCells.reduce((sum: number, cell: any) => sum + cell.y, 0) / xyzCells.length;
        console.log(`🔧 Piece ${index} (${piece.uid.substring(0, 8)}):`, {
          numCells: xyzCells.length,
          centroidY: centroidY.toFixed(2),
          yRange: [Math.min(...xyzCells.map((c: any) => c.y)).toFixed(2), Math.max(...xyzCells.map((c: any) => c.y)).toFixed(2)],
          placedAt: piece.placedAt
        });
      }
      
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
    
    // Sort pieces by centroid Y using pre-computed XYZ coordinates
    const piecesArray = Array.from(placed.values());
    const piecesWithHeight = piecesArray.map(piece => {
      const centroidY = piece.cellsXYZ.reduce((sum, cell) => sum + cell.y, 0) / piece.cellsXYZ.length;
      return { piece, centroidY };
    });
    
    piecesWithHeight.sort((a, b) => {
      const yDiff = a.centroidY - b.centroidY;
      if (Math.abs(yDiff) > 0.001) return yDiff;
      return a.piece.placedAt - b.piece.placedAt;
    });
    
    // Debug: Log the sorted order
    console.log('🔍 Reveal sorted pieces by Y:', piecesWithHeight.map(p => ({
      uid: p.piece.uid.substring(0, 8),
      centroidY: p.centroidY.toFixed(2),
      placedAt: p.piece.placedAt
    })));
    
    const sorted = piecesWithHeight.map(item => item.piece);
    console.log(`🔍 Revealing ${revealK} of ${sorted.length} pieces`);
    return sorted.slice(0, revealK);
  }, [placed, revealK, revealMax]);
  
  // Check if all pieces are the same type (for distinct coloring)
  const puzzleMode = useMemo(() => {
    if (placed.size === 0) return 'oneOfEach';
    
    const pieces = Array.from(placed.values());
    const firstPieceId = pieces[0]?.pieceId;
    const allSameType = pieces.every(p => p.pieceId === firstPieceId);
    
    // If all pieces are same type, use 'unlimited' mode for distinct colors
    return allSameType ? 'unlimited' : 'oneOfEach';
  }, [placed]);
  
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
    }, 100);
  }, [realSceneObjects, placed]);
  
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
  
  // Show appropriate modal on entry
  useEffect(() => {
    if (!solution && !movie) return;
    
    // Determine which modal to show based on entry point
    if (from === 'solve-complete') {
      // Just completed puzzle - celebrate and encourage movie creation
      setShowSolveComplete(true);
    } else if (!mode && !from && solution && !movie) {
      // Direct solution view - show stats
      fetchSolutionStats();
      setShowSolutionStats(true);
    }
    // Note: gallery and share modals show AFTER playback completes
  }, [solution, movie, from, mode]);

  // Compute initial gravity config (used by MovieGravityPlayer)
  const initialGravityConfig: GravityEffectConfig = useMemo(() => {
    const baseConfig = movie?.effect_config || DEFAULT_GRAVITY;
    return {
      ...baseConfig,
      preserveControls: true,
      // Disable internal loop; page controls post-completion behavior
      loop: baseConfig.loop ? { ...baseConfig.loop, enabled: false } : undefined,
    } as GravityEffectConfig;
  }, [movie]);

  // Handle GravityEffect completion (replaces setOnComplete)
  const handleEffectComplete = () => {
    const currentRecordingState = recordingStatusRef.current.state;
    console.log('🎬 Gravity effect completed. Recording state:', currentRecordingState);
    console.log('🎬 Setting isPlaying to FALSE - bonds should now be visible');
    setIsPlaying(false);
    
    // Capture thumbnail when effect completes (if not already captured)
    if (!thumbnailBlob && canvas && mode !== 'view') {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          import('../../services/thumbnailService')
            .then(({ captureCanvasScreenshot }) =>
              captureCanvasScreenshot(canvas).then(blob => {
                setThumbnailBlob(blob);
              })
            )
            .catch(err => {
              console.error('❌ Failed to capture thumbnail:', err);
            });
        })
      );
    }
    
    // If recording, stop it and trigger download
    if (currentRecordingState === 'recording') {
      console.log('🎬 Effect complete during recording - stopping recording...');
      handleStopRecordingAndDownload();
    } else {
      // Show appropriate post-playback modal after 3 second delay
      console.log('🎬 Deciding which modal to show:', { from, mode, hasMovie: !!movie });
      setTimeout(() => {
        if (from === 'gallery') {
          console.log('📊 Showing What\'s Next (from gallery)');
          setShowWhatsNext(true);
        } else if (from === 'share') {
          console.log('📊 Showing Share Welcome (from share)');
          setShowShareWelcome(true);
        } else if (movie) {
          console.log('📊 Showing What\'s Next (has movie)');
          // Viewing a saved movie directly - show What's Next
          setShowWhatsNext(true);
        } else if (mode === 'create') {
          console.log('📊 Showing What\'s Next (create mode)');
          // Creating a new movie from manual solver - go directly to What's Next
          setShowWhatsNext(true);
        } else {
          console.log('⚠️ No modal condition matched! from:', from, 'mode:', mode, 'movie:', movie);
        }
      }, 3000);
    }
  };
  
  // Handle Play/Pause using headless player
  const handlePlayPause = () => {
    const player = gravityPlayerRef.current;
    if (!player) {
      console.log('No gravity player');
      return;
    }

    const newState = !isPlaying;
    setIsPlaying(newState);
    
    if (newState) {
      player.play();
      console.log('▶️ Playing effect');
    } else {
      player.pause();
      console.log('⏸️ Paused effect');
    }
  };
  
  // Handle recording start with user-selected settings
  const handleStartRecording = async (setup: RecordingSetup) => {
    setShowRecordingSetup(false);
    setRecordingSetup(setup); // Store for saving to DB later
    
    console.log('🎬 Starting recording with setup:', setup);
    
    try {
      if (!canvas) {
        throw new Error('Canvas not ready');
      }

      await recordingService.initialize(canvas, { quality: setup.quality });
      console.log(`🎬 Recording initialized: ${setup.quality} quality, ${setup.aspectRatio} aspect ratio`);
      
      // TODO: Apply aspect ratio to canvas rendering
      // For now, we record at full canvas size
      
      // Stop effect if playing to start fresh
      if (isPlaying) {
        gravityPlayerRef.current?.stop();
        setIsPlaying(false);
      }
      
      // Start recording
      await recordingService.startRecording();
      console.log('🎬 Recording started');
      
      gravityPlayerRef.current?.setRecording(true);
      
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
      
      gravityPlayerRef.current?.setRecording(false);
      
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
      
      // Check if this was a recording for sharing (social platform)
      if (isRecordingForShare) {
        console.log('📤 Recording for share complete - triggering auto-download');
        setIsRecordingForShare(false); // Reset flag
        
        // Auto-download the video immediately
        setTimeout(() => {
          const url = URL.createObjectURL(recordingStatus.blob!);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${solution?.puzzle_name || 'puzzle'}-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          console.log('✅ Video downloaded successfully');
          
          // If this was from download button, reopen share modal
          if (shouldReopenShare) {
            console.log('🔄 Reopening share modal after download');
            setTimeout(() => {
              setShowShareOptions(true);
              setShouldReopenShare(false);
            }, 500);
          }
        }, 100);
      } else {
        // Show save modal for initial recording
        console.log('💾 Recording complete - showing save modal');
        setShowSaveMovie(true);
      }
    }
  }, [recordingStatus, recordedBlob, isRecordingForShare, shouldReopenShare, solution?.puzzle_name, mode, from]);
  
  // Handle save movie to database
  const handleSaveMovie = async (movieData: MovieSaveData) => {
    try {
      const movieId = savedMovieId || movie?.id;
      const originalTitle = movie?.title;
      const titleChanged = originalTitle && movieData.title !== originalTitle;

      // If title changed, always save as new movie
      const isUpdate = !!movieId && !titleChanged;

      console.log(
        isUpdate
          ? '🔄 Updating existing movie'
          : titleChanged
          ? '📝 Title changed - saving as new movie'
          : '💾 Saving new movie to database'
      );

      // Capture thumbnail from canvas if not already captured
      let capturedBlob = thumbnailBlob;
      if (!capturedBlob && canvas) {
        try {
          // Wait 2 frames to ensure final render
          await new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          );

          const { captureCanvasScreenshot } = await import('../../services/thumbnailService');
          const blob = await captureCanvasScreenshot(canvas);
          capturedBlob = blob;
          setThumbnailBlob(blob);
        } catch (err) {
          console.error('❌ Failed to capture thumbnail:', err);
        }
      }

      // Get the active effect config via headless player
      const effectConfig = gravityPlayerRef.current?.getConfig() || DEFAULT_GRAVITY;

      let finalMovieId: string | null = movieId ?? null;

      if (isUpdate && movieId) {
        // Update existing movie
        const { data: updatedMovie, error: updateError } = await supabase
          .from('movies')
          .update({
            title: movieData.title,
            description: movieData.description,
            challenge_text: movieData.challenge_text,
            creator_name: movieData.creator_name,
            effect_config: effectConfig,
            is_public: movieData.is_public,
            duration_sec: effectConfig.durationSec,
            credits_config: {
              aspectRatio: recordingSetup?.aspectRatio,
              quality: recordingSetup?.quality,
              personal_message: movieData.personal_message,
              scene_settings: envSettings
            }
          })
          .eq('id', movieId)
          .select()
          .single();

        if (updateError || !updatedMovie) {
          throw new Error(updateError?.message || 'Failed to update movie');
        }

        console.log('✅ Movie updated:', updatedMovie.id);
        finalMovieId = updatedMovie.id;
      } else {
        if (!solution) {
          throw new Error('Solution not loaded – cannot save movie');
        }

        // Create new movie record with complete settings
        const { data: savedMovie, error: saveError } = await supabase
          .from('movies')
          .insert({
            puzzle_id: solution.puzzle_id,
            solution_id: solution.id,
            title: movieData.title,
            description: movieData.description,
            challenge_text: movieData.challenge_text,
            creator_name: movieData.creator_name,
            effect_type: 'gravity',
            effect_config: effectConfig,
            is_public: movieData.is_public,
            duration_sec: effectConfig.durationSec,
            // Store complete settings including 3D scene settings
            credits_config: {
              aspectRatio: recordingSetup?.aspectRatio,
              quality: recordingSetup?.quality,
              personal_message: movieData.personal_message,
              scene_settings: envSettings
            }
          })
          .select()
          .single();

        if (saveError || !savedMovie) {
          throw new Error(saveError?.message || 'Failed to save movie');
        }

        console.log('✅ Movie saved:', savedMovie.id);
        finalMovieId = savedMovie.id;
      }

      // Upload thumbnail, if we have one and a movie id
      if (finalMovieId && capturedBlob) {
        try {
          const { uploadMovieThumbnail } = await import('../../services/thumbnailService');
          const thumbnailUrl = await uploadMovieThumbnail(capturedBlob, finalMovieId);

          const { error: thumbUpdateError } = await supabase
            .from('movies')
            .update({ thumbnail_url: thumbnailUrl })
            .eq('id', finalMovieId);

          if (thumbUpdateError) {
            console.error('❌ Failed to update thumbnail URL:', thumbUpdateError);
          }
        } catch (uploadError) {
          console.error('❌ Failed to upload thumbnail:', uploadError);
        }
      }

      // Store the saved movie ID (for new movies only)
      if (!isUpdate && finalMovieId) {
        setSavedMovieId(finalMovieId);
      }

      // Close save modal
      setShowSaveMovie(false);

      // Show What's Next modal again (now with Share button enabled)
      setTimeout(() => {
        setShowWhatsNext(true);
      }, 300);
    } catch (error) {
      console.error('Failed to save/update movie:', error);
      throw error; // Let modal handle error display
    }
  };
  
  // Handle credits submit (save movie)
  const handleCreditsSubmit = async (credits: any) => {
    console.log('💾 Saving movie with credits:', credits);
    
    // Save movie to database with credits and thumbnail
    await handleSaveMovie({
      title: credits.title,
      description: credits.description,
      challenge_text: credits.challengeText,
      creator_name: credits.creatorName || 'Anonymous',
      personal_message: credits.personalMessage || '',
      is_public: true
    });
    
    setShowCreditsModal(false);
  };
  
  // Handle gravity settings save (uses headless player)
  const handleGravitySave = (config: GravityEffectConfig) => {
    console.log('🎬 Gravity settings saved:', config);
    setShowGravityModal(false);
    
    const updatedConfig = { ...config, preserveControls: true };
    const player = gravityPlayerRef.current;
    if (!player) return;

    // Restart with new config
    player.stop();
    player.setConfig(updatedConfig);
    player.play();
    setIsPlaying(true);
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
  
  // Fetch solution stats (stub for now - will fetch from DB later)
  const fetchSolutionStats = async () => {
    // TODO: Fetch from Supabase
    // For now, set stub data
    setSolutionStats({
      manualCount: 0,
      autoCount: 0
    });
  };
  
  // Modal action handlers
  const handleTryManualSolve = () => {
    if (!solution) return;
    navigate(`/manual/${solution.puzzle_id}`);
  };
  
  const handleTryAutoSolve = () => {
    if (!solution) return;
    navigate(`/auto/${solution.puzzle_id}`);
  };
  
  const handleTryPuzzle = () => {
    if (!solution && !movie) return;
    if (movie) {
      navigate(`/manual/${movie.puzzle_id}`);
    } else if (solution) {
      navigate(`/manual/${solution.puzzle_id}`);
    }
  };
  
  const handleShareSolution = () => {
    const shareUrl = `${window.location.origin}/movies/gravity/${solution?.id || id}`;
    navigator.clipboard.writeText(shareUrl);
    alert(`📤 Share link copied!\n\n${shareUrl}`);
  };
  
  // Permission-checked wrapper for changing effect
  const handleChangeEffectClick = () => {
    if (!checkPermissionAndShowMessage('change movie effects')) return;
    setShowEffectSelector(true);
  };
  
  const handleChangeEffect = (effectType: 'turntable' | 'reveal' | 'gravity') => {
    if (!solution) return;
    // Navigate to the new effect page with the same solution
    navigate(`/movies/${effectType}/${solution.id}?mode=create`);
  };
  
  // Permission-checked wrapper for save movie
  const handleSaveMovieClick = () => {
    if (!checkPermissionAndShowMessage('create and save movies')) return;
    setShowSaveMovie(true);
  };
  
  const handleShareMovie = async () => {
    // Movie should be saved at this point (checked by button)
    // Open share options modal
    setShowShareOptions(true);
  };

  // Handle recording with platform-specific or custom settings
  const handleStartRecordingForPlatform = async (
    platform: 'instagram' | 'youtube' | 'tiktok' | 'download',
    aspectRatio?: 'landscape' | 'portrait' | 'square',
    quality?: 'low' | 'medium' | 'high'
  ) => {
    // Platform-specific recording settings
    const platformSettings: Record<'instagram' | 'youtube' | 'tiktok', RecordingSetup> = {
      instagram: {
        aspectRatio: 'portrait', // Portrait (9:16) for Instagram
        quality: 'high'
      },
      youtube: {
        aspectRatio: 'landscape', // Landscape (16:9) for YouTube
        quality: 'high'
      },
      tiktok: {
        aspectRatio: 'portrait', // Portrait (9:16) for TikTok
        quality: 'high'
      }
    };

    let setup: RecordingSetup;
    
    if (platform === 'download') {
      // Use custom settings for download
      setup = {
        aspectRatio: aspectRatio || 'landscape',
        quality: quality || 'high'
      };
      // Mark to reopen share modal after download
      setShouldReopenShare(true);
    } else {
      // Use platform-specific settings
      setup = platformSettings[platform];
    }
    
    // Mark as recording for share (skip save modal after recording)
    setIsRecordingForShare(true);
    
    // Start recording with settings
    await handleStartRecording(setup);
  };
  
  const handleBackToGallery = () => {
    navigate('/gallery?tab=movies');
  };
  
  const handleExplorePuzzles = () => {
    navigate('/gallery');
  };
  
  const handlePlayAgain = () => {
    const player = gravityPlayerRef.current;
    if (!player) return;

    // Restart effect
    player.stop();
    setIsPlaying(false);
    
    // Restart after a brief delay
    setTimeout(() => {
      player.play();
      setIsPlaying(true);
    }, 100);
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
          onClick={() => navigate('/gallery?tab=movies')}
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
      {/* Permission notification */}
      {permissionMessage && (
        <div style={{
          position: 'fixed',
          top: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(239, 68, 68, 0.95)',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 10000,
          maxWidth: '90%',
          textAlign: 'center'
        }}>
          {permissionMessage}
        </div>
      )}
      
      {/* Header */}
      <div className="header" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '64px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.95) 100%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(10px)',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        padding: '0 12px',
        gap: '8px',
        zIndex: 1000
      }}>
        {/* Left: Movie Settings */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className="pill"
            onClick={() => { closeAllModals(); setShowGravityModal(true); }}
            title="Movie Settings"
            style={{
              background: 'linear-gradient(135deg, #ec4899, #db2777)',
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
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            🎬
          </button>
        </div>
        
        {/* Center: Play */}
        <div style={{ 
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {effectContext && (
            <button
              onClick={handlePlayPause}
              title={isPlaying ? 'Pause' : 'Play'}
              style={{
                background: isPlaying ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                fontWeight: 700,
                border: 'none',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                cursor: 'pointer',
                fontSize: '16px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Arial, sans-serif',
                flexShrink: 0
              }}
            >
              {isPlaying ? '❚❚' : '►'}
            </button>
          )}
        </div>
        
        {/* Right: Info, Settings & Gallery */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          alignItems: 'center',
          justifyContent: 'flex-end'
        }}>
          {/* Info Button */}
          <button
            className="pill"
            onClick={() => { closeAllModals(); setShowPageInfo(true); }}
            title="Info"
            style={{
              background: 'rgba(255, 255, 255, 0.18)',
              color: '#fff',
              fontWeight: 700,
              border: '1px solid rgba(255, 255, 255, 0.3)',
              fontSize: '16px',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            ℹ
          </button>
          
          {/* Settings Button */}
          <button
            className="pill"
            onClick={() => { closeAllModals(); setShowEnvSettings(true); }}
            title="Settings"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
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
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            ⚙
          </button>
          
          {/* Gallery Button */}
          <button
            className="pill"
            onClick={() => navigate('/gallery?tab=movies')}
            title="Movie Gallery"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
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
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            ⊞
          </button>
        </div>
      </div>
      
      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', marginTop: '64px' }}>
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
              sliceY: { center: 0.5, thickness: 1.0 },
            }}
            puzzleMode={puzzleMode}
            // Show bonds when idle, hide during playback for cleaner movie visuals
            showBonds={!isPlaying}
            onSelectPiece={() => {}}
            onSceneReady={handleSceneReady}
          />
        )}

        {/* Headless gravity controller (no visual) */}
        {effectContext && (
          <MovieGravityPlayer
            ref={gravityPlayerRef}
            effectContext={effectContext}
            baseConfig={initialGravityConfig}
            autoplay={autoplay}
            loop={false}
            onComplete={handleEffectComplete}
          />
        )}
        
        {/* Reveal / Explosion Sliders - Bottom Right */}
        {(revealMax > 0 || explosionFactor > 0) && (
          <div
            ref={slidersDraggable.ref}
            style={{
              position: 'fixed',
              bottom: sliderPanelCollapsed ? 'max(8px, env(safe-area-inset-bottom))' : '20px',
              right: sliderPanelCollapsed ? 'max(8px, env(safe-area-inset-right))' : '20px',
              background: 'rgba(0, 0, 0, 0.85)',
              borderRadius: '8px',
              padding: '12px 12px 0',
              minWidth: sliderPanelCollapsed ? '60px' : '240px',
              maxWidth: sliderPanelCollapsed ? '60px' : 'min(240px, 90vw)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              zIndex: 1000,
              userSelect: 'none',
              transition: 'min-width 0.2s ease, max-width 0.2s ease, right 0.3s ease, bottom 0.3s ease',
              touchAction: 'none',
              ...(sliderPanelCollapsed ? {} : slidersDraggable.style),
              cursor: sliderPanelCollapsed ? 'pointer' : 'move'
            }}>
            {/* Draggable Handle with Collapse Button */}
            <div style={{
              padding: '8px 15px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              userSelect: 'none',
              ...slidersDraggable.headerStyle
            }}>
              <div style={{
                width: '40px',
                height: '4px',
                background: 'rgba(255, 255, 255, 0.3)',
                borderRadius: '2px',
                flex: 1
              }} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSliderPanelCollapsed(!sliderPanelCollapsed);
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  setSliderPanelCollapsed(!sliderPanelCollapsed);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: 'none',
                  borderRadius: '4px',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#fff',
                  fontSize: '14px',
                  marginLeft: '8px',
                  transition: 'all 0.2s',
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent'
                }}
                title={sliderPanelCollapsed ? 'Expand' : 'Collapse'}
              >
                {sliderPanelCollapsed ? '▲' : '▼'}
              </button>
            </div>
            
            {/* Sliders Content */}
            {!sliderPanelCollapsed && (
              <div 
                style={{ padding: '0 15px 15px' }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                {/* Reveal Slider */}
                {revealMax > 0 && (
                  <div 
                    style={{ marginBottom: '15px' }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                  >
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
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
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
        )}
      </div>
      
      {/* Modals */}
      <RecordingSetupModal
        isOpen={showRecordingSetup}
        onClose={() => setShowRecordingSetup(false)}
        onStart={handleStartRecording}
      />
      
      <GravityModal
        isOpen={showGravityModal}
        onClose={() => setShowGravityModal(false)}
        onSave={handleGravitySave}
      />
      
      <SaveMovieModal
        isOpen={showSaveMovie}
        onClose={() => {
          setShowSaveMovie(false);
          // Show What's Next modal when closing without saving
          if (!savedMovieId && !movie?.id && recordedBlob) {
            setTimeout(() => setShowWhatsNext(true), 300);
          }
        }}
        onSave={handleSaveMovie}
        puzzleName={solution?.puzzle_name || 'Puzzle'}
        effectType="Gravity"
      />
      
      <CreditsModal
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        onSave={handleCreditsSubmit}
        onDownload={handleDownloadVideo}
        puzzleName={solution?.puzzle_name || 'Puzzle'}
        effectType="Gravity"
        recordedBlob={recordedBlob || undefined}
      />
      
      {/* Page Info Modal */}
      <InfoModal
        isOpen={showPageInfo}
        onClose={() => setShowPageInfo(false)}
        title="🎬 Gravity Movie Page"
        aiContext={{
          screen: 'gravity-movie',
          topic: mode === 'create' ? 'recording-gravity' : from === 'share' ? 'viewing-shared-movie' : 'turntable-playback'
        }}
      >
        <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#4b5563' }}>
          <p style={{ marginBottom: '16px' }}>
            <strong>Gravity Movie Page:</strong> Create and view 360° rotating animations of puzzle solutions.
          </p>
          
          {/* Button Guide */}
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontWeight: 600, marginBottom: '8px', color: '#1f2937' }}>📍 Header Buttons:</p>
            <ul style={{ marginLeft: '20px', marginBottom: '0' }}>
              <li><strong>🎬 Movie Settings</strong> (Left) - Configure rotation speed, direction, duration, and easing</li>
              <li><strong>► Play/Pause</strong> (Center) - Start or pause the turntable animation</li>
              <li><strong>ℹ Info</strong> (Right) - View this help information</li>
              <li><strong>⚙ Scene Settings</strong> (Right) - Adjust 3D lighting, materials, and environment</li>
              <li><strong>⊞ Gallery</strong> (Right) - Return to puzzle and movie gallery</li>
            </ul>
          </div>

          {/* Mode-specific info */}
          {mode === 'create' || from === 'solve-complete' ? (
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontWeight: 600, marginBottom: '8px', color: '#1f2937' }}>🎥 Share & Record Workflow:</p>
              <ul style={{ marginLeft: '20px', marginBottom: '0' }}>
                <li>Click <strong>Share</strong> button in "What's Next" modal after recording completes</li>
                <li>Choose your platform: Instagram, YouTube, TikTok, or Download</li>
                <li>Platform-specific formats are automatically configured</li>
                <li>For Download, choose custom aspect ratio and quality</li>
                <li>Animation plays and records automatically</li>
                <li>Video saves to your device, ready to share</li>
              </ul>
            </div>
          ) : null}
          
          <p style={{ marginTop: '16px', fontSize: '13px', color: '#6b7280' }}>
            💡 <strong>Tip:</strong> Drag the Reveal/Explosion sliders to customize the view. Scene stays interactive - you can orbit the camera while modals are open!
          </p>
        </div>
      </InfoModal>
      
      {/* Context-Aware Modals */}
      <SolutionStatsModal
        isOpen={showSolutionStats}
        onClose={() => setShowSolutionStats(false)}
        stats={solutionStats}
        puzzleName={solution?.puzzle_name || 'Puzzle'}
        onWatchMovie={() => setShowSolutionStats(false)}
        onTryManual={handleTryManualSolve}
        onTryAuto={handleTryAutoSolve}
        onCreateMovie={() => {
          closeAllModals();
          setShowRecordingSetup(true);
        }}
        onShare={handleShareSolution}
      />
      
      <MovieWhatsNextModal
        isOpen={showWhatsNext}
        onClose={() => setShowWhatsNext(false)}
        movieTitle={movie?.title || solution?.puzzle_name || 'Gravity Movie'}
        isSaved={(() => {
          const saved = !!(savedMovieId || movie?.id);
          console.log('📊 isSaved calculation:', { savedMovieId, movieId: movie?.id, result: saved, mode, from });
          return saved;
        })()}
        onPlayAgain={() => {
          setShowWhatsNext(false);
          handlePlayAgain();
        }}
        onTryPuzzle={() => {
          setShowWhatsNext(false);
          handleTryPuzzle();
        }}
        onSaveMovie={() => {
          setShowWhatsNext(false);
          handleSaveMovieClick();
        }}
        onShareMovie={() => {
          setShowWhatsNext(false);
          handleShareMovie();
        }}
        onChangeEffect={() => {
          setShowWhatsNext(false);
          handleChangeEffectClick();
        }}
      />
      
      <EffectSelectorModal
        isOpen={showEffectSelector}
        onClose={() => setShowEffectSelector(false)}
        onSelectEffect={handleChangeEffect}
        currentEffect="gravity"
      />
      
      <ShareWelcomeModal
        isOpen={showShareWelcome}
        onClose={() => setShowShareWelcome(false)}
        movieTitle={movie?.title || 'Gravity Movie'}
        creatorName={movie?.creator_name}
        personalMessage={movie?.credits_config?.personal_message}
        onTryPuzzle={() => {
          setShowShareWelcome(false);
          handleTryPuzzle();
        }}
        onWatchAgain={() => {
          setShowShareWelcome(false);
          handlePlayAgain();
        }}
        onCreateOwn={() => {
          setShowShareWelcome(false);
          handleTryPuzzle();
        }}
        onExplorePuzzles={() => {
          setShowShareWelcome(false);
          handleExplorePuzzles();
        }}
        onShare={() => {
          handleShareMovie();
        }}
      />
      
      <SolveCompleteModal
        isOpen={showSolveComplete}
        onClose={() => setShowSolveComplete(false)}
        puzzleName={solution?.puzzle_name || 'Puzzle'}
        solveTime={solution?.solve_time_ms}
        moveCount={solution?.move_count}
        onCreateMovie={() => {
          closeAllModals();
          setShowRecordingSetup(true);
        }}
        onPreviewSolution={() => setShowSolveComplete(false)}
        onSolveAgain={() => {
          setShowSolveComplete(false);
          handleTryPuzzle();
        }}
        onBackToGallery={handleBackToGallery}
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
      
      {/* Share Options Modal */}
      <ShareOptionsModal
        isOpen={showShareOptions}
        onClose={() => setShowShareOptions(false)}
        shareUrl={`${window.location.origin}/movies/gravity/${savedMovieId || movie?.id || id}?from=share`}
        movieTitle={movie?.title || solution?.puzzle_name || 'Gravity Movie'}
        isSaved={!!(savedMovieId || movie?.id)}
        onStartRecording={handleStartRecordingForPlatform}
        onSaveFirst={() => {
          setShowShareOptions(false);
          setShowSaveMovie(true);
        }}
      />
    </div>
  );
};

export default GravityMoviePage;
