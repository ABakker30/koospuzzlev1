// ShareClipModal — records a vertical (9:16) clip of the solved puzzle with a
// personalization overlay, then offers it for download so it can be posted to
// IG / TikTok / YouTube (which don't support links).
//
// The puzzle is spun by directly rotating the placed-pieces group (the same
// group SceneCanvas's built-in turntable rotates) on a rAF loop while the board
// keeps rendering. clipRecorder composites that canvas into a portrait frame +
// overlay, and RecordingService captures the compositor.

import React, { useEffect, useRef, useState } from 'react';
import {
  ClipComposer,
  downloadClip,
  type ClipOverlay,
} from '../../../services/clipRecorder';
import { RecordingService } from '../../../services/RecordingService';

type SceneObjects = {
  scene: any;
  camera: any;
  renderer: { domElement: HTMLCanvasElement };
  controls: any;
  spheresGroup: { rotation: { y: number } };
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
  const previewRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ClipComposer | null>(null);
  const spinRafRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  // Clean up on unmount: stop the compositor loop, cancel spin, revoke URL.
  useEffect(() => {
    return () => {
      composerRef.current?.stop();
      if (spinRafRef.current != null) cancelAnimationFrame(spinRafRef.current);
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

  const canRecord = !!sceneObjects && phase !== 'recording';

  const handleRecord = async () => {
    const source = sceneObjects?.renderer?.domElement;
    const group = sceneObjects?.spheresGroup;
    if (!source || !group) return;

    setError(null);
    setVideoUrl(null);
    setPhase('recording');

    // Let React commit the 'recording' render so the preview container exists
    // before we append the compositor canvas to it.
    await new Promise((r) => setTimeout(r, 0));

    const composer = new ClipComposer();
    composerRef.current = composer;
    const recorder = new RecordingService();

    // Spin the puzzle one full turn over the clip duration by rotating the
    // placed-pieces group directly. The board's render loop renders every
    // frame, so this shows up live and in the recording.
    const startRotation = group.rotation.y;
    const spinStart = performance.now();
    const spin = () => {
      const t = (performance.now() - spinStart) / 1000;
      const frac = Math.min(t / CLIP_DURATION_SEC, 1);
      group.rotation.y = startRotation + frac * Math.PI * 2;
      if (t < CLIP_DURATION_SEC) {
        spinRafRef.current = requestAnimationFrame(spin);
      }
    };

    try {
      // Mount the compositor canvas as a live preview so the user sees it build.
      const c = composer.canvas;
      c.style.width = '100%';
      c.style.height = '100%';
      c.style.objectFit = 'contain';
      c.style.display = 'block';
      if (previewRef.current) {
        previewRef.current.innerHTML = '';
        previewRef.current.appendChild(c);
      }
      composer.start(source, overlay);

      await recorder.initialize(c, { quality: 'medium' });

      spinRafRef.current = requestAnimationFrame(spin);
      await recorder.startRecording();
      await new Promise((r) => setTimeout(r, (CLIP_DURATION_SEC + 0.3) * 1000));
      await recorder.stopRecording();

      if (spinRafRef.current != null) cancelAnimationFrame(spinRafRef.current);
      group.rotation.y = startRotation;
      composer.stop();

      const status = recorder.getStatus();
      if (!status.blob || !status.downloadUrl) {
        throw new Error('Recording produced no output');
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = status.downloadUrl;
      setVideoUrl(status.downloadUrl);
      if (previewRef.current) previewRef.current.innerHTML = '';
      setPhase('done');
    } catch (e) {
      console.error('ShareClip: recording failed', e);
      if (spinRafRef.current != null) cancelAnimationFrame(spinRafRef.current);
      group.rotation.y = startRotation;
      composer.stop();
      if (previewRef.current) previewRef.current.innerHTML = '';
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

        {!sceneObjects && (
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '16px' }}>
            Scene not ready yet — give it a moment.
          </div>
        )}

        {/* Vertical preview: live compositor while recording, playable video when done. */}
        {(phase === 'recording' || phase === 'done') && (
          <div
            style={{
              width: '200px',
              height: '356px', // 9:16
              margin: '0 auto 16px',
              background: '#000',
              borderRadius: '10px',
              overflow: 'hidden',
              boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
            }}
          >
            {phase === 'done' && videoUrl ? (
              <video
                src={videoUrl}
                autoPlay
                loop
                muted
                playsInline
                controls
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div ref={previewRef} style={{ width: '100%', height: '100%' }} />
            )}
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
                onClick={() => { setVideoUrl(null); setPhase('idle'); }}
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
