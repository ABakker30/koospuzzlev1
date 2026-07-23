// Shareable clip recorder — composes the live 3D canvas into a vertical (9:16)
// frame with a personalization overlay (title / stats / solver / watermark),
// and records it to a downloadable video via RecordingService.
//
// The 3D scene keeps rendering on its own canvas (driven by whatever effect is
// playing — e.g. a turntable). Each frame we copy that canvas into the vertical
// compositor and draw the overlay on top, then RecordingService captures the
// compositor's stream. This keeps aspect-ratio + overlay in one place and reuses
// the existing recording pipeline unchanged.

import { RecordingService, type RecordingOptions } from './RecordingService';

export interface ClipOverlay {
  /** Small kicker above the name, e.g. "Solved!" */
  kicker?: string;
  /** Hero line — the solver's name. */
  name?: string;
  /** Motivating rank slice, e.g. "First ever to solve this puzzle". */
  rank?: string;
  /** Personal message from the solver, e.g. "You'll never beat this 😏" */
  message?: string;
  /** Call-to-action, e.g. "Can you beat that?" */
  cta?: string;
  /** Watermark, e.g. "koospuzzle.com" */
  watermark?: string;
  /** Partner credit above the watermark, e.g. "Brought to you by MoMath". */
  partner?: string;
  /** Sponsor logo (contest clips only) — drawn small in the top-left corner.
   *  MUST be a CORS-readable URL (Supabase public storage sends `*`); the
   *  image is loaded with crossOrigin='anonymous' so the canvas never taints
   *  (a tainted canvas silently breaks MediaRecorder). Load failures skip the
   *  logo without breaking the clip. */
  sponsorLogoUrl?: string;
  /** Tiny caption under the sponsor logo, e.g. "Sponsored". */
  sponsorLabel?: string;

  // ---- Match-replay clip additions (PvP Q4). All optional + additive: ----
  /** Two-player header with live-ticking scores, drawn at the top. */
  matchHeader?: {
    /** Small line above the scoreboard, e.g. the puzzle name. */
    title?: string;
    p1: { name: string; score: number };
    p2: { name: string; score: number };
    /** Who just moved — their side gets the accent tint (1 | 2 | null). */
    activeSide?: 1 | 2 | null;
  };
  /** Transient center flash, e.g. "💡 Hint" — caller clears it. */
  flash?: { text: string; sub?: string } | null;
  /** Full-frame outcome end-card (winner banner / score / reason / CTA). */
  card?: {
    heading: string;
    score: string;
    reason?: string;
    badge?: string;
    cta?: string;
    watermark?: string;
  } | null;
}

export interface VerticalClipOptions {
  width?: number;          // default 1080
  height?: number;         // default 1920 (9:16)
  background?: string;     // backdrop behind the 3D render
  quality?: RecordingOptions['quality'];
  filename?: string;
}

const DEFAULTS = { width: 1080, height: 1920, background: '#0b0b1e' };

/**
 * Composites a source canvas into a vertical frame + overlay, on a rAF loop.
 * Its `canvas` is what you record.
 */
