// ShareClipModal — records a vertical (9:16) clip of the solved puzzle with a
// personalization overlay, then offers it for download so it can be posted to
// IG / TikTok / YouTube (which don't support links).
//
// The puzzle is spun by directly rotating the placed-pieces group (the same
// group SceneCanvas's built-in turntable rotates) on a rAF loop while the board
// keeps rendering. clipRecorder composites that canvas into a portrait frame +
// overlay, and RecordingService captures the compositor.
//
// Preview note: we do NOT play the recorded blob back in a <video> — Chrome's
// MediaRecorder writes the MP4 moov atom at the end, so the file plays in real
// players but an inline blob <video> often shows black. Instead the "done"
// preview keeps re-rendering the same composited spin live (which is known to
// work), and the downloadable MP4 is the real artifact.

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
  spheresGroup: { rotation: { y: number }; children: any[] };
  centroidWorld: any;
};

interface ShareClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  sceneObjects: SceneObjects | null;
  puzzleName?: string;
  solverName?: string;
  /** Pieces the solver placed themselves (source === 'user'). */
  placementsByYou?: number;
  /** Total pieces in the solved puzzle. */
  totalPieces?: number;
  /** Piece uids in solve order (placedAt asc) — drives the assemble reveal. */
  placementOrder?: string[];
  /** Saved solution id — used to build the shareable /c/ challenge link. */
  solutionId?: string | null;
}

const CLIP_DURATION_SEC = 8;
const ASSEMBLE_FRACTION = 0.75; // build over the first 75%, then hold + spin

type Phase = 'idle' | 'recording' | 'done' | 'error';

