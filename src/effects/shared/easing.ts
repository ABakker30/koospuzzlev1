// Easing functions for deterministic animation
// Maps t in [0,1] → eased fraction (no allocations)

export function ease(frac: number, mode: 'linear'|'ease-in'|'ease-out'|'ease-in-out'): number {
  const x = Math.min(1, Math.max(0, frac));
  switch (mode) {
    case 'ease-in':     return x * x;
    case 'ease-out':    return 1 - (1 - x) * (1 - x);
    case 'ease-in-out': return x < 0.5 ? 2*x*x : 1 - Math.pow(-2*x + 2, 2) / 2;
    default:            return x; // linear
  }
}

// Calculate angle at time t in radians
// totalAngle = degrees * (Math.PI/180) * (direction==='ccw' ? 1 : -1)
export function angleAt(tSec: number, durationSec: number, totalAngleRad: number, easing: Parameters<typeof ease>[1]) {
  const f = ease(tSec / Math.max(1e-6, durationSec), easing);
  return f * totalAngleRad;
}
