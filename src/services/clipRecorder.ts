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
  /** Big headline, e.g. "Solved!" */
  title?: string;
  /** Secondary line, e.g. the puzzle name */
  subtitle?: string;
  /** Short stat chips shown bottom, e.g. ["⏱ 1m 23s", "🧩 12 pieces"] */
  stats?: string[];
  /** Attribution line, e.g. "by anton" */
  attribution?: string;
  /** Watermark / call-to-action, e.g. "koospuzzle.com" */
  watermark?: string;
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

    // Top scrim for title legibility.
    if (overlay.title || overlay.subtitle) {
      const grad = ctx.createLinearGradient(0, 0, 0, H * 0.22);
      grad.addColorStop(0, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H * 0.22);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 12;
      if (overlay.title) {
        ctx.font = `800 ${Math.round(W * 0.085)}px Inter, system-ui, sans-serif`;
        ctx.fillText(overlay.title, W / 2, H * 0.11);
      }
      if (overlay.subtitle) {
        ctx.font = `600 ${Math.round(W * 0.045)}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(overlay.subtitle, W / 2, H * 0.155);
      }
      ctx.shadowBlur = 0;
    }

    // Bottom scrim for stats / attribution / watermark.
    const grad2 = ctx.createLinearGradient(0, H * 0.74, 0, H);
    grad2.addColorStop(0, 'rgba(0,0,0,0)');
    grad2.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, H * 0.74, W, H * 0.26);

    let y = H * 0.86;
    ctx.textAlign = 'center';

    if (overlay.stats && overlay.stats.length) {
      ctx.font = `700 ${Math.round(W * 0.05)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(overlay.stats.join('   ·   '), W / 2, y);
      y += H * 0.05;
    }
    if (overlay.attribution) {
      ctx.font = `500 ${Math.round(W * 0.04)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(overlay.attribution, W / 2, y);
      y += H * 0.045;
    }
    if (overlay.watermark) {
      ctx.font = `700 ${Math.round(W * 0.038)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = '#feca57';
      ctx.fillText(overlay.watermark, W / 2, H * 0.965);
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

/** Trigger a browser download of a recorded clip blob. */
export function downloadClip(url: string, filename = 'koospuzzle-clip.mp4'): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
