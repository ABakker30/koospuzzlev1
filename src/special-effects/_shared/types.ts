import * as THREE from 'three';

export type EffectId = 'keyframe';

export type EffectState = 'idle' | 'playing' | 'paused' | 'recording';

export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface EffectCtx {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  controls?: any; // OrbitControls
  setNeedsRedraw: () => void; // request render
}

export interface EffectInstance<Config = unknown> {
  id: EffectId;
  name: string;
  getConfig(): Config;
  setConfig(cfg: Config): void;
  canPlay(): boolean;
  getDurationSec(): number | undefined; // undefined = infinite
  onEnable(ctx: EffectCtx): void;
  onUpdate(dt: number, t: number, ctx: EffectCtx): void;
  onPause?(ctx: EffectCtx): void;
  onStop(ctx: EffectCtx): void;
}

export interface PlayControls {
  play(): void;
  pause(): void;
  stop(): void;
  record(opts: CaptureOptions): Promise<void>;
}

export interface CaptureOptions {
  mode: 'realtime' | 'offline';
  width: number; 
  height: number;
  fps: number; 
  durationSec?: number;
  codec?: string; 
  quality?: 'medium' | 'high' | 'max';
}

// Keyframe-specific types
export interface CameraKeyOrbit {
  theta: number; // Azimuth angle in radians
  phi: number;   // Polar angle in radians
  radius: number; // Distance from target
  target: [number, number, number]; // Target position [x, y, z]
  fov?: number; // Optional FOV change
}

export interface KeyframeConfig {
  durationSec: number; // Animation duration in seconds
  easing: Easing;
  constantSpeed: boolean; // If true, maintain constant camera movement speed
  closed: boolean; // If true, connect last keyframe back to first
  loop: boolean;
  fpsPreview?: number; // Optional UI clamp
  keys: CameraKeyOrbit[];
}

// Utility types for telemetry and persistence
export interface EffectTelemetry {
  buildCacheMs?: number;
  framesRendered?: number;
  startTime?: number;
  endTime?: number;
}

export interface EffectSaveData {
  effectId: EffectId;
  config: unknown;
  timestamp: string;
  telemetry?: EffectTelemetry;
}
