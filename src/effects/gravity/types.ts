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
    ground: boolean;
    walls: boolean;
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
  environment: { ground: true, walls: true },
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
  if (typeof config.environment?.ground !== 'boolean') return false;
  if (typeof config.environment?.walls !== 'boolean') return false;
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
