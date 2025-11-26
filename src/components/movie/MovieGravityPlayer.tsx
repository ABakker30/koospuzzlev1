// MovieGravityPlayer.tsx
// Headless, reusable Gravity movie player with play/pause/stop/loop + one-loop recording

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import * as THREE from 'three';
import { supabase } from '../../lib/supabase';
import SceneCanvas from '../../components/SceneCanvas';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { ijkToXyz } from '../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { buildEffectContext, type EffectContext } from '../../studio/EffectContext';
import { GravityEffect } from '../../effects/gravity/GravityEffect';
import type { GravityEffectConfig } from '../../effects/gravity/types';
import { DEFAULT_GRAVITY } from '../../effects/gravity/types';
import type { IJK } from '../../types/shape';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../types/studio';
import {
  RecordingService,
  type RecordingStatus,
} from '../../services/RecordingService';

interface PlacedPiece {
  uid: string;
  pieceId: string;
  orientationId: string;
  anchorSphereIndex: 0 | 1 | 2 | 3;
  cells: IJK[];
  cellsXYZ: { x: number; y: number; z: number }[];
  placedAt: number;
}

export type RecordingAspectRatio = 'landscape' | 'portrait' | 'square';
export type RecordingQuality = 'low' | 'medium' | 'high';

export interface GravityMovieHandle {
  play: () => void;
  pause: () => void;
  stop: () => void;
  /**
   * Start recording exactly one loop of the current effect.
   * The video blob is returned via onRecordingComplete.
   */
  startRecordingOneLoop: (options?: {
    aspectRatio?: RecordingAspectRatio;
    quality?: RecordingQuality;
  }) => Promise<void>;
}

interface MovieGravityPlayerProps {
  movieId: string;
  autoPlay?: boolean;
  loop?: boolean;
  onRecordingComplete?: (blob: Blob) => void;
}

interface SceneObjects {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: any;
  spheresGroup: THREE.Group;
  centroidWorld: THREE.Vector3;
}

export const MovieGravityPlayer = forwardRef<
  GravityMovieHandle,
  MovieGravityPlayerProps
