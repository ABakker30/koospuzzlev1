// ShareClipModal — records a vertical (9:16) turntable clip of the solved
// puzzle with a personalization overlay, then offers it for download so it can
// be posted to IG / TikTok / YouTube (which don't support links).
//
// Self-contained: builds an EffectContext from the live solve scene, drives a
// headless turntable, and composites the canvas into a portrait frame via
// clipRecorder. Mounted only while the user is recording a clip.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildEffectContext, type EffectContext } from '../../../studio/EffectContext';
import {
  MovieTurntablePlayer,
  type TurntableMovieHandle,
} from '../../../effects/turntable/MovieTurntablePlayer';
import { DEFAULT_CONFIG, type TurnTableConfig } from '../../../effects/turntable/types';
import {
  recordVerticalClip,
  downloadClip,
  type ClipOverlay,
} from '../../../services/clipRecorder';

type SceneObjects = {
  scene: any;
  camera: any;
  renderer: { domElement: HTMLCanvasElement };
  controls: any;
  spheresGroup: any;
  centroidWorld: any;
};

interface ShareClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  sceneObjects: SceneObjects | null;
  puzzleName?: string;
  solverName?: string;
  /** Pre-formatted stat chips, e.g. ["⏱ 1:23", "12 pieces"]. */
  stats?: string[];
}

const CLIP_DURATION_SEC = 6;

type Phase = 'idle' | 'recording' | 'done' | 'error';

export const ShareClipModal: React.FC<ShareClipModalProps> = ({
  isOpen,
  onClose,
  sceneObjects,
  puzzleName,
  solverName,
  stats,
}) => {
  const playerRef = useRef<TurntableMovieHandle>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  // Build the effect context once per scene.
  const effectContext = useMemo<EffectContext | null>(() => {
    if (!sceneObjects) return null;
    try {
      return buildEffectContext({
        scene: sceneObjects.scene,
        camera: sceneObjects.camera,
        renderer: sceneObjects.renderer as any,
        controls: sceneObjects.controls,
        spheresGroup: sceneObjects.spheresGroup,
        centroidWorld: sceneObjects.centroidWorld,
      });
    } catch (e) {
      console.error('ShareClip: failed to build effect context', e);
      return null;
    }
  }, [sceneObjects]);

  // Revoke any object URL on unmount.
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const overlay: ClipOverlay = {
    title: 'Solved! 🎉',
    subtitle: puzzleName,
    stats: stats && stats.length ? stats : undefined,
    attribution: solverName ? `by ${solverName}` : undefined,
    watermark: 'koospuzzle.com',
  };

  const canRecord = !!effectContext && !!sceneObjects && phase !== 'recording';

  const handleRecord = async () => {
    const player = playerRef.current;
    const canvas = sceneObjects?.renderer?.domElement;
    if (!player || !canvas) return;

    setError(null);
    setPhase('recording');

    // Snappier-than-default 6s, full 360 camera orbit returning to start.
    const cfg: TurnTableConfig = {
      ...DEFAULT_CONFIG,
      durationSec: CLIP_DURATION_SEC,
      finalize: 'returnToStart',
    };

    try {
      player.stop();
      player.setConfig(cfg);
      player.setRecording(true);
      player.play();

      const { url } = await recordVerticalClip(
        canvas,
        CLIP_DURATION_SEC + 0.3,
        overlay,
        { quality: 'medium', filename: `${puzzleName || 'puzzle'}-solved.mp4` }
      );

      player.setRecording(false);
      player.stop();

      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setPhase('done');
    } catch (e) {
      console.error('ShareClip: recording failed', e);
      player.setRecording(false);
      player.stop();
      setError(e instanceof Error ? e.message : 'Recording failed');
      setPhase('error');
    }
  };

  const handleDownload = () => {
    if (urlRef.current) {
      const name = `${(puzzleName || 'puzzle').replace(/\s+/g, '-')}-solved.mp4`;
      downloadClip(urlRef.current, name);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1002,
      }}
      onClick={phase === 'recording' ? undefined : onClose}
    >
      {/* Headless turntable driver — renders nothing visible. */}
      {effectContext && (
        <MovieTurntablePlayer
          ref={playerRef}
          effectContext={effectContext}
          baseConfig={{ ...DEFAULT_CONFIG, durationSec: CLIP_DURATION_SEC }}
          autoplay={false}
          loop={false}
        />
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #1e88e5, #42a5f5)',
          color: 'white',
          padding: '28px 32px',
          borderRadius: '16px',
          textAlign: 'center',
          boxShadow: '0 12px 40px rgba(30,136,229,0.5)',
          maxWidth: '380px',
          minWidth: '300px',
        }}
      >
        <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎬</div>
        <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '6px' }}>
          Share your solve
        </div>
        <div style={{ fontSize: '14px', opacity: 0.95, marginBottom: '20px', lineHeight: 1.5 }}>
          Record a vertical clip for Instagram, TikTok or YouTube Shorts.
        </div>

        {!effectContext && (
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '16px' }}>
            Scene not ready yet — give it a moment.
          </div>
        )}

        {phase === 'recording' && (
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>
            Recording… spinning your solution ✨
          </div>
        )}

        {phase === 'error' && (
          <div style={{ fontSize: '14px', color: '#ffd1d1', marginBottom: '16px' }}>
            {error || 'Something went wrong.'}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {phase !== 'done' && (
            <button
              onClick={handleRecord}
              disabled={!canRecord}
              style={{
                background: canRecord ? '#10b981' : 'rgba(255,255,255,0.25)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                padding: '12px 20px',
                fontSize: '16px',
                fontWeight: 700,
                cursor: canRecord ? 'pointer' : 'not-allowed',
              }}
            >
              {phase === 'recording' ? 'Recording…' : 'Record clip'}
            </button>
          )}

          {phase === 'done' && (
            <>
              <button
                onClick={handleDownload}
                style={{
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px 20px',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ⬇ Download clip
              </button>
              <button
                onClick={() => setPhase('idle')}
                style={{
                  background: 'rgba(255,255,255,0.18)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Record again
              </button>
            </>
          )}

          <button
            onClick={onClose}
            disabled={phase === 'recording'}
            style={{
              background: 'transparent',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: '10px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: phase === 'recording' ? 'not-allowed' : 'pointer',
              opacity: phase === 'recording' ? 0.5 : 1,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareClipModal;
