// Turn Table Effect Types

// Re-export config type for convenience
export type { TurnTableConfig } from './presets';
export { DEFAULT_CONFIG } from './presets';

// Effect interface (will be moved to shared location later)
export interface Effect {
  init(ctx: any): void; // EffectContext - typed as any for now
  play(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  dispose(): void;
  tick(time: number): void;
  setConfig(cfg: object): void;
  getConfig(): object;
}
