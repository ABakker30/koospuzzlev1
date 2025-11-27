// Gravity Effect Types
export type GravityPreset = "low" | "earth" | "high";

// Solution data for compound bodies (puzzle pieces)
export type SolutionPiece = {
  id: number;
  spheres: Array<{ x: number; y: number; z: number }>;
  bonds?: Array<{ from: number; to: number }>;
};

export type SolutionData = {
  pieces: SolutionPiece[];
  radius: number;
};

export type GravityEffectConfig = {
  schemaVersion: 1;
  /** Gravity strength (preset or custom value) */
  gravity: number | GravityPreset;
  /** Duration of fall phase in seconds */
  durationSec: number;
  /** Pause duration in milliseconds (at start, middle, and end) */
  pauseMs?: number;
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
  explosion?: {
    enabled: boolean;
    strength?: number; // 0-100, impulse multiplier
  };
  /** Keep orbit controls enabled during playback (for gallery movies) */
  preserveControls?: boolean;
  /** Optional solution data for piece-based compound bodies */
  solutionData?: SolutionData;
  /** Loop configuration */
  loop?: {
    enabled: boolean;
    count?: number; // 0 = infinite/page-controlled
  };
  /**
   * Seed used by GravityEffect for per-run randomness.
   * Set this based on HHMMSS when a cycle starts.
   */
  randomSeed?: number;
};

export const DEFAULT_GRAVITY: GravityEffectConfig = {
  schemaVersion: 1,
  gravity: "earth",
  durationSec: 8,
  pauseMs: 1000,
  variation: 0.25,
  seed: 42,
  environment: { walls: true },
  release: { mode: "all" },
  autoBreak: {
    enabled: false,
    level: "medium"
  },
  loop: {
    enabled: false,
    count: 0
  },
  randomSeed: 0,
};

// Simple validation function
export function validateGravityConfig(config: any): config is GravityEffectConfig {
  if (config.schemaVersion !== 1) return false;
  
  const gravity = config.gravity;
  if (typeof gravity === 'string') {
    if (!['low', 'earth', 'high'].includes(gravity)) return false;
  } else if (typeof gravity === 'number') {
    if (gravity < -50 || gravity > 50) return false;
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
