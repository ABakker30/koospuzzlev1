// ExploreClipModal — share a solution from Explore as a vertical clip of the
// puzzle CONSTRUCTING itself (pieces appear in solve order while it spins),
// plus ready-to-paste invite text carrying the sender's name and a puzzle
// link. Reuses the solve-clip pipeline (ClipComposer + RecordingService);
// choreography matches ShareClipModal: 1s colorful beauty shot → assemble →
// hold + spin.

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipComposer,
  downloadClip,
  waitForFrames,
  type ClipOverlay,
} from '../../services/clipRecorder';
import { RecordingService } from '../../services/RecordingService';
import { track } from '../../lib/observability';
import { getShareUrl } from '../../utils/shareUrl';

const CLIP_DURATION_SEC = 8;
const INTRO_SEC = 1.0;
const ASSEMBLE_FRACTION = 0.65;
const MESSAGE_MAX = 60;

type SceneObjects = {
  renderer: { domElement: HTMLCanvasElement };
  spheresGroup: { rotation: { y: number }; children: any[] };
};

interface ExploreClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  sceneObjects: SceneObjects | null;
  puzzleId: string;
  puzzleName?: string | null;
  /** Piece uids in solve order (placedAt asc) — drives the construction. */
  placementOrder: string[];
  /** Sender's display name — carried in the invite text. */
  senderName?: string | null;
}

type Phase = 'idle' | 'recording' | 'done' | 'error';

