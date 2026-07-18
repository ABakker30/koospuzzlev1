// clipEncoder — records a canvas to a CLEAN MP4 via WebCodecs + mp4-muxer.
//
// Why not MediaRecorder: canvas captureStream produces variable-frame-rate
// video with broken/missing duration metadata. Local players cope, but
// platform transcoders (Instagram, TikTok) trust the metadata and truncate
// the upload (observed: 8s clips cut to ~3s on IG). WebCodecs lets us stamp
// every frame with an exact fixed-rate timestamp and mux a proper
// fast-start MP4 whose declared duration matches reality.
//
// recordClip() prefers WebCodecs (Chrome/Edge/Android, Safari 16.4+) and
// falls back to the legacy MediaRecorder pipeline where unavailable.

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { RecordingService } from './RecordingService';

const FPS = 30;
const BITRATE = 6_000_000;
const KEYFRAME_EVERY_SEC = 2;

export interface ClipResult {
  blob: Blob;
  url: string;
}

async function pickCodec(width: number, height: number): Promise<string | null> {
  // Baseline → Main → High, all level 4.0 (covers 1080×1920@30).
  const candidates = ['avc1.420028', 'avc1.4d0028', 'avc1.640028'];
  for (const codec of candidates) {
    try {
      const support = await (window as any).VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: BITRATE,
        framerate: FPS,
      });
      if (support?.supported) return codec;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** WebCodecs path. Returns null when unsupported (caller falls back). */
async function recordWithWebCodecs(
  canvas: HTMLCanvasElement,
  durationSec: number
): Promise<ClipResult | null> {
  if (typeof (window as any).VideoEncoder === 'undefined') return null;
  if (typeof (window as any).VideoFrame === 'undefined') return null;

  // Even dimensions required by H.264.
  const width = canvas.width - (canvas.width % 2);
  const height = canvas.height - (canvas.height % 2);
  const codec = await pickCodec(width, height);
  if (!codec) return null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    // moov atom up front — platforms read duration without a full scan.
    fastStart: 'in-memory',
  });

  let encodeError: unknown = null;
  const encoder = new (window as any).VideoEncoder({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error: (e: unknown) => {
      encodeError = e;
    },
  });
  encoder.configure({ codec, width, height, bitrate: BITRATE, framerate: FPS });

  const totalFrames = Math.round(durationSec * FPS);
  const frameUs = Math.round(1_000_000 / FPS);

  await new Promise<void>((resolve, reject) => {
    const start = performance.now();
    let nextIndex = 0;
    const tick = () => {
      if (encodeError) {
        reject(encodeError);
        return;
      }
      const elapsed = (performance.now() - start) / 1000;
      // Encode every frame index the clock has passed — exact CFR timestamps
      // even if rAF skips (the same canvas frame is simply repeated).
      const due = Math.min(totalFrames, Math.floor(elapsed * FPS) + 1);
      while (nextIndex < due) {
        const frame = new (window as any).VideoFrame(canvas, {
          timestamp: nextIndex * frameUs,
          duration: frameUs,
        });
        encoder.encode(frame, {
          keyFrame: nextIndex % (FPS * KEYFRAME_EVERY_SEC) === 0,
        });
        frame.close();
        nextIndex++;
      }
      if (nextIndex >= totalFrames) {
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  const { buffer } = muxer.target as ArrayBufferTarget;
  const blob = new Blob([buffer], { type: 'video/mp4' });
  return { blob, url: URL.createObjectURL(blob) };
}

/** Legacy MediaRecorder path (Firefox, old Safari). */
async function recordWithMediaRecorder(
  canvas: HTMLCanvasElement,
  durationSec: number
): Promise<ClipResult> {
  const recorder = new RecordingService();
  await recorder.initialize(canvas, { quality: 'medium' });
  await recorder.startRecording();
  await new Promise((r) => setTimeout(r, durationSec * 1000));
  await recorder.stopRecording();
  const status = recorder.getStatus();
  if (!status.blob || !status.downloadUrl) {
    throw new Error('Recording produced no output');
  }
  return { blob: status.blob, url: status.downloadUrl };
}

/**
 * Record `canvas` for `durationSec`. The caller drives the animation on the
 * canvas (compositor rAF loop); this only captures and encodes it.
 */
export async function recordClip(
  canvas: HTMLCanvasElement,
  durationSec: number
): Promise<ClipResult> {
  try {
    const result = await recordWithWebCodecs(canvas, durationSec);
    if (result) return result;
  } catch (e) {
    // Unsupported/failed before real progress — the MediaRecorder fallback
    // below still records whatever remains of the animation.
    console.warn('clipEncoder: WebCodecs path failed, falling back:', e);
  }
  return recordWithMediaRecorder(canvas, durationSec);
}
