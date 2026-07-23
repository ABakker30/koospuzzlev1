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

/** One scheduled sound effect for a recorded clip's audio track. */
export interface ClipSfxEvent {
  timeSec: number;
  /** Asset URL (same /data/Audio files utils/audio.ts plays). */
  url: string;
  volume: number;
}

const AUDIO_SAMPLE_RATE = 48_000;
const AUDIO_BITRATE = 128_000;

/**
 * Render the whole SFX schedule offline into ONE stereo AudioBuffer of
 * exactly `durationSec`. Deterministic (no realtime capture), so the encoded
 * audio always lines up with the beat timeline. Returns null when nothing
 * could be scheduled (missing assets, no OfflineAudioContext).
 */
async function renderSfxBuffer(
  events: ClipSfxEvent[],
  durationSec: number
): Promise<AudioBuffer | null> {
  if (events.length === 0) return null;
  if (typeof OfflineAudioContext === 'undefined') return null;
  const ctx = new OfflineAudioContext(
    2,
    Math.ceil(durationSec * AUDIO_SAMPLE_RATE),
    AUDIO_SAMPLE_RATE
  );
  const cache = new Map<string, AudioBuffer | null>();
  for (const url of new Set(events.map((e) => e.url))) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      cache.set(url, await ctx.decodeAudioData(await res.arrayBuffer()));
    } catch (e) {
      console.warn('clipEncoder: SFX asset failed to load, skipping:', url, e);
      cache.set(url, null);
    }
  }
  let scheduled = 0;
  for (const ev of events) {
    const buf = cache.get(ev.url);
    if (!buf || ev.timeSec >= durationSec) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, ev.volume));
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(Math.max(0, ev.timeSec));
    scheduled++;
  }
  if (scheduled === 0) return null;
  return await ctx.startRendering();
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

/** True when this browser can AAC-encode our offline-rendered SFX track. */
async function canEncodeAac(): Promise<boolean> {
  const AE = (window as any).AudioEncoder;
  if (typeof AE === 'undefined' || typeof (window as any).AudioData === 'undefined') {
    return false;
  }
  try {
    const support = await AE.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfChannels: 2,
      bitrate: AUDIO_BITRATE,
    });
    return !!support?.supported;
  } catch {
    return false;
  }
}

/** Encode a pre-rendered AudioBuffer into the muxer as AAC. Throws on
 *  encoder errors (caller treats the whole WebCodecs attempt as failed). */
async function encodeAudioTrack(muxer: Muxer<ArrayBufferTarget>, audio: AudioBuffer): Promise<void> {
  let encodeError: unknown = null;
  const encoder = new (window as any).AudioEncoder({
    output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
    error: (e: unknown) => {
      encodeError = e;
    },
  });
  encoder.configure({
    codec: 'mp4a.40.2',
    sampleRate: AUDIO_SAMPLE_RATE,
    numberOfChannels: 2,
    bitrate: AUDIO_BITRATE,
  });

  // Feed in ~100ms planar slices with exact timestamps.
  const sliceFrames = Math.round(AUDIO_SAMPLE_RATE / 10);
  const ch0 = audio.getChannelData(0);
  const ch1 = audio.numberOfChannels > 1 ? audio.getChannelData(1) : ch0;
  for (let start = 0; start < audio.length; start += sliceFrames) {
    if (encodeError) throw encodeError;
    const frames = Math.min(sliceFrames, audio.length - start);
    const data = new Float32Array(frames * 2);
    data.set(ch0.subarray(start, start + frames), 0);
    data.set(ch1.subarray(start, start + frames), frames);
    const audioData = new (window as any).AudioData({
      format: 'f32-planar',
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfFrames: frames,
      numberOfChannels: 2,
      timestamp: Math.round((start / AUDIO_SAMPLE_RATE) * 1_000_000),
      data,
    });
    encoder.encode(audioData);
    audioData.close();
  }
  await encoder.flush();
  encoder.close();
  if (encodeError) throw encodeError;
}

/** WebCodecs path. Returns null when unsupported (caller falls back).
 *  `audioTrack` (optional, match clip) muxes a pre-rendered SFX buffer in as
 *  AAC; when the browser can't AAC-encode the clip stays video-only. */
