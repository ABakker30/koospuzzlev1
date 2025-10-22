// Gravity Effect Types
export type GravityPreset = "low" | "earth" | "high";

export type GravityEffectConfig = {
  v: 1;
  /** Gravity strength (preset or custom value) */
  gravity: number | GravityPreset;
  /** Optional variation jitter applied once before simulation */
  variation?: number;
  seed?: number;
  /** Environment toggles */
  environment: {
    walls?: boolean;
  };
  /** Release behavior for the initial drop */
  release: {
    mode: "allAtOnce" | "staggered";
    staggerMs?: number;
  };
};

export const DEFAULT_GRAVITY: GravityEffectConfig = {
  v: 1,
  gravity: "earth",
  variation: 0.25,
  seed: 42,
  environment: { walls: true },
  release: { mode: "staggered", staggerMs: 150 },
};

// Simple validation function
export function validateGravityConfig(config: any): config is GravityEffectConfig {
  if (config.v !== 1) return false;
  
  const gravity = config.gravity;
  if (typeof gravity === 'string') {
    if (!['low', 'earth', 'high'].includes(gravity)) return false;
  } else if (typeof gravity === 'number') {
    if (gravity < -50 || gravity > 0) return false;
  } else {
    return false;
  }
  
  if (!['allAtOnce', 'staggered'].includes(config.release?.mode)) return false;
  
  if (config.variation !== undefined) {
    if (typeof config.variation !== 'number' || config.variation < 0 || config.variation > 1) return false;
  }
  
  if (config.seed !== undefined) {
    if (!Number.isInteger(config.seed)) return false;
  }
  
  return true;
}

// Gravity presets in m/s^2
export const GRAVITY_PRESETS = {
  low: -3.0,
  earth: -9.81,
  high: -20.0,
} as const;

// Helper to get gravity value
export function getGravityValue(gravity: number | GravityPreset): number {
  if (typeof gravity === 'number') {
    return gravity;
  }
  return GRAVITY_PRESETS[gravity];
}
