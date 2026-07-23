// PromoClipModal — management-only recorder for the Discovery Challenge promo
// video: the UNSOLVED challenge puzzle slowly spinning in a vertical (9:16)
// frame with the contest pitch overlaid, ready to download and post anywhere.
// English-only on purpose: it's an admin tool and the social copy is Anton's
// voice. Reuses the ShareClipModal record pipeline (ClipComposer +
// RecordingService); no assemble reveal — the puzzle stays unsolved so the
// video gives nothing away.

import React, { useEffect, useRef, useState } from 'react';
import {
  ClipComposer,
  downloadClip,
  waitForFrames,
  type ClipOverlay,
} from '../services/clipRecorder';
import { recordClip } from '../services/clipEncoder';
import { getContest, type ContestConfig } from '../services/contestService';
import { track } from '../lib/observability';

const CLIP_DURATION_SEC = 12;
const MESSAGE_MAX = 90;

type SceneObjects = {
  renderer: { domElement: HTMLCanvasElement };
  spheresGroup: { rotation: { y: number }; children: any[] };
};

interface PromoClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  sceneObjects: SceneObjects | null;
  puzzleName?: string;
}

type Phase = 'idle' | 'recording' | 'done' | 'error';

export const PromoClipModal: React.FC<PromoClipModalProps> = ({
  isOpen,
  onClose,
  sceneObjects,
  puzzleName,
}) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ClipComposer | null>(null);
  const spinRafRef = useRef<number | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const baseRotationRef = useRef(0);
  const urlRef = useRef<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [story, setStory] = useState('');
  const [contest, setContest] = useState<ContestConfig | null>(null);
  // Sponsor logo preload probe — informational only. The composer does its
  // own CORS-safe preload and skips the logo on failure, so recording never
  // blocks on this; the note just tells the admin what to expect.
  const [logoState, setLogoState] = useState<'none' | 'loading' | 'ok' | 'failed'>('none');

  // The Discovery Challenge setup (contest_settings, edited in /admin) drives
  // the ENTIRE overlay; the configured custom message prefills the free-text
  // promotion line.
  useEffect(() => {
    getContest().then((c) => {
      setContest(c);
      if (c.message) setStory(c.message.slice(0, MESSAGE_MAX));
      if (c.partnerLogoUrl) {
        setLogoState('loading');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => setLogoState('ok');
        img.onerror = () => setLogoState('failed');
        img.src = c.partnerLogoUrl;
      }
    });
  }, []);

  const stopLoops = () => {
    if (spinRafRef.current != null) cancelAnimationFrame(spinRafRef.current);
    if (previewRafRef.current != null) cancelAnimationFrame(previewRafRef.current);
    spinRafRef.current = null;
    previewRafRef.current = null;
    composerRef.current?.stop();
    composerRef.current = null;
    const g = sceneObjects?.spheresGroup;
    if (g) g.rotation.y = baseRotationRef.current;
  };

  useEffect(() => {
    return () => {
      stopLoops();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isOpen) return null;

  // Overlay text comes ONLY from the promotion setup (never hardcoded, never
  // money-derived): kicker/headline/subline/CTA are the promo_* fields from
  // the Discovery Challenge card in /admin. Empty lines are omitted — the
  // composer draws each line independently. The watermark is brand chrome,
  // not promo copy, so it stays.
  const clean = (s: string | null | undefined): string | undefined => {
    const v = s?.trim();
    return v ? v : undefined;
  };
  const overlay: ClipOverlay = {
    kicker: clean(contest?.promoKicker),
    name: clean(contest?.promoHeadline),
    rank: clean(contest?.promoSubline),
    message: clean(story.slice(0, MESSAGE_MAX)),
    cta: clean(contest?.promoCta),
    watermark: 'koospuzzle.com',
    partner: contest?.partnerName ? `Brought to you by ${contest.partnerName}` : undefined,
    // Sponsor logo from the same setup — composer preloads CORS-safe and
    // silently records without it if it fails to load.
    ...(contest?.partnerLogoUrl
      ? { sponsorLogoUrl: contest.partnerLogoUrl, sponsorLabel: 'Sponsored' }
      : {}),
  };
  const configuredLines = [overlay.kicker, overlay.name, overlay.rank, overlay.cta].filter(
    (l): l is string => !!l
  );

  const handleRecord = async () => {
    const source = sceneObjects?.renderer?.domElement;
    const group = sceneObjects?.spheresGroup;
    if (!source || !group) return;

    setError(null);
    setPhase('recording');
    await new Promise((r) => setTimeout(r, 0));

    const composer = new ClipComposer();
    composerRef.current = composer;

    baseRotationRef.current = group.rotation.y;
    const startRotation = group.rotation.y;
    const spinStart = performance.now();
    const spin = () => {
      const t = (performance.now() - spinStart) / 1000;
      group.rotation.y = startRotation + Math.min(t / CLIP_DURATION_SEC, 1) * Math.PI * 2;
      if (t < CLIP_DURATION_SEC) spinRafRef.current = requestAnimationFrame(spin);
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
      // Real composited frames before capture attaches — timeout-guarded.
      await waitForFrames();
      spinRafRef.current = requestAnimationFrame(spin);
      // WebCodecs → exact-duration fast-start MP4 (IG-safe metadata).
      const result = await recordClip(c, CLIP_DURATION_SEC + 0.3);
      if (spinRafRef.current != null) cancelAnimationFrame(spinRafRef.current);

      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = result.url;
      blobRef.current = result.blob;

      // Live looping preview (blob playback in <video> is unreliable pre-moov).
      const loopStart = performance.now();
      const loop = () => {
        const t = (performance.now() - loopStart) / 1000;
        group.rotation.y = startRotation + ((t / CLIP_DURATION_SEC) % 1) * Math.PI * 2;
        previewRafRef.current = requestAnimationFrame(loop);
      };
      previewRafRef.current = requestAnimationFrame(loop);

      track('contest_promo_recorded');
      setPhase('done');
    } catch (e) {
      console.error('PromoClip: recording failed', e);
      stopLoops();
      if (previewRef.current) previewRef.current.innerHTML = '';
      setError(e instanceof Error ? e.message : 'Recording failed');
      setPhase('error');
    }
  };

  const handleDownload = () => {
    if (!urlRef.current) return;
    const ext = blobRef.current?.type.includes('mp4') ? 'mp4' : 'webm';
    downloadClip(urlRef.current, `discovery-challenge-${(puzzleName || 'promo').replace(/\s+/g, '-')}.${ext}`);
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
          🎬 Contest promo video
        </div>
        <div style={{ opacity: 0.75, fontSize: '0.85rem', marginBottom: 14 }}>
          12s vertical clip of the unsolved puzzle with the challenge pitch — download and
          post to TikTok / IG / X, or hand to a partner.
        </div>

        {phase === 'idle' && (
          <>
            <label style={{ fontSize: '0.85rem', opacity: 0.85 }}>
              Promotion text (shown in quotes mid-frame):
            </label>
            <textarea
              value={story}
              onChange={(e) => setStory(e.target.value)}
              maxLength={MESSAGE_MAX}
              rows={2}
              placeholder="Promotion text (shown in quotes mid-frame)"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginTop: 6,
                marginBottom: 14,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(0,0,0,0.3)',
                color: '#fff',
                padding: '8px 10px',
                fontSize: '0.9rem',
                resize: 'none',
              }}
            />
            <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: 14 }}>
              {configuredLines.length > 0 ? (
                <>
                  Overlay: {configuredLines.map((l) => `“${l}”`).join(' · ')}
                  {overlay.partner ? ` · “${overlay.partner}”` : ''}
                </>
              ) : (
                <>No promo text configured — set it in the Discovery Challenge card in /admin.</>
              )}
              {logoState === 'ok' && (
                <div style={{ marginTop: 4, color: '#34d399' }}>Sponsor logo: ✓ will appear</div>
              )}
              {logoState === 'failed' && (
                <div style={{ marginTop: 4, color: '#feca57' }}>
                  Sponsor logo failed to load — the clip records without it.
                </div>
              )}
            </div>
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

        {error && (
          <div style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {phase === 'idle' && (
            <button
              onClick={handleRecord}
              disabled={!sceneObjects}
              style={{ ...btn, background: 'linear-gradient(135deg, #feca57 0%, #f59e0b 100%)', color: '#1a1a1a', flex: 1 }}
            >
              ● Record 12s clip
            </button>
          )}
          {phase === 'recording' && (
            <div style={{ opacity: 0.8, fontSize: '0.9rem', padding: '10px 0' }}>Recording…</div>
          )}
          {phase === 'done' && (
            <>
              <button
                onClick={handleDownload}
                style={{ ...btn, background: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)', color: '#1a1a1a', flex: 1 }}
              >
                ⬇ Download
              </button>
              <button
                onClick={() => { stopLoops(); if (previewRef.current) previewRef.current.innerHTML = ''; setPhase('idle'); }}
                style={{ ...btn, background: 'rgba(255,255,255,0.15)', color: '#fff' }}
              >
                Re-record
              </button>
            </>
          )}
          <button onClick={handleClose} style={{ ...btn, background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromoClipModal;