async function recordWithWebCodecs(
  canvas: HTMLCanvasElement,
  durationSec: number,
  audioTrack?: AudioBuffer | null,
  onCaptureStart?: () => void
): Promise<ClipResult | null> {
  if (typeof (window as any).VideoEncoder === 'undefined') return null;
  if (typeof (window as any).VideoFrame === 'undefined') return null;

  // Even dimensions required by H.264.
  const width = canvas.width - (canvas.width % 2);
  const height = canvas.height - (canvas.height % 2);
  const codec = await pickCodec(width, height);
  if (!codec) return null;

  const includeAudio = !!audioTrack && (await canEncodeAac());
  if (audioTrack && !includeAudio) {
    console.warn('clipEncoder: AAC encode unsupported — clip will be silent');
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    ...(includeAudio
      ? {
          audio: {
            codec: 'aac' as const,
            sampleRate: AUDIO_SAMPLE_RATE,
            numberOfChannels: 2,
          },
        }
      : {}),
    // moov atom up front — platforms read duration without a full scan.
    fastStart: 'in-memory',
  });

  // Audio first: it's pre-rendered, so it encodes in one synchronous burst
  // before the realtime video loop starts.
  if (includeAudio && audioTrack) {
    await encodeAudioTrack(muxer, audioTrack);
  }

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

  // Anything time-locked to the recording (the match-replay beat driver)
  // starts HERE — after the async audio pre-render — so video t=0 and the
  // scheduled audio t=0 land on the same instant.
  onCaptureStart?.();

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

/** Legacy path with sound: play the pre-rendered SFX buffer into a
 *  MediaStreamAudioDestinationNode and record canvas + audio together. */
async function recordWithMediaRecorderAudio(
  canvas: HTMLCanvasElement,
  durationSec: number,
  audio: AudioBuffer,
  onCaptureStart?: () => void
): Promise<ClipResult> {
  const AC: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AC();
  try {
    const dest = audioCtx.createMediaStreamDestination();
    const src = audioCtx.createBufferSource();
    src.buffer = audio;
    src.connect(dest);

    const stream = canvas.captureStream(30);
    for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);

    const preferred = [
      'video/mp4;codecs=h264,aac',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const mimeType = preferred.find(
      (t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)
    );
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: BITRATE })
      : new MediaRecorder(stream);

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    onCaptureStart?.();
    recorder.start(100);
    src.start();
    await new Promise((r) => setTimeout(r, durationSec * 1000));
    recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
    await stopped;

    if (chunks.length === 0) throw new Error('Recording produced no output');
    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/mp4' });
    return { blob, url: URL.createObjectURL(blob) };
  } finally {
    audioCtx.close().catch(() => {});
  }
}

/**
 * Record `canvas` for `durationSec` with a scheduled SFX track (match-replay
 * clip). The caller drives the canvas animation; the audio is rendered
 * OFFLINE from the schedule (never captured live), so recorded sound always
 * matches the beat timeline exactly.
 *
 * Ladder: WebCodecs video + AAC audio (exact-duration fast-start MP4, the
 * production-proven solo pipeline) → WebCodecs silent (no AAC encoder) →
 * MediaRecorder with a live audio track → MediaRecorder silent.
 */
export async function recordClipWithAudio(
  canvas: HTMLCanvasElement,
  durationSec: number,
  sfx: ClipSfxEvent[],
  onCaptureStart?: () => void
): Promise<ClipResult> {
  let audio: AudioBuffer | null = null;
  try {
    audio = await renderSfxBuffer(sfx, durationSec);
  } catch (e) {
    console.warn('clipEncoder: SFX offline render failed — silent clip:', e);
  }

  // `onCaptureStart` must fire EXACTLY once, when capture truly begins —
  // guard against a failed path firing it and a fallback firing it again.
  let started = false;
  const startOnce = () => {
    if (!started) {
      started = true;
      onCaptureStart?.();
    }
  };

  try {
    const result = await recordWithWebCodecs(canvas, durationSec, audio, startOnce);
    if (result) return result;
  } catch (e) {
    console.warn('clipEncoder: WebCodecs path failed, falling back:', e);
  }
  if (audio && !started) {
    try {
      return await recordWithMediaRecorderAudio(canvas, durationSec, audio, startOnce);
    } catch (e) {
      console.warn('clipEncoder: MediaRecorder+audio failed, falling back:', e);
    }
  }
  startOnce();
  return recordWithMediaRecorder(canvas, durationSec);
}
