// EffectContext - read-only handles for effects (no scene mutations)
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Type definitions for the context
export interface PreviewClock {
  now(): number;
  onTick(callback: (deltaTime: number) => void): () => void; // returns unsubscribe
}

export interface CaptureClock {
  fixedStep: number; // seconds per frame (default 1/30)
  onFrame(callback: (frameIndex: number, timeSeconds: number) => void): () => void; // returns unsubscribe
}

export interface EffectStorage {
  saveManifest(manifest: object): Promise<void>;
  loadManifest(id: string): Promise<object | null>;
  listManifests(): Promise<object[]>;
}

export interface EffectContext {
  scene: THREE.Scene;
  spheresGroup: THREE.Group;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  controls: OrbitControls;
  renderer: THREE.WebGLRenderer;
  centroidWorld: THREE.Vector3;
  time: {
    preview: PreviewClock;
    capture: CaptureClock;
  };
  storage: EffectStorage;
}

export interface EffectContextArgs {
  scene: THREE.Scene;
  spheresGroup: THREE.Group;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  controls: OrbitControls;
  renderer: THREE.WebGLRenderer;
  centroidWorld: THREE.Vector3;
}

// Build the effect context (read-only, no mutations)
export function buildEffectContext(args: EffectContextArgs): EffectContext {
  console.log('🏗️ EffectContext: Building context for effect');
  
  // Validate required arguments
  if (!args.scene || !args.spheresGroup || !args.camera || !args.controls || !args.renderer || !args.centroidWorld) {
    throw new Error('EffectContext: Missing required arguments');
  }

  // Preview clock stub (real-time, clamped)
  const previewClock: PreviewClock = {
    now(): number {
      return performance.now() / 1000; // seconds since page load
    },
    
    onTick(callback: (deltaTime: number) => void): () => void {
      console.log('🕐 EffectContext: preview.onTick() registered (stub)');
      // Stub: return no-op unsubscribe function
      // Real implementation will integrate with Studio's render loop
      return () => {
        console.log('🕐 EffectContext: preview.onTick() unsubscribed (stub)');
      };
    }
  };

  // Capture clock stub (fixed-step, deterministic)
  const captureClock: CaptureClock = {
    fixedStep: 1 / 30, // 30 FPS default
    
    onFrame(callback: (frameIndex: number, timeSeconds: number) => void): () => void {
      console.log('🎬 EffectContext: capture.onFrame() registered (stub)');
      // Stub: return no-op unsubscribe function
      // Real implementation will drive fixed-step capture loop
      return () => {
        console.log('🎬 EffectContext: capture.onFrame() unsubscribed (stub)');
      };
    }
  };

  // Storage stub (async, logs operations)
  const storage: EffectStorage = {
    async saveManifest(manifest: object): Promise<void> {
      console.log('💾 EffectContext: storage.saveManifest() called (stub)', manifest);
      // Stub: resolve immediately
      // Real implementation will use IndexedDB
      return Promise.resolve();
    },

    async loadManifest(id: string): Promise<object | null> {
      console.log('📂 EffectContext: storage.loadManifest() called (stub)', { id });
      // Stub: return null (not found)
      // Real implementation will query IndexedDB
      return Promise.resolve(null);
    },

    async listManifests(): Promise<object[]> {
      console.log('📋 EffectContext: storage.listManifests() called (stub)');
      // Stub: return empty array
      // Real implementation will list IndexedDB entries
      return Promise.resolve([]);
    }
  };

  // Build the context object
  const context: EffectContext = {
    scene: args.scene,
    spheresGroup: args.spheresGroup,
    camera: args.camera,
    controls: args.controls,
    renderer: args.renderer,
    centroidWorld: args.centroidWorld.clone(), // Clone to prevent mutation
    time: {
      preview: previewClock,
      capture: captureClock
    },
    storage
  };

  // Freeze the context to discourage mutation
  Object.freeze(context);
  Object.freeze(context.time);
  Object.freeze(context.centroidWorld); // Vector3 is mutable, so freeze it

  console.log('✅ EffectContext: Context built successfully', {
    hasScene: !!context.scene,
    hasSpheresGroup: !!context.spheresGroup,
    hasCamera: !!context.camera,
    hasControls: !!context.controls,
    hasRenderer: !!context.renderer,
    centroid: {
      x: context.centroidWorld.x.toFixed(3),
      y: context.centroidWorld.y.toFixed(3),
      z: context.centroidWorld.z.toFixed(3)
    },
    captureFixedStep: context.time.capture.fixedStep
  });

  return context;
}
