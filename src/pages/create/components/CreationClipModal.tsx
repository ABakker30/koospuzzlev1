// CreationClipModal — records a vertical (9:16) "I made this" clip of a saved
// puzzle: the shape materializes sphere by sphere (synthesized bottom-up,
// center-out order — reads like a 3D print) while the camera turntables, then
// the finished shape spins with a "Can you solve it?" dare. Reuses the solve
// clip pipeline (ClipComposer + RecordingService + share sheet + caption kit).
//
// The reveal is driven from OUTSIDE the 3D scene: the parent passes
// setDisplayCells, which overrides the cells fed to ShapeEditorCanvas while
// recording (and restores the full shape after). Camera spin uses the
// window.setCreateAutoRotate hook ShapeEditorCanvas exposes.

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipComposer,
  downloadClip,
  waitForFrames,
  type ClipOverlay,
} from '../../../services/clipRecorder';
import { RecordingService } from '../../../services/RecordingService';
import { track } from '../../../lib/observability';
import { ijkToXyz } from '../../../lib/ijk';
import type { IJK } from '../../../types/shape';

const CLIP_DURATION_SEC = 8;
const BUILD_FRACTION = 0.7; // materialize over the first 70%, then hold + spin
const MESSAGE_MAX = 60;

interface CreationClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The live WebGL canvas of the create page scene. */
  sourceCanvas: HTMLCanvasElement | null;
  /** Full cell list of the saved puzzle. */
  cells: IJK[];
  /** Override the cells rendered by the scene (null = show the real shape). */
  setDisplayCells: (cells: IJK[] | null) => void;
  puzzleName: string;
  puzzleId: string;
  creatorName?: string;
}

type Phase = 'idle' | 'recording' | 'done' | 'error';

/** Bottom-up, center-out reveal order — satisfying to watch, independent of
 *  the (unrecorded) order the creator actually clicked. */
function buildRevealOrder(cells: IJK[]): IJK[] {
  const pts = cells.map((c) => {
    const { x, y, z } = ijkToXyz(c);
    return { c, x, y, z };
  });
  const cx = pts.reduce((s, p) => s + p.x, 0) / (pts.length || 1);
  const cz = pts.reduce((s, p) => s + p.z, 0) / (pts.length || 1);
  return pts
    .sort((a, b) => {
      if (Math.abs(a.y - b.y) > 1e-6) return a.y - b.y;
      const da = (a.x - cx) ** 2 + (a.z - cz) ** 2;
      const db = (b.x - cx) ** 2 + (b.z - cz) ** 2;
      return da - db;
    })
    .map((p) => p.c);
}

