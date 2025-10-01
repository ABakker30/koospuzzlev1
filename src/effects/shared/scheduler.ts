// Fixed-step scheduler for deterministic capture

// Deterministic frame driver (no wall-clock usage)
export function forEachFrameFixed(durationSec: number, fps: number, cb: (frameIx: number, tSec: number) => void) {
  const total = Math.round(durationSec * fps);
  const dt = 1 / fps;
  for (let i = 0; i < total; i++) {
    cb(i, i * dt);
  }
}
