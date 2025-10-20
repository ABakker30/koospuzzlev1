// Gravity Effect - Physics-based simulation with auto-break
import { GravityEffectConfig, DEFAULT_GRAVITY, getGravityValue } from './types';
import * as THREE from 'three';

enum GravityState {
  IDLE = 'IDLE',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  COMPLETE = 'COMPLETE',
  DISPOSED = 'DISPOSED'
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
  private context: any = null;
  private onComplete?: () => void;
  private isRecording = false;
  
  // Simulation state
  private startTime: number = 0;
  private pausedTime: number = 0;
  private elapsedTime: number = 0;
  
  // Scene references
  private spheresGroup: any = null;
  private controls: any = null;
  private scene: any = null;
  
  // Physics state (placeholder for Rapier integration)
  private world: any = null;
  private bodies: Map<string, any> = new Map();
  private joints: any[] = [];
  private groundPlane: any = null;
  
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
    this.controls = ctx.controls;
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
    this.state = GravityState.PLAYING;
    this.startTime = performance.now();
    this.elapsedTime = 0;
    
    // Initialize physics simulation
    this.initializePhysics();
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
    const pauseDuration = performance.now() - this.pausedTime;
    this.startTime += pauseDuration;
  }

  stop(): void {
    console.log('🌍 GravityEffect: Stop');
    this.cleanupPhysics();
    this.state = GravityState.IDLE;
    this.elapsedTime = 0;
  }

  tick(): void {
    if (this.state !== GravityState.PLAYING) return;

    const now = performance.now();
    this.elapsedTime = (now - this.startTime) / 1000; // Convert to seconds

    // Check if duration is complete
    if (this.elapsedTime >= this.config.durationSec) {
      this.complete();
      return;
    }

    // Update physics simulation (placeholder)
    this.updatePhysics();
  }

  dispose(): void {
    console.log('🌍 GravityEffect: Dispose');
    this.cleanupPhysics();
    this.state = GravityState.DISPOSED;
    this.context = null;
    this.spheresGroup = null;
    this.controls = null;
  }

  isDisposed(): boolean {
    return this.state === GravityState.DISPOSED;
  }

  startRecording(): void {
    this.isRecording = true;
    console.log('🌍 GravityEffect: Recording started');
  }

  stopRecording(): void {
    this.isRecording = false;
    console.log('🌍 GravityEffect: Recording stopped');
  }

  private complete(): void {
    console.log('🌍 GravityEffect: Complete');
    this.state = GravityState.COMPLETE;
    this.cleanupPhysics();
    
    if (this.onComplete) {
      this.onComplete();
    }
  }

  private initializePhysics(): void {
    console.log('🌍 GravityEffect: Initialize physics', {
      gravity: getGravityValue(this.config.gravity),
      releaseMode: this.config.release.mode,
      autoBreak: this.config.autoBreak.enabled
    });

    // TODO: Initialize Rapier physics world
    // - Create world with gravity vector
    // - Create rigid bodies for each sphere
    // - Create fixed joints between connected spheres
    // - Optionally add ground plane and boundary walls
    // - Calculate break thresholds if autoBreak is enabled
    
    // Placeholder: For now, just log the configuration
  }

  private updatePhysics(): void {
    if (!this.world) return;

    // TODO: Update Rapier physics simulation
    // - Step the physics world
    // - Check for joint breaks if autoBreak is enabled
    // - Update Three.js mesh positions/rotations from physics bodies
    // - Handle staggered release if configured
  }

  private cleanupPhysics(): void {
    console.log('🌍 GravityEffect: Cleanup physics');
    
    // TODO: Clean up Rapier resources
    // - Remove joints
    // - Remove bodies
    // - Destroy world
    
    this.world = null;
    this.bodies.clear();
    this.joints = [];
    this.groundPlane = null;
  }
}