export const CreationClipModal: React.FC<CreationClipModalProps> = ({
  isOpen,
  onClose,
  sourceCanvas,
  cells,
  setDisplayCells,
  puzzleName,
  puzzleId,
  creatorName,
}) => {
  const { t } = useTranslation();
  const MESSAGE_PRESETS = [t('creationClip.preset1'), t('creationClip.preset2'), t('creationClip.preset3')];
  const previewRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ClipComposer | null>(null);
  const rafRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const recordCountRef = useRef(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [captionMsg, setCaptionMsg] = useState<string | null>(null);

  const taunt = message.trim().slice(0, MESSAGE_MAX);
  const playUrl = `${window.location.origin}/play/${puzzleId}`;

  const stopPreview = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    composerRef.current?.stop();
    composerRef.current = null;
    (window as any).setCreateAutoRotate?.(false);
    setDisplayCells(null); // restore the real shape
  };

  useEffect(() => {
    return () => {
      stopPreview();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isOpen) return null;

  const overlay: ClipOverlay = {
    kicker: t('creationClip.overlayKicker'),
    name: creatorName,
    message: taunt || undefined,
    cta: t('creationClip.overlayCta'),
    watermark: 'koospuzzle.com',
  };

  const buildCaption = () =>
    [taunt, t('creationClip.caption', { url: playUrl }), t('shareClip.hashtags')]
      .filter(Boolean)
      .join('\n');

  const copyCaption = async (note: string) => {
    try {
      await navigator.clipboard.writeText(buildCaption());
      setCaptionMsg(note);
      track('caption_copied');
    } catch {
      /* clipboard unavailable — non-fatal */
    }
  };

  const clipFile = (blob: Blob): File => {
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const base = (puzzleName || 'puzzle').replace(/\s+/g, '-');
    return new File([blob], `${base}-created.${ext}`, { type: blob.type || 'video/mp4' });
  };

  const canShareFile = (): boolean => {
    const blob = blobRef.current;
    if (!blob || typeof navigator.canShare !== 'function') return false;
    try {
      return navigator.canShare({ files: [clipFile(blob)] });
    } catch {
      return false;
    }
  };

  const handleShareVideo = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    await copyCaption(t('shareClip.captionCopied'));
    try {
      await navigator.share({ files: [clipFile(blob)], title: 'Koos Puzzle', text: buildCaption() });
      track('share_completed', { channel: 'creation_share_sheet', has_message: !!taunt });
    } catch {
      /* user cancelled — caption stays on the clipboard */
    }
  };

  const handleDownload = () => {
    if (!urlRef.current) return;
    const base = (puzzleName || 'puzzle').replace(/\s+/g, '-');
    const n = recordCountRef.current;
    downloadClip(urlRef.current, `${base}-created${n > 1 ? `-${n}` : ''}.mp4`);
    void copyCaption(t('shareClip.captionCopied'));
    track('share_completed', { channel: 'creation_download', has_message: !!taunt });
  };

  const handleRecord = async () => {
    if (!sourceCanvas || cells.length === 0) return;
    setError(null);
    setPhase('recording');
    await new Promise((r) => setTimeout(r, 0)); // let the preview container mount

    const order = buildRevealOrder(cells);
    const composer = new ClipComposer();
    composerRef.current = composer;
    const recorder = new RecordingService();

    try {
      const c = composer.canvas;
      c.style.width = '100%';
      c.style.height = '100%';
      c.style.objectFit = 'contain';
      c.style.display = 'block';
      if (previewRef.current) {
        previewRef.current.innerHTML = '';
        previewRef.current.appendChild(c);
      }
      composer.start(sourceCanvas, overlay);
      await recorder.initialize(c, { quality: 'medium' });

      // Open on the FULL shape (the hook), then rebuild it sphere by sphere.
      setDisplayCells(cells);
      (window as any).setCreateAutoRotate?.(true, 6);

      const INTRO_SEC = 1.0;
      const start = performance.now();
      let shown = order.length;
      const step = () => {
        const t = (performance.now() - start) / 1000;
        const target =
          t < INTRO_SEC
            ? order.length
            : Math.max(1, Math.ceil(
                Math.min((t - INTRO_SEC) / (CLIP_DURATION_SEC * BUILD_FRACTION), 1) * order.length));
        if (target !== shown) {
          shown = target;
          setDisplayCells(order.slice(0, target));
        }
        if (t < CLIP_DURATION_SEC) rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);

      // Real composited frames before capture attaches (no blank first
      // frame), timeout-guarded so throttled rAF can't hang the recording.
      await waitForFrames();
      await recorder.startRecording();
      await new Promise((r) => setTimeout(r, (CLIP_DURATION_SEC + 0.3) * 1000));
      await recorder.stopRecording();

      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      setDisplayCells(null); // full shape for the done state
      (window as any).setCreateAutoRotate?.(true, 6); // keep spinning for the live preview

      const status = recorder.getStatus();
      if (!status.blob || !status.downloadUrl) throw new Error('Recording produced no output');
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = status.downloadUrl;
      blobRef.current = status.blob;
      recordCountRef.current += 1;
      track('creation_clip_recorded', { spheres: cells.length });
      setPhase('done');
    } catch (e) {
      console.error('CreationClip: recording failed', e);
      stopPreview();
      if (previewRef.current) previewRef.current.innerHTML = '';
      setError(e instanceof Error ? e.message : t('shareClip.recordingFailed'));
      setPhase('error');
    }
  };

  const handleClose = () => {
    stopPreview();
    onClose();
  };

  const btn = (bg: string, primary = true): React.CSSProperties => ({
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: primary ? '12px 20px' : '10px 20px',
    fontSize: primary ? '16px' : '14px',
    fontWeight: primary ? 700 : 600,
    cursor: 'pointer',
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10001,
      }}
      onClick={phase === 'recording' ? undefined : handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #667eea, #764ba2)',
          color: 'white',
          padding: '28px 32px',
          borderRadius: '16px',
          textAlign: 'center',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          maxWidth: '380px',
          minWidth: '300px',
        }}
      >
        <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎬</div>
        <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '6px' }}>
          {t('creationClip.title')}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.95, marginBottom: '14px', lineHeight: 1.5 }}>
          {t('creationClip.subtitle', { name: puzzleName || 'your puzzle' })}
        </div>

        {phase === 'idle' && (
          <div style={{ marginBottom: '16px', textAlign: 'left' }}>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
              placeholder={t('shareClip.messagePlaceholder')}
              maxLength={MESSAGE_MAX}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.4)',
                background: 'rgba(255,255,255,0.12)',
                color: '#fff',
                fontSize: '14px',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {MESSAGE_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setMessage(p)}
                  style={{
                    background: message === p ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)',
                    border: 'none',
                    borderRadius: '999px',
                    color: '#fff',
                    fontSize: '12px',
                    padding: '5px 10px',
                    cursor: 'pointer',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {(phase === 'recording' || phase === 'done') && (
          <div
            style={{
              width: '200px',
              height: '356px',
              margin: '0 auto 16px',
              background: '#000',
              borderRadius: '10px',
              overflow: 'hidden',
              boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
            }}
          >
            <div ref={previewRef} style={{ width: '100%', height: '100%' }} />
          </div>
        )}

        {phase === 'recording' && (
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>
            {t('creationClip.recording')}
          </div>
        )}
        {phase === 'done' && (
          <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '12px', lineHeight: 1.4 }}>
            {canShareFile() ? t('shareClip.looksGoodShare') : t('shareClip.looksGoodDownload')}
          </div>
        )}
        {captionMsg && (
          <div style={{ fontSize: '12px', color: '#d1ffe8', marginBottom: '10px' }}>{captionMsg}</div>
        )}
        {phase === 'error' && (
          <div style={{ fontSize: '14px', color: '#ffd1d1', marginBottom: '16px' }}>
            {error || t('shareClip.somethingWrong')}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {phase !== 'done' && (
            <button onClick={handleRecord} disabled={!sourceCanvas || phase === 'recording'} style={btn(sourceCanvas && phase !== 'recording' ? '#10b981' : 'rgba(255,255,255,0.25)')}>
              {phase === 'recording' ? t('shareClip.recordingBtn') : <>🎬 {t('shareClip.recordBtn')}</>}
            </button>
          )}
          {phase === 'done' && (
            <>
              {canShareFile() && (
                <button onClick={handleShareVideo} style={btn('#10b981')}>
                  {t('shareClip.shareVideo')}
                </button>
              )}
              <button onClick={handleDownload} style={btn(canShareFile() ? 'rgba(255,255,255,0.18)' : '#10b981', !canShareFile())}>
                {t('shareClip.downloadClip')}
              </button>
              <button
                onClick={() => {
                  stopPreview();
                  if (previewRef.current) previewRef.current.innerHTML = '';
                  setPhase('idle');
                }}
                style={btn('rgba(255,255,255,0.18)', false)}
              >
                {t('shareClip.recordAgain')}
              </button>
            </>
          )}
          <button
            onClick={handleClose}
            disabled={phase === 'recording'}
            style={{
              background: 'transparent',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: '10px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: phase === 'recording' ? 'not-allowed' : 'pointer',
              opacity: phase === 'recording' ? 0.5 : 1,
            }}
          >
            {t('shareClip.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreationClipModal;