export class ClipComposer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private source: HTMLCanvasElement | null = null;
  private overlay: ClipOverlay = {};
  private background: string;
  private rafId: number | null = null;
  private sponsorImg: HTMLImageElement | null = null;

  constructor(opts?: { width?: number; height?: number; background?: string }) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = opts?.width ?? DEFAULTS.width;
    this.canvas.height = opts?.height ?? DEFAULTS.height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.background = opts?.background ?? DEFAULTS.background;
  }

  start(source: HTMLCanvasElement, overlay: ClipOverlay): void {
    this.source = source;
    this.overlay = overlay;
    // Preload the sponsor logo (contest clips). crossOrigin BEFORE src, or the
    // canvas taints and MediaRecorder silently produces nothing. If it fails
    // to load, the clip simply renders without the logo.
    this.sponsorImg = null;
    if (overlay.sponsorLogoUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.sponsorImg = img;
      };
      img.onerror = () => {
        this.sponsorImg = null;
      };
      img.src = overlay.sponsorLogoUrl;
    }
    // Draw synchronously so the canvas already holds a real frame when the
    // recorder's captureStream attaches — otherwise the clip opens on a
    // blank white frame.
    this.drawFrame();
    const loop = () => {
      this.drawFrame();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  /** Mutate overlay state mid-recording (match clip: score ticker, flashes,
   *  outcome card). The rAF loop picks the change up on its next frame. */
  update(partial: Partial<ClipOverlay>): void {
    this.overlay = { ...this.overlay, ...partial };
  }

  private drawFrame(): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, W, H);

    // Draw the 3D source: scale to fill width, center vertically (contain-by-width).
    const src = this.source;
    if (src && src.width > 0 && src.height > 0) {
      const scale = W / src.width;
      const dW = src.width * scale;
      const dH = src.height * scale;
      ctx.drawImage(src, (W - dW) / 2, (H - dH) / 2, dW, dH);
    }

    this.drawOverlay();
  }

  private drawOverlay(): void {
    const { ctx, canvas, overlay } = this;
    const W = canvas.width;
    const H = canvas.height;
    const font = (weight: number, px: number) =>
      `${weight} ${Math.round(px)}px Inter, system-ui, sans-serif`;

    // Shrink a font until the text fits within maxWidth.
    const fitSize = (text: string, weight: number, base: number, maxWidth: number) => {
      let size = base;
      ctx.font = font(weight, size);
      while (ctx.measureText(text).width > maxWidth && size > W * 0.05) {
        size *= 0.92;
        ctx.font = font(weight, size);
      }
      return size;
    };

    // Match-replay header: "{p1} {score} — {score} {p2}" scoreboard.
    if (overlay.matchHeader) {
      const h = overlay.matchHeader;
      const grad = ctx.createLinearGradient(0, 0, 0, H * 0.22);
      grad.addColorStop(0, 'rgba(0,0,0,0.6)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H * 0.22);

      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 12;

      if (h.title) {
        const size = fitSize(h.title, 600, W * 0.038, W * 0.86);
        ctx.font = font(600, size);
        ctx.fillStyle = '#9fb4ff';
        ctx.fillText(h.title, W / 2, H * 0.055);
      }

      // Names left/right of a center "12 — 9" score, tinted for the active
      // side. Names fit their half column; scores are the hero element.
      const p1Active = h.activeSide === 1;
      const p2Active = h.activeSide === 2;
      const nameY = H * 0.095;
      const scoreY = H * 0.145;
      const half = W * 0.44;

      ctx.textAlign = 'left';
      const s1 = fitSize(h.p1.name, 800, W * 0.05, half);
      ctx.font = font(800, s1);
      ctx.fillStyle = p1Active ? '#7CFFB2' : '#ffffff';
      ctx.fillText(h.p1.name, W * 0.05, nameY);

      ctx.textAlign = 'right';
      const s2 = fitSize(h.p2.name, 800, W * 0.05, half);
      ctx.font = font(800, s2);
      ctx.fillStyle = p2Active ? '#c4a7ff' : '#ffffff';
      ctx.fillText(h.p2.name, W * 0.95, nameY);

      ctx.textAlign = 'left';
      ctx.font = font(800, W * 0.075);
      ctx.fillStyle = p1Active ? '#7CFFB2' : '#ffffff';
      ctx.fillText(String(h.p1.score), W * 0.05, scoreY);

      ctx.textAlign = 'center';
      ctx.font = font(600, W * 0.05);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('—', W / 2, scoreY);

      ctx.textAlign = 'right';
      ctx.font = font(800, W * 0.075);
      ctx.fillStyle = p2Active ? '#c4a7ff' : '#ffffff';
      ctx.fillText(String(h.p2.score), W * 0.95, scoreY);

      ctx.shadowBlur = 0;
      ctx.textAlign = 'start';
    }

    // Top scrim: kicker + hero name + rank badge.
    if (overlay.kicker || overlay.name || overlay.rank) {
      const grad = ctx.createLinearGradient(0, 0, 0, H * 0.26);
      grad.addColorStop(0, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H * 0.26);

      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 12;

      if (overlay.name) {
        if (overlay.kicker) {
          ctx.font = font(600, W * 0.045);
          ctx.fillStyle = '#9fb4ff';
          ctx.fillText(overlay.kicker, W / 2, H * 0.085);
        }
        const size = fitSize(overlay.name, 800, W * 0.095, W * 0.88);
        ctx.font = font(800, size);
        ctx.fillStyle = '#fff';
        ctx.fillText(overlay.name, W / 2, H * 0.15);
      } else if (overlay.kicker) {
        ctx.font = font(800, W * 0.095);
        ctx.fillStyle = '#fff';
        ctx.fillText(overlay.kicker, W / 2, H * 0.12);
      }
      // Rank badge — the unmissable "you're beatable" line (gold, under the name).
      if (overlay.rank) {
        const size = fitSize(`🏆 ${overlay.rank}`, 800, W * 0.055, W * 0.88);
        ctx.font = font(800, size);
        ctx.fillStyle = '#feca57';
        ctx.fillText(`🏆 ${overlay.rank}`, W / 2, H * 0.205);
      }
      ctx.shadowBlur = 0;
    }

    // Bottom scrim: personal message + call-to-action + partner + watermark.
    if (overlay.message || overlay.cta || overlay.watermark || overlay.partner) {
      const grad2 = ctx.createLinearGradient(0, H * 0.76, 0, H);
      grad2.addColorStop(0, 'rgba(0,0,0,0)');
      grad2.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, H * 0.76, W, H * 0.24);

      ctx.textAlign = 'center';
      if (overlay.message) {
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10;
        const size = fitSize(`“${overlay.message}”`, 600, W * 0.045, W * 0.88);
        ctx.font = `italic ${font(600, size)}`;
        ctx.fillStyle = '#dbe4ff';
        ctx.fillText(`“${overlay.message}”`, W / 2, H * 0.865);
        ctx.shadowBlur = 0;
      }
      if (overlay.cta) {
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10;
        const size = fitSize(overlay.cta, 800, W * 0.062, W * 0.88);
        ctx.font = font(800, size);
        ctx.fillStyle = '#fff';
        ctx.fillText(overlay.cta, W / 2, H * 0.92);
        ctx.shadowBlur = 0;
      }
      if (overlay.partner) {
        ctx.font = font(600, W * 0.03);
        ctx.fillStyle = '#dbe4ff';
        ctx.fillText(overlay.partner, W / 2, H * 0.942);
      }
      if (overlay.watermark) {
        ctx.font = font(700, W * 0.04);
        ctx.fillStyle = '#feca57';
        ctx.fillText(overlay.watermark, W / 2, overlay.partner ? H * 0.975 : H * 0.965);
      }
    }

    // Sponsor logo (contest clips only) — small, in the top-LEFT corner: the
    // kicker/name/rank are horizontally centered and the CTA/watermark own the
    // bottom, so this corner stays collision-free. A soft scrim keeps the logo
    // legible over any scene, with a tiny "Sponsored" caption underneath.
    const logo = this.sponsorImg;
    if (logo && logo.width > 0 && logo.height > 0) {
      const maxW = 120;
      const maxH = 110;
      const s = Math.min(maxW / logo.width, maxH / logo.height);
      const dW = logo.width * s;
      const dH = logo.height * s;
      const pad = 12;
      const x = 24;
      const y = 24;
      const capSize = Math.round(W * 0.024);
      const boxW = dW + pad * 2;
      const boxH = dH + pad * 2 + (overlay.sponsorLabel ? capSize + 6 : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, y, boxW, boxH);
      ctx.drawImage(logo, x + pad, y + pad, dW, dH);
      if (overlay.sponsorLabel) {
        ctx.textAlign = 'center';
        ctx.font = font(600, capSize);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(overlay.sponsorLabel, x + boxW / 2, y + pad + dH + capSize + 2);
      }
    }

    // Transient center flash (match clip: 💡 hint beat, repair stamp).
    if (overlay.flash) {
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 16;
      const size = fitSize(overlay.flash.text, 800, W * 0.09, W * 0.86);
      ctx.font = font(800, size);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(overlay.flash.text, W / 2, H * 0.3);
      if (overlay.flash.sub) {
        const subSize = fitSize(overlay.flash.sub, 600, W * 0.042, W * 0.86);
        ctx.font = font(600, subSize);
        ctx.fillStyle = '#dbe4ff';
        ctx.fillText(overlay.flash.sub, W / 2, H * 0.3 + size * 0.9);
      }
      ctx.shadowBlur = 0;
    }

    // Outcome end-card (match clip): dims the whole frame, then winner
    // banner / final score / end reason / standings badge / CTA. Drawn LAST
    // so it takes over everything else.
    if (overlay.card) {
      const card = overlay.card;
      ctx.fillStyle = 'rgba(6,8,20,0.62)';
      ctx.fillRect(0, 0, W, H);

      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 14;

      let y = H * 0.34;
      const heading = fitSize(card.heading, 800, W * 0.085, W * 0.88);
      ctx.font = font(800, heading);
      ctx.fillStyle = '#feca57';
      ctx.fillText(card.heading, W / 2, y);

      y += W * 0.16;
      ctx.font = font(800, W * 0.13);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(card.score, W / 2, y);

      if (card.reason) {
        y += W * 0.09;
        const size = fitSize(card.reason, 600, W * 0.045, W * 0.86);
        ctx.font = font(600, size);
        ctx.fillStyle = '#dbe4ff';
        ctx.fillText(card.reason, W / 2, y);
      }

      if (card.badge) {
        y += W * 0.1;
        const size = fitSize(card.badge, 700, W * 0.045, W * 0.8);
        const badgeW = ctx.measureText(card.badge).width + W * 0.08;
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(254,202,87,0.16)';
        const bh = size * 2.1;
        const bx = W / 2 - badgeW / 2;
        const by = y - bh * 0.68;
        ctx.beginPath();
        (ctx as any).roundRect
          ? (ctx as any).roundRect(bx, by, badgeW, bh, bh / 2)
          : ctx.rect(bx, by, badgeW, bh);
        ctx.fill();
        ctx.shadowBlur = 14;
        ctx.font = font(700, size);
        ctx.fillStyle = '#feca57';
        ctx.fillText(card.badge, W / 2, y);
      }

      if (card.cta) {
        const size = fitSize(card.cta, 800, W * 0.055, W * 0.88);
        ctx.font = font(800, size);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(card.cta, W / 2, H * 0.86);
      }
      if (card.watermark) {
        ctx.font = font(700, W * 0.042);
        ctx.fillStyle = '#feca57';
        ctx.fillText(card.watermark, W / 2, H * 0.905);
      }
      ctx.shadowBlur = 0;
    }
    ctx.textAlign = 'start';
  }
}

