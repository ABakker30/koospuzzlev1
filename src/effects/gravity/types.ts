// Gravity Effect Types
export type GravityPreset = "earth" | "moon" | "micro" | { custom: number };

export type GravityEffectConfig = {
  v: 1;
  durationSec: number;
  gravity: GravityPreset;
  release: {
    mode: "all" | "staggered";
    staggerMs?: number;
  };
  autoBreak: {
    enabled: boolean;
    level: "low" | "medium" | "high";
  };
  environment: {
    walls: boolean;
    startOnGround: boolean;
  };
  animation: {
    loop: boolean; // Loop the animation
    startMode: "shape" | "scattered"; // Start as assembled shape or scattered on floor
    pauseBetweenLoops?: number; // Seconds to pause between loops
    easing: "none" | "in" | "out" | "in-out"; // Easing function for gravity
    magneticForce: number; // Strength of magnetic return force (0-1000)
    damping: number; // Damping factor for return motion (0-1)
  };
  variation: number;
  seed: number;
};

export const DEFAULT_GRAVITY: GravityEffectConfig = {
  v: 1,
  durationSec: 6,
  gravity: "earth",
  release: { mode: "staggered", staggerMs: 150 },
  autoBreak: { enabled: false, level: "medium" },
  environment: { walls: true, startOnGround: false },
  animation: { loop: false, startMode: "shape", pauseBetweenLoops: 1, easing: "none", magneticForce: 300, damping: 0.85 },
  variation: 0.25,
  seed: 42,
};

// Simple validation function (zod is optional per spec)
export function validateGravityConfig(config: any): config is GravityEffectConfig {
  if (config.v !== 1) return false;
  if (typeof config.durationSec !== 'number' || config.durationSec < 1 || config.durationSec > 20) return false;
  
  const gravity = config.gravity;
  if (typeof gravity === 'string') {
    if (!['earth', 'moon', 'micro'].includes(gravity)) return false;
  } else if (typeof gravity === 'object' && gravity.custom) {
    if (typeof gravity.custom !== 'number' || gravity.custom < -50 || gravity.custom > 0) return false;
  } else {
    return false;
  }
  
  if (!['all', 'staggered'].includes(config.release?.mode)) return false;
  if (typeof config.autoBreak?.enabled !== 'boolean') return false;
  if (!['low', 'medium', 'high'].includes(config.autoBreak?.level)) return false;
  if (typeof config.environment?.walls !== 'boolean') return false;
  if (typeof config.environment?.startOnGround !== 'boolean') return false;
  if (typeof config.animation?.loop !== 'boolean') return false;
  if (!['shape', 'scattered'].includes(config.animation?.startMode)) return false;
  if (!['none', 'in', 'out', 'in-out'].includes(config.animation?.easing)) return false;
  if (typeof config.animation?.magneticForce !== 'number' || config.animation.magneticForce < 0) return false;
  if (typeof config.animation?.damping !== 'number' || config.animation.damping < 0 || config.animation.damping > 1) return false;
  if (typeof config.variation !== 'number' || config.variation < 0 || config.variation > 1) return false;
  if (!Number.isInteger(config.seed)) return false;
  
  return true;
}

// Gravity presets in m/s^2
export const GRAVITY_PRESETS = {
  earth: -9.81,
  moon: -1.62,
  micro: -0.2,
} as const;

// Helper to get gravity value
export function getGravityValue(preset: GravityPreset): number {
  if (typeof preset === 'string') {
    return GRAVITY_PRESETS[preset];
  }
  return preset.custom;
}