>(({ movieId, autoPlay = false, loop = false, onRecordingComplete }, ref) => {
  // Data state
  const [movie, setMovie] = useState<any>(null);
  const [solution, setSolution] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Geometry + view
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [placed, setPlaced] = useState<Map<string, PlacedPiece>>(new Map());

  // Scene + effect
  const [sceneObjects, setSceneObjects] = useState<SceneObjects | null>(null);
  const [effectContext, setEffectContext] = useState<EffectContext | null>(null);
  const [activeEffectInstance, setActiveEffectInstance] = useState<GravityEffect | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Environment (use movie settings if available)
  const [envSettings, setEnvSettings] = useState<StudioSettings>(() => DEFAULT_STUDIO_SETTINGS);

  // Recording
  const [recordingService] = useState(() => new RecordingService());
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>({ state: 'idle' });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isRecordingRef = useRef(false);
  const currentConfigRef = useRef<GravityEffectConfig | null>(null);

  // For avoiding multiple auto-plays
  const hasAutoPlayedRef = useRef(false);

  // FCC transformation matrix
  const T_ijk_to_xyz = [
    [0.5, 0.5, 0, 0],
    [0.5, 0, 0.5, 0],
    [0, 0.5, 0.5, 0],
    [0, 0, 0, 1],
  ];

  // Load movie + solution
  useEffect(() => {
    let cancelled = false;

    const loadMovie = async () => {
      try {
        const { data, error: movieError } = await supabase
          .from('movies')
          .select('*, solutions(*)')
          .eq('id', movieId)
          .single();

        if (movieError || !data) {
          if (!cancelled) {
            setError('Movie not found');
            setLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setMovie(data);
          setSolution(data.solutions);
          if (data.credits_config?.scene_settings) {
            setEnvSettings(data.credits_config.scene_settings);
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load movie:', err);
          setError('Failed to load movie');
          setLoading(false);
        }
      }
    };

    loadMovie();
    return () => {
      cancelled = true;
    };
  }, [movieId]);

  // Process solution data when loaded
  useEffect(() => {
    if (!solution) return;

    const geometry = solution.final_geometry as IJK[];
    if (!geometry || geometry.length === 0) {
      setError('Solution has no geometry');
      return;
    }

    setCells(geometry);

    let v: ViewTransforms;
    try {
      v = computeViewTransforms(geometry, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
      setView(v);
    } catch (err) {
      console.error('Failed to compute view:', err);
      setError('Failed to process geometry');
      return;
    }

    const placedPieces = solution.placed_pieces || [];
    const placedMap = new Map<string, PlacedPiece>();
    const M = v.M_world;

    placedPieces.forEach((piece: any) => {
      const xyzCells = piece.cells.map((cell: IJK) => ({
        x: M[0][0] * cell.i + M[0][1] * cell.j + M[0][2] * cell.k + M[0][3],
        y: M[1][0] * cell.i + M[1][1] * cell.j + M[1][2] * cell.k + M[1][3],
        z: M[2][0] * cell.i + M[2][1] * cell.j + M[2][2] * cell.k + M[2][3],
      }));

      placedMap.set(piece.uid, {
        uid: piece.uid,
        pieceId: piece.pieceId,
        orientationId: piece.orientationId,
        anchorSphereIndex: piece.anchorSphereIndex,
        cells: piece.cells,
        cellsXYZ: xyzCells,
        placedAt: piece.placedAt,
      });
    });

    setPlaced(placedMap);
  }, [solution]);

  // All visible pieces
  const visiblePlacedPieces = useMemo(() => {
    return Array.from(placed.values());
  }, [placed]);

  // Puzzle coloring mode
  const puzzleMode = useMemo(() => {
    if (placed.size === 0) return 'oneOfEach';
    const pieces = Array.from(placed.values());
    const firstPieceId = pieces[0]?.pieceId;
    const allSameType = pieces.every((p) => p.pieceId === firstPieceId);
    return allSameType ? 'unlimited' : 'oneOfEach';
  }, [placed]);

  // Camera positioning (same as original)
  useEffect(() => {
    if (!sceneObjects || placed.size === 0) return;

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;

    Array.from(placed.values())
      .flatMap((p) => p.cellsXYZ)
      .forEach((cell) => {
        minX = Math.min(minX, cell.x);
        maxX = Math.max(maxX, cell.x);
        minY = Math.min(minY, cell.y);
        maxY = Math.max(maxY, cell.y);
        minZ = Math.min(minZ, cell.z);
        maxZ = Math.max(maxZ, cell.z);
      });

    const center = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2,
    };

    setTimeout(() => {
      if (sceneObjects.camera && sceneObjects.controls) {
        const maxSize = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
        const distance = maxSize * 2.5;

        sceneObjects.camera.position.set(
          center.x + distance * 0.7,
          center.y + distance * 0.7,
          center.z + distance * 0.7
        );
        sceneObjects.camera.lookAt(center.x, center.y, center.z);
        sceneObjects.controls.target.set(center.x, center.y, center.z);
        sceneObjects.controls.update();
      }
    }, 100);
  }, [sceneObjects, placed]);

  // Scene ready
  const handleSceneReady = (objs: SceneObjects) => {
    setSceneObjects(objs);
    const foundCanvas = objs.renderer?.domElement;
    if (foundCanvas) {
      canvasRef.current = foundCanvas;
    }
  };

  // Recording status callback
  useEffect(() => {
    recordingService.setStatusCallback(setRecordingStatus);
  }, [recordingService]);

  // Build effect context
  useEffect(() => {
    if (!sceneObjects || placed.size === 0) return;

    const ctx = buildEffectContext({
      scene: sceneObjects.scene,
      camera: sceneObjects.camera,
      renderer: sceneObjects.renderer,
      controls: sceneObjects.controls,
      spheresGroup: sceneObjects.spheresGroup,
      centroidWorld: sceneObjects.centroidWorld,
    });

    setEffectContext(ctx);
  }, [sceneObjects, placed]);

  // Initialize GravityEffect
  useEffect(() => {
    if (!effectContext) return;

    // Clean up previous instance
    if (activeEffectInstance) {
      activeEffectInstance.stop?.();
      activeEffectInstance.dispose?.();
    }

    const baseConfig: GravityEffectConfig = movie?.effect_config || DEFAULT_GRAVITY;

    const config: GravityEffectConfig = {
      ...baseConfig,
      preserveControls: true,
    };

    currentConfigRef.current = config;

    const instance = new GravityEffect();
    instance.init(effectContext);
    instance.setConfig(config);

    // On complete: if loop=true, replay; otherwise just mark stopped
    instance.setOnComplete(() => {
      if (!isRecordingRef.current && loop) {
        setTimeout(() => {
          instance.play();
        }, 500);
      } else if (!isRecordingRef.current) {
        setIsPlaying(false);
      }
    });

    setActiveEffectInstance(instance);
  }, [effectContext, movie, loop]);

  // Animation loop
  useEffect(() => {
    if (!activeEffectInstance) return;

    let animationFrameId: number;

    const tick = () => {
      activeEffectInstance.tick();
      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [activeEffectInstance]);

  // Auto-play once when ready
  useEffect(() => {
    if (!activeEffectInstance) return;
    if (!autoPlay) return;
    if (hasAutoPlayedRef.current) return;

    activeEffectInstance.play();
    setIsPlaying(true);
    hasAutoPlayedRef.current = true;
  }, [activeEffectInstance, autoPlay]);

  // Handle recording completion: emit blob once
  useEffect(() => {
    if (
      recordingStatus.state === 'idle' &&
      recordingStatus.blob &&
      isRecordingRef.current
    ) {
      const blob = recordingStatus.blob;
      isRecordingRef.current = false;
      onRecordingComplete?.(blob);
    }
  }, [recordingStatus, onRecordingComplete]);

  // Imperative API
  useImperativeHandle(
    ref,
    () => ({
      play() {
        if (!activeEffectInstance) return;
        activeEffectInstance.play();
        setIsPlaying(true);
      },
      pause() {
        if (!activeEffectInstance) return;
        if (activeEffectInstance.pause) {
          activeEffectInstance.pause();
        }
        setIsPlaying(false);
      },
      stop() {
        if (!activeEffectInstance) return;
        if (activeEffectInstance.stop) {
          activeEffectInstance.stop();
        }
        setIsPlaying(false);
      },
      async startRecordingOneLoop(options) {
        if (!activeEffectInstance) return;
        const canvas = canvasRef.current;
        if (!canvas) {
          console.error('Canvas not ready for recording');
          return;
        }

        const quality: RecordingQuality = options?.quality || 'high';
        const aspectRatio: RecordingAspectRatio = options?.aspectRatio || 'landscape';

        // NOTE: aspectRatio wiring into actual canvas size is TODO;
        // currently RecordingService.initialize only uses quality.
        console.log('🎬 startRecordingOneLoop', { quality, aspectRatio });

        try {
          await recordingService.initialize(canvas, { quality });
          await recordingService.startRecording();

          isRecordingRef.current = true;

          // Ensure effect starts from beginning
          if (activeEffectInstance.stop) {
            activeEffectInstance.stop();
          }
          
          // Set recording flag if method exists
          if ((activeEffectInstance as any).setRecording) {
            (activeEffectInstance as any).setRecording(true);
          }
          
          activeEffectInstance.play();
          setIsPlaying(true);

          const config = currentConfigRef.current || DEFAULT_GRAVITY;
          const durationSec = config.durationSec ?? DEFAULT_GRAVITY.durationSec ?? 5;
          const ms = (durationSec * 1000) | 0;

          // Stop recording after one loop duration
          setTimeout(async () => {
            if (!isRecordingRef.current) return;

            try {
              await recordingService.stopRecording();
            } catch (err) {
              console.error('Failed to stop recording:', err);
            } finally {
              if ((activeEffectInstance as any).setRecording) {
                (activeEffectInstance as any).setRecording(false);
              }
              // Keep playing if loop=true, otherwise stop
              if (!loop) {
                if (activeEffectInstance.stop) {
                  activeEffectInstance.stop();
                }
                setIsPlaying(false);
              } else {
                // For loop mode, ensure playback continues
                activeEffectInstance.play();
                setIsPlaying(true);
              }
            }
          }, ms + 250); // small safety margin
        } catch (err) {
          console.error('Failed to start recording one loop:', err);
          isRecordingRef.current = false;
        }
      },
    }),
    [activeEffectInstance, recordingService, loop]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeEffectInstance) {
        if (activeEffectInstance.stop) {
          activeEffectInstance.stop();
        }
        if (activeEffectInstance.dispose) {
          activeEffectInstance.dispose();
        }
      }
    };
  }, [activeEffectInstance]);

  // Headless: if not ready, render nothing
  if (loading || error || !solution) {
    return null;
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#000',
      }}
    >
      {view && placed.size > 0 && (
        <SceneCanvas
          key={`scene-${solution?.id || movieId}`}
          cells={cells}
          view={view}
          editMode={false}
          mode="add"
          onCellsChange={() => {}}
          placedPieces={visiblePlacedPieces}
          hidePlacedPieces={false}
          explosionFactor={0}
          settings={envSettings}
          containerOpacity={0}
          containerColor="#888888"
          visibility={{
            xray: false,
            emptyOnly: false,
            sliceY: { center: 0.5, thickness: 1.0 },
          }}
          puzzleMode={puzzleMode}
          onSelectPiece={() => {}}
          onSceneReady={handleSceneReady}
        />
      )}
    </div>
  );
});

MovieGravityPlayer.displayName = 'MovieGravityPlayer';

export default MovieGravityPlayer;
