// GravityEffect.ts - Gravity effect wrapper (NO loop, gravity-only)
import { GravityEffectConfig, DEFAULT_GRAVITY } from './types';
import { RapierPhysicsManager } from './rapierIntegration';
import * as THREE from 'three';

enum GravityState {
  IDLE = 'IDLE',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  COMPLETE = 'COMPLETE',
  DISPOSED = 'DISPOSED'
}

enum PlaybackPhase {
  FALL = 'FALL',
  PAUSE = 'PAUSE',
  REVERSE = 'REVERSE',
  LOOP_PAUSE = 'LOOP_PAUSE'
}

interface Effect {
  init(ctx: any): void;
  setConfig(cfg: object): void;
  getConfig(): object;
  setOnComplete(callback: () => void): void;
  play(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  tick(): void;
  dispose(): void;
  isDisposed(): boolean;
  startRecording(): void;
  stopRecording(): void;
}

export class GravityEffect implements Effect {
  private state: GravityState = GravityState.IDLE;
  private config: GravityEffectConfig = { ...DEFAULT_GRAVITY };
  private onComplete?: () => void;
  
  private startTime: number = 0;
  private pausedTime: number = 0;
  private elapsedTime: number = 0;
  
  private spheresGroup: any = null;
  private scene: any = null;
  
  private physicsManager: RapierPhysicsManager | null = null;
  private lastTickTime: number = 0;
  private instancedMap = new Map<string, { mesh: THREE.InstancedMesh; index: number }>();
  
  
  private rafId: number | null = null;
  private initializing = false;
  
  // Frame recording for reverse playback
  private phase: PlaybackPhase = PlaybackPhase.FALL;
  private recordedFrames: Map<string, THREE.Matrix4>[] = [];
  private originalPositions: Map<string, THREE.Matrix4> | null = null; // True original before physics
  private reverseProgress = 0;
  private pauseTimer = 0;
  