export const ShareClipModal: React.FC<ShareClipModalProps> = ({
  isOpen,
  onClose,
  sceneObjects,
  puzzleName,
  solverName,
  placementsByYou,
  totalPieces,
  placementOrder,
  solutionId,
}) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ClipComposer | null>(null);
  const spinRafRef = useRef<number | null>(null);     // one-shot spin while recording
  const previewRafRef = useRef<number | null>(null);   // continuous spin for the done-preview
  const recordCountRef = useRef(0);
  const baseRotationRef = useRef(0);
  const urlRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  // Two-way share: pick Video or Link first.
  const [view, setView] = useState<'choose' | 'video'>('choose');
  const [linkMsg, setLinkMsg] = useState<string | null>(null);

  const challengeUrl = solutionId ? `${window.location.origin}/c/${solutionId}` : null;

  const handleShareLink = async () => {
    if (!challengeUrl) return;
    const shareData = {
      title: 'Koos Puzzle challenge',
      text: solverName ? `Can you beat ${solverName}?` : 'Can you beat that?',
      url: challengeUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // user cancelled or share failed — fall through to copy
      return;
    }
    try {
      await navigator.clipboard.writeText(challengeUrl);
      setLinkMsg('Link copied!');
    } catch {
      setLinkMsg(challengeUrl);
    }
  };

  // Stop all loops, dispose the compositor, and restore the puzzle's rotation.
  const stopPreview = () => {
    if (spinRafRef.current != null) cancelAnimationFrame(spinRafRef.current);
    if (previewRafRef.current != null) cancelAnimationFrame(previewRafRef.current);
    spinRafRef.current = null;
    previewRafRef.current = null;
    composerRef.current?.stop();
    composerRef.current = null;
    const g = sceneObjects?.spheresGroup;
    if (g) {
      g.rotation.y = baseRotationRef.current;
      // Restore any pieces hidden by the assemble reveal.
      (g.children || []).forEach((o: any) => {
        if (o?.userData?.uid) o.visible = true;
      });
    }
  };

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      stopPreview();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isOpen) return null;

  // State the concrete target in the CTA — "Can you beat that?" is hollow
  // without a "that". X/N (placements by you) is accurate today; time is added
  // later once the ranked-run timer exists.
  const cta =
    placementsByYou != null && totalPieces && totalPieces > 0
      ? `Can you beat ${placementsByYou}/${totalPieces}?`
      : 'Can you beat that?';

  const overlay: ClipOverlay = {
    kicker: 'Solved!',
    name: solverName,
    cta,
    watermark: 'koospuzzle.com',
  };

  const canRecord = !!sceneObjects && phase !== 'recording';

  const handleClose = () => {
    stopPreview();
    onClose();
  };

  const handleRecordAgain = () => {
    stopPreview();
    if (previewRef.current) previewRef.current.innerHTML = '';
    setPhase('idle');
  };

  const handleRecord = async () => {
    const source = sceneObjects?.renderer?.domElement;
    const group = sceneObjects?.spheresGroup;
    if (!source || !group) return;

    setError(null);
    setPhase('recording');

    // Let React commit the 'recording' render so the preview container exists
    // before we append the compositor canvas to it.
    await new Promise((r) => setTimeout(r, 0));

    const composer = new ClipComposer();
    composerRef.current = composer;
    const recorder = new RecordingService();

    baseRotationRef.current = group.rotation.y;
    const startRotation = group.rotation.y;

    // Assemble reveal: map each piece uid -> its scene objects (mesh + bonds),
    // then reveal them in solve order as the puzzle spins.
    const byUid = new Map<string, any[]>();
    (group.children || []).forEach((ch: any) => {
      const uid = ch?.userData?.uid;
      if (uid) {
        const arr = byUid.get(uid) || [];
        arr.push(ch);
        byUid.set(uid, arr);
      }
    });
    const order = (placementOrder || []).filter((uid) => byUid.has(uid));
    const assemble = order.length > 1;
    const setRevealed = (n: number) => {
      order.forEach((uid, i) => {
        const vis = i < n;
        byUid.get(uid)!.forEach((o) => { o.visible = vis; });
      });
    };
    const showAllPieces = () => {
      byUid.forEach((objs) => objs.forEach((o) => { o.visible = true; }));
    };

    const spinStart = performance.now();
    const spin = () => {
      const t = (performance.now() - spinStart) / 1000;
      const frac = Math.min(t / CLIP_DURATION_SEC, 1);
      group.rotation.y = startRotation + frac * Math.PI * 2;
      if (assemble) {
        const aFrac = Math.min(t / (CLIP_DURATION_SEC * ASSEMBLE_FRACTION), 1);
        setRevealed(Math.ceil(aFrac * order.length));
      }
      if (t < CLIP_DURATION_SEC) {
        spinRafRef.current = requestAnimationFrame(spin);
      } else if (assemble) {
        showAllPieces();
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

      if (assemble) setRevealed(0); // start empty
      spinRafRef.current = requestAnimationFrame(spin);
      await recorder.startRecording();
      await new Promise((r) => setTimeout(r, (CLIP_DURATION_SEC + 0.3) * 1000));
      await recorder.stopRecording();

      if (spinRafRef.current != null) cancelAnimationFrame(spinRafRef.current);
      showAllPieces(); // done-preview shows the complete solution

      const status = recorder.getStatus();
      if (!status.blob || !status.downloadUrl) {
        throw new Error('Recording produced no output');
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = status.downloadUrl;
      recordCountRef.current += 1;

      // Keep the compositor running and loop the spin so the done-state shows a
      // reliable, live preview of exactly what the clip looks like.
      const loopStart = performance.now();
      const loop = () => {
        const t = (performance.now() - loopStart) / 1000;
        group.rotation.y = startRotation + ((t / CLIP_DURATION_SEC) % 1) * Math.PI * 2;
        previewRafRef.current = requestAnimationFrame(loop);
      };
      previewRafRef.current = requestAnimationFrame(loop);

      setPhase('done');
    } catch (e) {
      console.error('ShareClip: recording failed', e);
      stopPreview();
      if (previewRef.current) previewRef.current.innerHTML = '';
      setError(e instanceof Error ? e.message : 'Recording failed');
      setPhase('error');
    }
  };

  const handleDownload = () => {
    if (urlRef.current) {
      // Distinct name per clip so repeat downloads never silently overwrite.
      const base = (puzzleName || 'puzzle').replace(/\s+/g, '-');
      const n = recordCountRef.current;
      const name = `${base}-solved${n > 1 ? `-${n}` : ''}.mp4`;
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
      onClick={phase === 'recording' ? undefined : handleClose}
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
        {view === 'choose' && (
          <>
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>📤</div>
            <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '6px' }}>
              Share your solve
            </div>
            <div style={{ fontSize: '14px', opacity: 0.95, marginBottom: '20px', lineHeight: 1.5 }}>
              Post a video, or send a challenge link.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => setView('video')}
                style={{
                  background: '#10b981', color: '#fff', border: 'none', borderRadius: '10px',
                  padding: '14px 18px', fontSize: '16px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                🎬 Video <span style={{ opacity: 0.85, fontWeight: 500 }}>· IG / TikTok / YouTube</span>
              </button>
              <button
                onClick={handleShareLink}
                disabled={!challengeUrl}
                style={{
                  background: '#10b981', color: '#fff', border: 'none', borderRadius: '10px',
                  padding: '14px 18px', fontSize: '16px', fontWeight: 700,
                  cursor: challengeUrl ? 'pointer' : 'not-allowed', opacity: challengeUrl ? 1 : 0.5,
                }}
              >
                🔗 Link <span style={{ opacity: 0.85, fontWeight: 500 }}>· challenge a friend</span>
              </button>
              {linkMsg && <div style={{ fontSize: 13, marginTop: 2, wordBreak: 'break-all' }}>{linkMsg}</div>}
              {!challengeUrl && (
                <div style={{ fontSize: 12, opacity: 0.7 }}>Saving your solve…</div>
              )}
              <button
                onClick={handleClose}
                style={{
                  background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.4)',
                  borderRadius: '10px', padding: '10px 20px', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </>
        )}

        {view === 'video' && (
        <>
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

        {/* Vertical preview: the compositor canvas, spinning live (during
            recording, and looping afterwards as the result preview). */}
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
            <div ref={previewRef} style={{ width: '100%', height: '100%' }} />
          </div>
        )}

        {phase === 'recording' && (
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>
            Recording… spinning your solution ✨
          </div>
        )}

        {phase === 'done' && (
          <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '12px', lineHeight: 1.4 }}>
            Looks good? Download the clip and post it.
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
                onClick={handleRecordAgain}
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
            onClick={handleClose}
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
        </>
        )}
      </div>
    </div>
  );
};

export default ShareClipModal;
