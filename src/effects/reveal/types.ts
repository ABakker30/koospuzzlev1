// Reveal Effect Types

export interface RevealConfig {
  schemaVersion: number;
  durationSec: number;
  loop: boolean;
  pauseBetweenLoops: number; // Seconds to pause between loop cycles
  rotationEnabled: boolean;
  rotationDegrees: number; // e.g., 360 for full rotation
  rotationEasing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  revealEasing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
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