  // Easing function: ease-in-out cubic
  private easeInOutCubic(t: number): number {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  
  private loop = () => {
    if (this.state === GravityState.PLAYING) this.tick();
    this.rafId = requestAnimationFrame(this.loop);
  };
  
  constructor() {
    console.log('🌍 GravityEffect: Constructed');
  }

  init(ctx: any): void {
    if (this.state === GravityState.DISPOSED) {
      console.warn('GravityEffect: Cannot init disposed effect');
      return;
    }

    console.log('🌍 GravityEffect: Initializing');

    if (!ctx) {
      throw new Error('GravityEffect: EffectContext is required');
    }

    const required = ['scene', 'spheresGroup', 'camera', 'controls', 'renderer'];
    for (const prop of required) {
      if (!ctx[prop]) {
        throw new Error(`GravityEffect: Missing required context property: ${prop}`);
      }
    }

    this.context = ctx;
    this.spheresGroup = ctx.spheresGroup;
    this.scene = ctx.scene;

    console.log('🌍 GravityEffect: Initialized');
  }

  setConfig(cfg: object): void {
    if (this.state === GravityState.DISPOSED) return;
    this.config = { ...this.config, ...cfg } as GravityEffectConfig;
    console.log('🌍 GravityEffect: Config updated', this.config);
  }

  getConfig(): object {
    return JSON.parse(JSON.stringify(this.config));
  }

  setOnComplete(callback: () => void): void {
    this.onComplete = callback;
  }

  play(): void {
    if (this.state === GravityState.DISPOSED) return;
    
    console.log('🌍 GravityEffect: Play');
    void this.playInternal();
  }
  
  private async playInternal(): Promise<void> {
    if (this.initializing || this.state === GravityState.PLAYING) return;
    this.initializing = true;
    
    try {
      // Build instancedMap first, then capture originals before physics
      this.buildInstancedMap();
      this.captureOriginalPositions();
      
      await this.initializePhysics();
      
      if (this.state === GravityState.DISPOSED) return;
      
      this.state = GravityState.PLAYING;
      const now = performance.now();
      this.startTime = now;
      this.lastTickTime = now;
      this.elapsedTime = 0;
      
      this.startLoop();
    } finally {
      this.initializing = false;
    }
  }

  pause(): void {
    if (this.state !== GravityState.PLAYING) return;
    
    console.log('🌍 GravityEffect: Pause');
    this.state = GravityState.PAUSED;
    this.pausedTime = performance.now();
  }

  resume(): void {
    if (this.state !== GravityState.PAUSED) return;
    
    console.log('🌍 GravityEffect: Resume');
    this.state = GravityState.PLAYING;
    const now = performance.now();
    const pauseDuration = now - this.pausedTime;
    this.startTime += pauseDuration;
    this.lastTickTime = now;
  }

  stop(): void {
    console.log('🌍 GravityEffect: Stop (leaving spheres in current state)');
    
    this.stopLoop();
    this.cleanupPhysics();
    // DO NOT restore - leave spheres where they are
    
    this.state = GravityState.IDLE;
    this.elapsedTime = 0;
    this.onComplete = undefined;
  }

  tick(): void {
    if (this.state !== GravityState.PLAYING) return;

    const now = performance.now();
    const deltaTime = (now - this.lastTickTime) / 1000;
    this.lastTickTime = now;
    this.elapsedTime = (now - this.startTime) / 1000;

    const loopEnabled = this.config.loop?.enabled ?? false;

    switch (this.phase) {
      case PlaybackPhase.FALL:
        this.updatePhysics();
        this.recordFrame();
        
        const duration = this.config.durationSec ?? 6;
        if (this.elapsedTime >= duration) {
          console.log(`⏱️ Fall complete (${this.recordedFrames.length} frames recorded)`);
          
          if (loopEnabled) {
            this.phase = PlaybackPhase.PAUSE;
            this.pauseTimer = 0;
          } else {
            this.complete();
          }
        }
        break;

      case PlaybackPhase.PAUSE:
        this.pauseTimer += deltaTime;
        const pauseDuration = (this.config.loop?.pauseMs ?? 1000) / 1000;
        
        if (this.pauseTimer >= pauseDuration) {
          console.log(`⏸️ Pause complete, starting reverse playback`);
          this.cleanupPhysics(); // Stop physics for reverse
          this.phase = PlaybackPhase.REVERSE;
          this.reverseProgress = 0; // Start eased reverse from 0
        }
        break;

      case PlaybackPhase.REVERSE:
        // Update progress (0 to 1) with easing
        this.reverseProgress += deltaTime / (this.config.durationSec ?? 6);
        this.reverseProgress = Math.min(this.reverseProgress, 1);
        
        const easedProgress = this.easeInOutCubic(this.reverseProgress);
        const targetFrameIndex = Math.floor((1 - easedProgress) * (this.recordedFrames.length - 1));
        
        if (targetFrameIndex >= 0) {
          this.playReverseFrameAt(targetFrameIndex);
        }
        
        if (this.reverseProgress >= 1) {
          console.log(`⏪ Reverse complete, looping...`);
          this.phase = PlaybackPhase.LOOP_PAUSE;
          this.pauseTimer = 0;
          this.reverseProgress = 0;
        }
        break;

      case PlaybackPhase.LOOP_PAUSE:
        this.pauseTimer += deltaTime;
        const loopPauseDuration = (this.config.loop?.pauseMs ?? 1000) / 1000;
        
        if (this.pauseTimer >= loopPauseDuration) {
          console.log(`🔄 Loop pause complete, restarting...`);
          void this.restartLoop();
        }
        break;
    }
  }

  private complete(): void {
    console.log('🌍 GravityEffect: Complete (leaving spheres in fallen state)');
    
    this.stopLoop();
    this.state = GravityState.COMPLETE;
    this.cleanupPhysics();
    // DO NOT restore original state - leave spheres where they fell
    
    if (this.onComplete) {
      this.onComplete();
    }
  }

  private captureOriginalPositions(): void {
    // Capture positions BEFORE physics/jitter is applied
    if (this.originalPositions) return; // Already captured
    
    this.originalPositions = new Map<string, THREE.Matrix4>();
    
    if (!this.spheresGroup) return;
    
    this.spheresGroup.traverse((obj: THREE.Object3D) => {
      if ((obj as any).isInstancedMesh) {
        const mesh = obj as THREE.InstancedMesh;
        for (let i = 0; i < mesh.count; i++) {
          const id = `${mesh.uuid}_${i}`;
          const M = new THREE.Matrix4();
          mesh.getMatrixAt(i, M);
          this.originalPositions!.set(id, M.clone());
        }
      }
    });
    
    console.log(`📸 Captured ${this.originalPositions.size} original positions (before physics)`);
  }

  private recordFrame(): void {
    const frame = new Map<string, THREE.Matrix4>();
    
    this.instancedMap.forEach((map, id) => {
      const M = new THREE.Matrix4();
      map.mesh.getMatrixAt(map.index, M);
      frame.set(id, M.clone());
    });
    
    this.recordedFrames.push(frame);
  }

  private playReverseFrameAt(frameIndex: number): void {
    if (frameIndex < 0 || frameIndex >= this.recordedFrames.length) return;
    
    const frame = this.recordedFrames[frameIndex];
    const touched = new Set<THREE.InstancedMesh>();
    
    frame.forEach((matrix, id) => {
      const map = this.instancedMap.get(id);
      if (map) {
        map.mesh.setMatrixAt(map.index, matrix);
        touched.add(map.mesh);
      }
    });
    
    touched.forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true));
  }