/**
 * Record a vertical clip of `sourceCanvas` for `durationSec`, with the given
 * overlay, and return the resulting video blob + object URL.
 *
 * The caller is responsible for driving the animation on `sourceCanvas` (e.g.
 * starting a turntable effect) before/while calling this. This just composes
 * and records what the source shows for the duration.
 */
export async function recordVerticalClip(
  sourceCanvas: HTMLCanvasElement,
  durationSec: number,
  overlay: ClipOverlay,
  opts: VerticalClipOptions = {}
): Promise<{ blob: Blob; url: string }> {
  const composer = new ClipComposer({
    width: opts.width,
    height: opts.height,
    background: opts.background,
  });
  composer.start(sourceCanvas, overlay);

  const recorder = new RecordingService();
  await recorder.initialize(composer.canvas, {
    quality: opts.quality ?? 'medium',
    filename: opts.filename,
  });
  await recorder.startRecording();

  await new Promise((r) => setTimeout(r, Math.max(500, durationSec * 1000)));

  await recorder.stopRecording();
  composer.stop();

  const status = recorder.getStatus();
  if (!status.blob || !status.downloadUrl) {
    throw new Error('Clip recording produced no output');
  }
  return { blob: status.blob, url: status.downloadUrl };
}

/**
 * Wait for `frames` animation frames so real composited frames exist before
 * capture attaches (no blank first frame) — but never longer than `maxMs`:
 * rAF can be throttled (background/hidden tabs) and recording must not hang.
 */
export function waitForFrames(frames = 2, maxMs = 350): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    const timer = setTimeout(finish, maxMs);
    let left = frames;
    const tick = () => {
      if (done) return;
      if (--left <= 0) {
        clearTimeout(timer);
        finish();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

/** Trigger a browser download of a recorded clip blob. */
export function downloadClip(url: string, filename = 'koospuzzle-clip.mp4'): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
