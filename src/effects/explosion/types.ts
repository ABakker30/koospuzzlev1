// Explosion Effect Types

export interface ExplosionConfig {
  schemaVersion: number;
  durationSec: number;
  loop: boolean;
  pauseBetweenLoops: number; // Seconds to pause between loop cycles
  maxExplosionFactor: number; // 0 = assembled, 1 = 1.5x exploded, higher = more
  rotationEnabled: boolean;
  rotationDegrees: number; // e.g., 360 for full rotation
  rotationEasing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  explosionEasing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

// Effect interface (matches turntable/orbit pattern)
export interface Effect {
  init(ctx: any): void;
  play(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  dispose(): void;
  tick(time: number): void;
  setConfig(cfg: object): void;
  getConfig(): object;
}
