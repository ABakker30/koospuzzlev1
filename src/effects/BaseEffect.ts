import type { EffectContext } from '../studio/EffectContext';

// Base Effect interface
export interface Effect {
  init(ctx: EffectContext): void;
  play(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  dispose(): void;
  tick(time: number): void;
  setConfig(cfg: object): void;
  getConfig(): object;
}

// Base Effect class with common functionality
export abstract class BaseEffect implements Effect {
  protected context: EffectContext | null = null;

  init(context: EffectContext): void {
    this.context = context;
  }

  abstract play(): void;
  abstract pause(): void;
  abstract resume(): void;
  abstract stop(): void;
  abstract dispose(): void;
  abstract tick(time: number): void;
  abstract setConfig(cfg: object): void;
  abstract getConfig(): object;
}