export const ExploreClipModal: React.FC<ExploreClipModalProps> = ({
  isOpen,
  onClose,
  sceneObjects,
  puzzleId,
  puzzleName,
  placementOrder,
  senderName,
}) => {
  const { t } = useTranslation();
  const previewRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ClipComposer | null>(null);
  const spinRafRef = useRef<number | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const baseRotationRef = useRef(0);
  const urlRef = useRef<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [captionMsg, setCaptionMsg] = useState<string | null>(null);

  const stopLoops = () => {
    if (spinRafRef.current != null) cancelAnimationFrame(spinRafRef.current);
    if (previewRafRef.current != null) cancelAnimationFrame(previewRafRef.current);
    spinRafRef.current = null;
    previewRafRef.current = null;
    composerRef.current?.stop();
    composerRef.current = null;
    const g = sceneObjects?.spheresGroup;
    if (g) {
      g.rotation.y = baseRotationRef.current;
      (g.children || []).forEach((o: any) => {
        if (o?.userData?.uid) o.visible = true;
      });
    }
  };

  useEffect(() => {
    return () => {
      stopLoops();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isOpen) return null;

  const msg = message.trim().slice(0, MESSAGE_MAX);
  // OG-capable wrapper (crawlers get the puzzle card, humans a redirect).
  const puzzleUrl = getShareUrl('puzzle', puzzleId);

  const buildCaption = () => {
    const invite = senderName
      ? t('exploreClip.invite', { name: senderName, puzzle: puzzleName ?? 'this puzzle' })
      : t('exploreClip.inviteAnon', { puzzle: puzzleName ?? 'this puzzle' });
    return [
      invite,
      msg ? `“${msg}”` : null,
      t('exploreClip.tryIt', { url: puzzleUrl }),
      t('shareClip.hashtags'),
    ]
      .filter(Boolean)
      .join('\n');
  };

  const overlay: ClipOverlay = {
    kicker: t('exploreClip.overlayKicker'),
    name: puzzleName ?? 'Koos Puzzle',
    message: msg || undefined,
    cta: t('exploreClip.overlayCta'),
    watermark: 'koospuzzle.com',
  };

  const clipFile = (blob: Blob): File => {
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const base = (puzzleName || 'puzzle').replace(/\s+/g, '-');
    return new File([blob], `${base}-build.${ext}`, { type: blob.type || 'video/mp4' });
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(buildCaption());
      setCaptionMsg(t('shareClip.captionCopied'));
      track('caption_copied');
    } catch { /* clipboard unavailable */ }
  };

  const handleShareVideo = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    await copyCaption();
    try {
      await navigator.share({ files: [clipFile(blob)], title: 'Koos Puzzle', text: buildCaption() });
      track('share_completed', { channel: 'explore_video_share_sheet' });
    } catch { /* user cancelled — caption stays on the clipboard */ }
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

  const handleRecord = async () => {
    const source = sceneObjects?.renderer?.domElement;
    const group = sceneObjects?.spheresGroup;
    if (!source || !group) return;

    setError(null);
    setPhase('recording');
    await new Promise((r) => setTimeout(r, 0));

    const composer = new ClipComposer();
    composerRef.current = composer;
    const recorder = new RecordingService();

    baseRotationRef.current = group.rotation.y;
    const startRotation = group.rotation.y;

    // uid -> scene objects (mesh + bonds)
    const byUid = new Map<string, any[]>();
    (group.children || []).forEach((ch: any) => {
      const uid = ch?.userData?.uid;
      if (uid) {
        const arr = byUid.get(uid) || [];
        arr.push(ch);
        byUid.set(uid, arr);
      }
    });
    const order = placementOrder.filter((uid) => byUid.has(uid));
    const setRevealed = (n: number) => {
      order.forEach((uid, i) => {
        const vis = i < n;
        byUid.get(uid)!.forEach((o) => { o.visible = vis; });
      });
    };
    const showAll = () => byUid.forEach((objs) => objs.forEach((o) => { o.visible = true; }));

    const spinStart = performance.now();
    const spin = () => {
      const time = (performance.now() - spinStart) / 1000;
      group.rotation.y = startRotation + Math.min(time / CLIP_DURATION_SEC, 1) * Math.PI * 2;
      if (order.length > 1) {
        if (time < INTRO_SEC) {
          setRevealed(order.length); // colorful beauty shot first
        } else {
          const aFrac = Math.min((time - INTRO_SEC) / (CLIP_DURATION_SEC * ASSEMBLE_FRACTION), 1);
          setRevealed(Math.ceil(aFrac * order.length));
        }
      }
      if (time < CLIP_DURATION_SEC) {
        spinRafRef.current = requestAnimationFrame(spin);
      } else {
        showAll();
      }
    };

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
      composer.start(source, overlay);
      await recorder.initialize(c, { quality: 'medium' });
      await waitForFrames();
      spinRafRef.current = requestAnimationFrame(spin);
      await recorder.startRecording();
      await new Promise((r) => setTimeout(r, (CLIP_DURATION_SEC + 0.3) * 1000));
      await recorder.stopRecording();
      if (spinRafRef.current != null) cancelAnimationFrame(spinRafRef.current);
      showAll();

      const status = recorder.getStatus();
      if (!status.blob || !status.downloadUrl) throw new Error('Recording produced no output');
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = status.downloadUrl;
      blobRef.current = status.blob;

      // Live looping preview (blob playback pre-moov is unreliable).
      const loopStart = performance.now();
      const loop = () => {
        const time = (performance.now() - loopStart) / 1000;
        group.rotation.y = startRotation + ((time / CLIP_DURATION_SEC) % 1) * Math.PI * 2;
        previewRafRef.current = requestAnimationFrame(loop);
      };
      previewRafRef.current = requestAnimationFrame(loop);

      track('explore_clip_recorded');
      setPhase('done');
    } catch (e) {
      console.error('ExploreClip: recording failed', e);
      stopLoops();
      if (previewRef.current) previewRef.current.innerHTML = '';
      setError(e instanceof Error ? e.message : t('shareClip.recordingFailed'));
      setPhase('error');
    }
  };

  const handleClose = () => {
    stopLoops();
    onClose();
  };

  const btn: React.CSSProperties = {
    border: 'none',
    borderRadius: 10,
    padding: '12px 20px',
    fontWeight: 700,
    fontSize: '0.95rem',
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%)',
          borderRadius: 16,
          padding: 20,
          width: 'min(94vw, 420px)',
          maxHeight: '92dvh',
          overflowY: 'auto',
          color: '#fff',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>
          🎬 {t('exploreClip.title')}
        </div>
        <div style={{ opacity: 0.75, fontSize: '0.85rem', marginBottom: 14 }}>
          {t('exploreClip.subtitle')}
        </div>

        {phase === 'idle' && (
          <>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MESSAGE_MAX}
              placeholder={t('exploreClip.defaultMsg')}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginBottom: 14,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(0,0,0,0.3)',
                color: '#fff',
                padding: '10px 12px',
                fontSize: '0.9rem',
              }}
            />
          </>
        )}

        {(phase === 'recording' || phase === 'done') && (
          <div
            ref={previewRef}
            style={{
              width: '100%',
              aspectRatio: '9 / 16',
              maxHeight: '55dvh',
              margin: '0 auto 14px',
              borderRadius: 10,
              overflow: 'hidden',
              background: '#0b0b1e',
            }}
          />
        )}

        {captionMsg && (
          <div style={{ color: '#34d399', fontSize: '0.85rem', marginBottom: 10 }}>{captionMsg}</div>
        )}
        {error && (
          <div style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {phase === 'idle' && (
            <button
              onClick={handleRecord}
              disabled={!sceneObjects}
              style={{ ...btn, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', flex: 1 }}
            >
              ● {t('shareClip.recordBtn')}
            </button>
          )}
          {phase === 'recording' && (
            <div style={{ opacity: 0.8, fontSize: '0.9rem', padding: '10px 0' }}>
              {t('shareClip.recording')}
            </div>
          )}
          {phase === 'done' && (
            <>
              {canShareFile() && (
                <button
                  onClick={handleShareVideo}
                  style={{ ...btn, background: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)', color: '#1a1a1a', flex: 1 }}
                >
                  {t('shareClip.shareVideo')}
                </button>
              )}
              <button
                onClick={() => {
                  copyCaption();
                  if (urlRef.current) {
                    const ext = blobRef.current?.type.includes('mp4') ? 'mp4' : 'webm';
                    downloadClip(urlRef.current, `${(puzzleName || 'puzzle').replace(/\s+/g, '-')}-build.${ext}`);
                  }
                }}
                style={{ ...btn, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', flex: 1 }}
              >
                {t('shareClip.downloadClip')}
              </button>
              <button
                onClick={() => { stopLoops(); if (previewRef.current) previewRef.current.innerHTML = ''; setPhase('idle'); }}
                style={{ ...btn, background: 'rgba(255,255,255,0.15)', color: '#fff' }}
              >
                {t('shareClip.recordAgain')}
              </button>
            </>
          )}
          <button onClick={handleClose} style={{ ...btn, background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
            {t('shareClip.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExploreClipModal;
