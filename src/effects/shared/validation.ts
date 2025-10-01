// Validation utilities and determinism helpers
import * as THREE from 'three';

// Guardrails to assert (throw early, fail fast)
export function validateTurntableConfig(cfg: {
  durationSec: number; 
  degrees: number; 
  mode: 'camera'|'object';
}) {
  if (!(cfg.durationSec > 0)) throw new Error('durationSec must be > 0');
  if (!Number.isFinite(cfg.degrees)) throw new Error('degrees must be finite');
  if (cfg.mode !== 'camera' && cfg.mode !== 'object') throw new Error('mode invalid');
}

// Quick determinism probe (matrix digest)
// Use for dev only: compare preview vs capture at key frames
export function mat4Digest(m: THREE.Matrix4): string {
  const e = m.elements; // length 16
  // tiny stable rounding to reduce float noise
  const r = Array.from(e, v => Math.round(v * 1e5) / 1e5);
  // fast non-crypto digest
  let h = 2166136261;
  for (let i = 0; i < r.length; i++) {
    const s = r[i].toString();
    for (let j = 0; j < s.length; j++) {
      h ^= s.charCodeAt(j);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
  }
  return (h >>> 0).toString(16);
}
