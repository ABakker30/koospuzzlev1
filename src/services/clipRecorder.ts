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
