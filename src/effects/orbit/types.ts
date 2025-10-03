// Orbit Effect Types - Keyframe Camera Animation

export interface OrbitKeyframe {
  t?: number;                    // 0..duration; optional → distribute on save
  pos: [number, number, number]; // world position
  target?: [number, number, number]; // ignored/omitted if lockTargetToCentroid or mode='locked'
  fov?: number;                  // field of view
  easeToNext?: boolean;          // per-segment easing flag
}

export interface OrbitConfig {
  schemaVersion: number;
  durationSec: number;
  loop: boolean;
  mode: 'free' | 'locked';
  lockTargetToCentroid: boolean;
  keys: OrbitKeyframe[];
  finalize: 'leaveAsEnded' | 'returnToStart' | 'snapToPose';
}

export interface OrbitPreset {
  name: string;
  config: OrbitConfig;
  createdAt: string; // ISO string
}

// Effect interface for integration
export interface Effect {
  init(context: any): Promise<void>;
  dispose(): void;
  play(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  tick(deltaTime: number): void;
  getConfig(): any;
  setOnComplete?(callback: () => void): void;
}
