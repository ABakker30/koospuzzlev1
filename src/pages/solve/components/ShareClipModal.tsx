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
import { useTranslation } from 'react-i18next';
import {
  ClipComposer,
  downloadClip,
  waitForFrames,
  type ClipOverlay,
} from '../../../services/clipRecorder';
import { recordClip } from '../../../services/clipEncoder';
import { track } from '../../../lib/observability';
import { getSolveRank, type SolveRank } from '../../../services/solveRankService';
import { paletteSignature, paletteLabel } from '../../../utils/piecePalette';
import { ensureShareCode } from '../../../services/challengeService';
import { getContest, isContestLive } from '../../../services/contestService';

const MESSAGE_MAX = 60;

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
  /** Solved puzzle's id — used to detect the live contest puzzle and add the
   *  sponsor logo to the clip overlay. Non-contest clips are unchanged. */
  puzzleId?: string;
  solverName?: string;
  /** Pieces the solver placed themselves (source === 'user'). */
  placementsByYou?: number;
  /** Total pieces in the solved puzzle. */
  totalPieces?: number;
  /** Piece uids in solve order (placedAt asc) — drives the assemble reveal. */
  placementOrder?: string[];
  /** Saved solution id — used to build the shareable /c/ challenge link. */
  solutionId?: string | null;
  /** Piece mode of this solve — non-Classic modes get an honest caption tag. */
  pieceMode?: 'unique' | 'duplicates' | 'single';
  /** Choose Pieces selection ('D' or 'D+Y') — named in the overlay/caption. */
  singlePieceId?: string | null;
  /** First-ever solver: carry the throne-dare flourish INTO the recorder (the
   *  end-screen button is now a plain "Share a video" CTA). */
  throneDare?: boolean;
}

const CLIP_DURATION_SEC = 8;
const INTRO_SEC = 1.0; // open on the finished, colorful puzzle (the hook)
const ASSEMBLE_FRACTION = 0.65; // then build up, then hold + spin

type Phase = 'idle' | 'recording' | 'done' | 'error';

