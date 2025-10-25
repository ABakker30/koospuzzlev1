// Gravity Effect Types
export type GravityPreset = "low" | "earth" | "high";

export type GravityEffectConfig = {
  schemaVersion: 1;
  /** Gravity strength (preset or custom value) */
  gravity: number | GravityPreset;
  /** Duration of fall phase in seconds */
  durationSec: number;
  /** Optional variation jitter applied once before simulation */
  variation?: number;
  seed?: number;
  /** Environment toggles */
  environment: {
    walls?: boolean;
  };
  /** Release behavior for the initial drop */
  release: {
    mode: "all" | "staggered";
    staggerMs?: number;
  };
  /** Auto-break joint configuration */
  autoBreak?: {
    enabled: boolean;
    level: "low" | "medium" | "high";
  };
  /** Loop configuration for reverse playback */
  loop?: {
    enabled: boolean;
    pauseMs?: number; // Optional pause between fall and reverse (default 1000ms)
  };
};

export const DEFAULT_GRAVITY: GravityEffectConfig = {
  schemaVersion: 1,
  gravity: "earth",
  durationSec: 8,
  variation: 0.25,
  seed: 42,
  environment: { walls: true },
  release: { mode: "all" },
  autoBreak: {
    enabled: false,
    level: "medium"
  },
  loop: {
    enabled: true,
    pauseMs: 1000, // 1 second pause between fall and reverse
  },
};

// Simple validation function
export function validateGravityConfig(config: any): config is GravityEffectConfig {
  if (config.schemaVersion !== 1) return false;
  
  const gravity = config.gravity;
  if (typeof gravity === 'string') {
    if (!['low', 'earth', 'high'].includes(gravity)) return false;
  } else if (typeof gravity === 'number') {
    if (gravity < -50 || gravity > 0) return false;
  } else {
    return false;
  }
  
  if (typeof config.durationSec !== 'number' || config.durationSec <= 0) return false;
  
  if (!['all', 'staggered'].includes(config.release?.mode)) return false;
  
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