  private async restartLoop(): Promise<void> {
    console.log('🔄 Restarting loop...');
    
    // Reset to TRUE original positions (before any physics/jitter)
    if (this.originalPositions) {
      const touched = new Set<THREE.InstancedMesh>();
      
      this.originalPositions.forEach((matrix, id) => {
        const map = this.instancedMap.get(id);
        if (map) {
          map.mesh.setMatrixAt(map.index, matrix);
          touched.add(map.mesh);
        }
      });
      
      touched.forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true));
      console.log(`🔄 Reset to original positions (${this.originalPositions.size} instances)`);
    }
    
    // Clear recorded frames for fresh recording
    this.recordedFrames = [];
    
    // Reinitialize physics (instancedMap persists, no need to rebuild)
    this.cleanupPhysics();
    await this.initializePhysics();
    
    // Reset timers and phase AFTER physics is ready
    this.phase = PlaybackPhase.FALL;
    this.startTime = performance.now();
    this.lastTickTime = this.startTime;
    this.elapsedTime = 0;
    
    console.log('✅ Loop restarted, physics ready');
  }

  dispose(): void {
    console.log('🌍 GravityEffect: Dispose (leaving spheres in current state)');
    
    this.stopLoop();
    this.cleanupPhysics();
    // DO NOT restore - leave spheres where they are
    this.state = GravityState.DISPOSED;
    this.spheresGroup = null;
    this.onComplete = undefined;
    
    // Clear recorded data
    this.recordedFrames = [];
    this.originalPositions = null;
    this.instancedMap.clear();
  }

  isDisposed(): boolean {
    return this.state === GravityState.DISPOSED;
  }

  startRecording(): void {
    console.log('🌍 GravityEffect: Recording started (automatic)');
  }

  stopRecording(): void {
    console.log('🌍 GravityEffect: Recording stopped (automatic)');
  }

  private async initializePhysics(): Promise<void> {
    console.log('🌍 GravityEffect: Initialize physics');

    try {
      // Force gravity-only mode (disable loop in physics manager)
      const gravityOnlyConfig: any = {
        ...this.config,
        loop: undefined, // Remove loop completely from physics
        durationSec: this.config.durationSec ?? 6
      };

      this.physicsManager = new RapierPhysicsManager();
      await this.physicsManager.initialize(
        gravityOnlyConfig,
        this.spheresGroup,
        this.scene
      );
      
      console.log('✅ Physics initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize physics:', error);
      this.physicsManager = null;
    }
  }

  private buildInstancedMap(): void {
    this.instancedMap.clear();
    
    if (!this.spheresGroup) return;
    
    this.spheresGroup.traverse((obj: THREE.Object3D) => {
      if ((obj as any).isInstancedMesh) {
        const mesh = obj as THREE.InstancedMesh;
        for (let i = 0; i < mesh.count; i++) {
          const id = `${mesh.uuid}_${i}`;
          this.instancedMap.set(id, { mesh, index: i });
        }
      }
    });
    
    console.log(`📸 Built instancedMap: ${this.instancedMap.size} instances`);
  }

  private updatePhysics(): void {
    if (!this.physicsManager) return;

    const now = performance.now();
    let deltaTime = (now - this.lastTickTime) / 1000;
    
    if (!Number.isFinite(deltaTime) || deltaTime <= 0 || deltaTime > 0.25) {
      deltaTime = 1/60;
    }

    const progress = 0; // Not used in gravity-only mode
    this.physicsManager.step(deltaTime, this.config, this.scene, progress);
  }

  private cleanupPhysics(): void {
    console.log('🌍 GravityEffect: Cleanup physics');
    
    if (this.physicsManager) {
      this.physicsManager.dispose(this.spheresGroup);
      this.physicsManager = null;
    }
  }
  
  private startLoop(): void {
    if (this.rafId == null) {
      this.rafId = requestAnimationFrame(this.loop);
      console.log('▶️ Started RAF loop');
    }
  }
  
  private stopLoop(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
      console.log('⏸️ Stopped RAF loop');
    }
  }
}