export const ShareClipModal: React.FC<ShareClipModalProps> = ({
  isOpen,
  onClose,
  sceneObjects,
  puzzleName,
  puzzleId,
  solverName,
  placementsByYou,
  totalPieces,
  placementOrder,
  solutionId,
  pieceMode = 'unique',
  singlePieceId = null,
  throneDare = false,
}) => {
  const { t } = useTranslation();
  const MESSAGE_PRESETS = [t('shareClip.preset1'), t('shareClip.preset2'), t('shareClip.preset3')];
  const previewRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ClipComposer | null>(null);
  const spinRafRef = useRef<number | null>(null);     // one-shot spin while recording
  const previewRafRef = useRef<number | null>(null);   // continuous spin for the done-preview
  const recordCountRef = useRef(0);
  const baseRotationRef = useRef(0);
  const urlRef = useRef<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  // Two-way share: pick Video or Link first.
  const [view, setView] = useState<'choose' | 'video'>('choose');
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  // Personal taunt: baked into the video overlay, carried in the share text,
  // and delivered to the challenge landing page via the ?m= URL param.
  const [message, setMessage] = useState('');
  const [captionMsg, setCaptionMsg] = useState<string | null>(null);
  // Motivating rank slice (first-ever / top-3) — baked into overlay + caption.
  const [solveRank, setSolveRank] = useState<SolveRank | null>(null);
  // Sponsor logo — ONLY when this solve is the live contest puzzle and a logo
  // is configured (contest_settings.partner_logo_url). All other clips keep
  // the minimal overlay unchanged.
  const [sponsorLogoUrl, setSponsorLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !puzzleId) {
      setSponsorLogoUrl(null);
      return;
    }
    let cancelled = false;
    getContest().then((c) => {
      if (cancelled) return;
      setSponsorLogoUrl(
        isContestLive(c) && c.puzzleId === puzzleId && c.partnerLogoUrl
          ? c.partnerLogoUrl
          : null
      );
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, puzzleId]);

  useEffect(() => {
    if (!isOpen || !solutionId) {
      setSolveRank(null);
      return;
    }
    let cancelled = false;
    getSolveRank(solutionId).then((r) => {
      if (!cancelled) {
        setSolveRank(r);
        if (r) track('solve_rank_shown', { slice: r.firstEver ? 'first_ever' : 'top3', rank: r.rank });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, solutionId]);

  // Short share code (koospuzzle.com/c/xk2fp) — minted lazily, owner-only.
  const [shareCode, setShareCode] = useState<string | null>(null);
  useEffect(() => {
    if (!isOpen || !solutionId) {
      setShareCode(null);
      return;
    }
    let cancelled = false;
    ensureShareCode(solutionId).then((c) => {
      if (!cancelled) setShareCode(c);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, solutionId]);

  const taunt = message.trim().slice(0, MESSAGE_MAX);
  const mParam = taunt ? `?m=${encodeURIComponent(taunt)}` : '';
  // Pretty, typeable URL for captions and copy.
  const challengeUrl = solutionId
    ? `${window.location.origin}/c/${shareCode ?? solutionId}${mParam}`
    : null;
  // OG-capable wrapper for link shares (crawlers get the "Beat Anton" card,
  // humans get a 302 to /c/) — GitHub Pages can't serve per-challenge meta.
  const fnBase = import.meta.env.VITE_SUPABASE_FUNCTION_URL as string | undefined;
  const ogShareUrl =
    solutionId && fnBase
      ? `${fnBase.replace(/\/$/, '')}/share-preview?type=challenge&id=${shareCode ?? solutionId}${taunt ? `&m=${encodeURIComponent(taunt)}` : ''}`
      : challengeUrl;

  const handleShareLink = async () => {
    if (!challengeUrl) return;
    const dare = solverName
      ? t('shareClip.dareNamed', { name: solverName })
      : t('shareClip.dareGeneric');
    const shareData = {
      title: t('shareClip.shareTitle'),
      text: taunt ? `“${taunt}” — ${dare}` : dare,
      url: ogShareUrl ?? challengeUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        track('share_completed', { channel: 'link_native', has_message: !!taunt });
        return;
      }
    } catch {
      // user cancelled or share failed — fall through to copy
      return;
    }
    try {
      await navigator.clipboard.writeText(challengeUrl);
      setLinkMsg(t('shareClip.linkCopied'));
      track('share_completed', { channel: 'link_copy', has_message: !!taunt });
    } catch {
      setLinkMsg(challengeUrl);
    }
  };

  // Ready-to-paste caption for video posts: rank + taunt + dare + link + tags.
  const buildCaption = () => {
    // Founders dare readers to take the throne; everyone else dares a score.
    const dare = solveRank?.firstEver
      ? t('shareClip.dareThrone')
      : placementsByYou != null && totalPieces
        ? t('shareClip.dareScore', { score: `${placementsByYou}/${totalPieces}` })
        : t('shareClip.dareGeneric');
    // Honest palette tag — a Free Pieces brag shouldn't read as a Classic
    // solve, and an "Only D+Y" run names its exact challenge. Same honesty in
    // the founder line: non-Classic firsts claim their BOARD, not the puzzle.
    const sig = paletteSignature(pieceMode, singlePieceId);
    const rankLine = solveRank
      ? solveRank.firstEver
        ? sig === 'classic'
          ? t('shareClip.rankFirstEver')
          : t('shareClip.rankFirstEverBoard', { label: paletteLabel(sig, t) })
        : t('shareClip.rankLine', { rank: solveRank.short })
      : null;
    const modeLine = sig !== 'classic' ? `(${paletteLabel(sig, t)})` : null;
    return [rankLine, modeLine, taunt, `${dare} 🧩`, challengeUrl ? t('shareClip.raceMe', { url: challengeUrl }) : 'koospuzzle.com', t('shareClip.hashtags')]
      .filter(Boolean)
      .join('\n');
  };

  const copyCaption = async (note: string) => {
    try {
      await navigator.clipboard.writeText(buildCaption());
      setCaptionMsg(note);
      track('caption_copied');
    } catch {
      /* clipboard unavailable — non-fatal */
    }
  };

  /** Share the recorded MP4 straight to the OS share sheet (TikTok/IG/etc). */
  const canShareFile = (): boolean => {
    const blob = blobRef.current;
    if (!blob || typeof navigator.canShare !== 'function') return false;
    try {
      return navigator.canShare({ files: [clipFile(blob)] });
    } catch {
      return false;
    }
  };

  const clipFile = (blob: Blob): File => {
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const base = (puzzleName || 'puzzle').replace(/\s+/g, '-');
    return new File([blob], `${base}-solved.${ext}`, { type: blob.type || 'video/mp4' });
  };

  const handleShareVideo = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    // Copy the caption first (we're inside the user gesture) so it's ready to
    // paste wherever the share sheet lands them.
    await copyCaption(t('shareClip.captionCopied'));
    try {
      await navigator.share({
        files: [clipFile(blob)],
        title: 'Koos Puzzle',
        text: buildCaption(),
      });
      track('share_completed', { channel: 'video_share_sheet', has_message: !!taunt });
    } catch {
      // user cancelled the sheet — caption stays on the clipboard
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
      ? t('shareClip.dareScore', { score: `${placementsByYou}/${totalPieces}` })
      : t('shareClip.dareGeneric');

  // The viral frame: solver name + their leaderboard spot + the palette they
  // did it on. "First ever · Only D+Y" is a claimable throne on camera.
  const overlaySig = paletteSignature(pieceMode, singlePieceId);
  const overlayPalette = overlaySig !== 'classic' ? paletteLabel(overlaySig, t) : null;
  const overlay: ClipOverlay = {
    kicker: overlayPalette
      ? `${t('shareClip.overlayKicker')} · ${overlayPalette}`
      : t('shareClip.overlayKicker'),
    name: solverName,
    rank: solveRank
      ? overlayPalette && !solveRank.firstEver
        ? // First-ever labels already name their board — no double palette tag.
          `${solveRank.label} · ${overlayPalette}`
        : solveRank.label
      : undefined,
    message: taunt || undefined,
    cta: solveRank?.firstEver ? t('shareClip.overlayCtaFirstEver') : cta,
    watermark: 'koospuzzle.com',
    ...(sponsorLogoUrl
      ? { sponsorLogoUrl, sponsorLabel: t('contest.sponsored') }
      : {}),
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
        if (t < INTRO_SEC) {
          // Beauty shot first — the solved puzzle in full color.
          setRevealed(order.length);
        } else {
          const aFrac = Math.min(
            (t - INTRO_SEC) / (CLIP_DURATION_SEC * ASSEMBLE_FRACTION), 1);
          setRevealed(Math.ceil(aFrac * order.length));
        }
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

      // Pieces stay fully visible — the clip opens on the solved, colorful
      // puzzle (INTRO_SEC beauty shot), then the assemble reveal takes over.
      // waitForFrames lets real composited frames land before capture
      // attaches (no blank first frame), with a timeout so throttled rAF
      // can never hang the recording.
      await waitForFrames();
      spinRafRef.current = requestAnimationFrame(spin);
      // WebCodecs → exact-duration fast-start MP4 (platform transcoders
      // like Instagram truncate MediaRecorder's broken-metadata files).
      const result = await recordClip(c, CLIP_DURATION_SEC + 0.3);

      if (spinRafRef.current != null) cancelAnimationFrame(spinRafRef.current);
      showAllPieces(); // done-preview shows the complete solution

      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = result.url;
      blobRef.current = result.blob;
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
      setError(e instanceof Error ? e.message : t('shareClip.recordingFailed'));
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
      void copyCaption(t('shareClip.captionCopied'));
      track('share_completed', { channel: 'video_download', has_message: !!taunt });
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
              {t('shareClip.title')}
            </div>
            <div style={{ fontSize: '14px', opacity: 0.95, marginBottom: '14px', lineHeight: 1.5 }}>
              {t('shareClip.chooseSubtitle')}
            </div>

            {/* First-ever solver: the throne-dare flourish, moved off the
                end-screen button (now a plain video CTA) into the recorder. */}
            {throneDare && (
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  background: 'rgba(255,215,0,0.18)',
                  border: '1px solid rgba(255,215,0,0.5)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  marginBottom: '14px',
                }}
              >
                👑 {t('gameEnd.dareThrone')}
              </div>
            )}

            {/* Personal message — rides the video overlay, the share text, and
                the challenge landing page. */}
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => setView('video')}
                style={{
                  background: '#10b981', color: '#fff', border: 'none', borderRadius: '10px',
                  padding: '14px 18px', fontSize: '16px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                {t('shareClip.videoOption')} <span style={{ opacity: 0.85, fontWeight: 500 }}>{t('shareClip.videoOptionHint')}</span>
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
                {t('shareClip.linkOption')} <span style={{ opacity: 0.85, fontWeight: 500 }}>{t('shareClip.linkOptionHint')}</span>
              </button>
              {linkMsg && <div style={{ fontSize: 13, marginTop: 2, wordBreak: 'break-all' }}>{linkMsg}</div>}
              {!challengeUrl && (
                <div style={{ fontSize: 12, opacity: 0.7 }}>{t('shareClip.savingSolve')}</div>
              )}
              <button
                onClick={handleClose}
                style={{
                  background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.4)',
                  borderRadius: '10px', padding: '10px 20px', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('shareClip.close')}
              </button>
            </div>
          </>
        )}

        {view === 'video' && (
        <>
        <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎬</div>
        <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '6px' }}>
          {t('shareClip.title')}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.95, marginBottom: '20px', lineHeight: 1.5 }}>
          {t('shareClip.videoSubtitle')}
        </div>

        {!sceneObjects && (
          <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '16px' }}>
            {t('shareClip.sceneNotReady')}
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
            {t('shareClip.recording')}
          </div>
        )}

        {phase === 'done' && (
          <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '12px', lineHeight: 1.4 }}>
            {canShareFile()
              ? t('shareClip.looksGoodShare')
              : t('shareClip.looksGoodDownload')}
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
              {phase === 'recording' ? t('shareClip.recordingBtn') : t('shareClip.recordBtn')}
            </button>
          )}

          {phase === 'done' && (
            <>
              {canShareFile() && (
                <button
                  onClick={handleShareVideo}
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
                  {t('shareClip.shareVideo')}
                </button>
              )}
              <button
                onClick={handleDownload}
                style={{
                  background: canShareFile() ? 'rgba(255,255,255,0.18)' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px 20px',
                  fontSize: canShareFile() ? '14px' : '16px',
                  fontWeight: canShareFile() ? 600 : 700,
                  cursor: 'pointer',
                }}
              >
                {t('shareClip.downloadClip')}
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
                {t('shareClip.recordAgain')}
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
            {t('shareClip.close')}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
};

export default ShareClipModal;
