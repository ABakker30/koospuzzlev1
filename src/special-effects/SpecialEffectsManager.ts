import type { 
  EffectInstance, 
  EffectState, 
  EffectCtx, 
  PlayControls, 
  CaptureOptions,
  EffectTelemetry,
  EffectSaveData,
  EffectId
} from './_shared/types';
import { startRAF, stopRAF, isRAFRunning } from './_shared/clock';
import { captureService } from './_shared/capture.service';

/**
 * Central manager for special effects
 * Handles state machine, playback control, and recording
 */
export class SpecialEffectsManager implements PlayControls {
  private activeEffect: EffectInstance | null = null;
  private state: EffectState = 'idle';
  private tGlobal: number = 0; // Global time in seconds
  private loop: boolean = false;
  private ctx: EffectCtx | null = null;
  private telemetry: EffectTelemetry = {};

  // Event callbacks
  private onStateChange?: (state: EffectState) => void;
  private onTimeUpdate?: (time: number, duration?: number) => void;

  constructor() {
    console.log('🎬 SpecialEffectsManager initialized');
  }

  /**
   * Set the 3D context for effects
   */
  setContext(ctx: EffectCtx): void {
    this.ctx = ctx;
    console.log('🎬 Effect context set');
  }

  /**
   * Select and enable an effect
   */
  selectEffect(effect: EffectInstance): void {
    // Stop current effect if running
    if (this.state !== 'idle') {
      this.stop();
    }

    this.activeEffect = effect;
    console.log(`🎬 Effect selected: ${effect.name}`);

    // Enable effect if context is available
    if (this.ctx) {
      const startTime = performance.now();
      effect.onEnable(this.ctx);
      this.telemetry.buildCacheMs = performance.now() - startTime;
      console.log(`🎬 Effect enabled in ${this.telemetry.buildCacheMs.toFixed(1)}ms`);
    }

    this.notifyStateChange();
  }

  /**
   * Get currently active effect
   */
  getActiveEffect(): EffectInstance | null {
    return this.activeEffect;
  }

  /**
   * Get current state
   */
  getState(): EffectState {
    return this.state;
  }

  /**
   * Get current time
   */
  getCurrentTime(): number {
    return this.tGlobal;
  }

  /**
   * Set loop mode
   */
  setLoop(loop: boolean): void {
    this.loop = loop;
    console.log(`🎬 Loop mode: ${loop ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if loop is enabled
   */
  isLooping(): boolean {
    return this.loop;
  }

  /**
   * Play the active effect
   */
  play(): void {
    if (!this.activeEffect) {
      console.warn('🎬 No active effect to play');
      return;
    }

    if (!this.activeEffect.canPlay()) {
      console.warn('🎬 Effect cannot play (check configuration)');
      return;
    }

    if (!this.ctx) {
      console.warn('🎬 No context set for playback');
      return;
    }

    if (this.state === 'playing') {
      console.log('🎬 Already playing');
      return;
    }

    console.log('🎬 Starting playback');
    this.state = 'playing';
    this.telemetry.startTime = performance.now();
    this.telemetry.framesRendered = 0;

    // Start RAF loop
    startRAF((dt) => this.tick(dt));
    
    this.notifyStateChange();
  }

  /**
   * Pause the active effect
   */
  pause(): void {
    if (this.state !== 'playing') {
      console.log('🎬 Not playing, cannot pause');
      return;
    }

    console.log('🎬 Pausing playback');
    this.state = 'paused';
    stopRAF();

    if (this.activeEffect?.onPause && this.ctx) {
      this.activeEffect.onPause(this.ctx);
    }

    this.notifyStateChange();
  }

  /**
   * Stop the active effect and reset time
   */
  stop(): void {
    if (this.state === 'idle') {
      console.log('🎬 Already stopped');
      return;
    }

    console.log('🎬 Stopping playback');
    const wasRecording = this.state === 'recording';
    
    this.state = 'idle';
    this.tGlobal = 0;
    stopRAF();

    if (this.activeEffect && this.ctx) {
      this.activeEffect.onStop(this.ctx);
    }

    // Stop recording if active
    if (wasRecording) {
      captureService.stopRecording();
    }

    // Log telemetry
    if (this.telemetry.startTime) {
      this.telemetry.endTime = performance.now();
      const durationMs = this.telemetry.endTime - this.telemetry.startTime;
      console.log(`🎬 Playback stats: ${durationMs.toFixed(1)}ms, ${this.telemetry.framesRendered} frames`);
    }

    this.notifyStateChange();
  }

  /**
   * Record the active effect
   */
  async record(opts: CaptureOptions): Promise<void> {
    if (!this.activeEffect) {
      throw new Error('No active effect to record');
    }

    if (!this.activeEffect.canPlay()) {
      throw new Error('Effect cannot play (check configuration)');
    }

    if (!this.ctx) {
      throw new Error('No context set for recording');
    }

    if (this.state !== 'idle') {
      console.log('🎬 Stopping current playback for recording');
      this.stop();
    }

    console.log('🎬 Starting recording:', opts);
    this.state = 'recording';
    this.tGlobal = 0;
    this.telemetry.startTime = performance.now();
    this.telemetry.framesRendered = 0;

    try {
      // Get canvas from renderer
      const canvas = this.ctx.renderer.domElement;
      
      // Set canvas size to recording resolution
      const originalSize = { 
        width: canvas.width, 
        height: canvas.height 
      };
      
      this.ctx.renderer.setSize(opts.width, opts.height);
      
      // Start recording based on mode
      let recordingPromise: Promise<Blob>;
      
      if (opts.mode === 'realtime') {
        recordingPromise = captureService.recordRealtime(canvas, opts);
        
        // Start RAF for realtime recording
        startRAF((dt) => this.tick(dt));
        
        // Auto-stop after duration if specified
        const duration = opts.durationSec || this.activeEffect.getDurationSec();
        if (duration) {
          setTimeout(() => {
            if (this.state === 'recording') {
              this.stop();
            }
          }, duration * 1000);
        }
      } else {
        // Offline recording (not implemented in v1)
        recordingPromise = captureService.recordOffline(
          this.ctx.renderer,
          this.ctx.scene,
          this.ctx.camera,
          this.activeEffect,
          opts
        );
      }

      this.notifyStateChange();

      // Wait for recording to complete
      const blob = await recordingPromise;
      
      // Restore original canvas size
      this.ctx.renderer.setSize(originalSize.width, originalSize.height);
      
      // Generate filenames
      const videoFilename = captureService.generateFilename(this.activeEffect.name, opts);
      const sidecarFilename = captureService.generateSidecarFilename(this.activeEffect.name);
      
      // Download video file
      captureService.downloadBlob(blob, videoFilename);
      
      // Create and download sidecar JSON
      const sidecarData: EffectSaveData = {
        effectId: this.activeEffect.id,
        config: this.activeEffect.getConfig(),
        timestamp: new Date().toISOString(),
        telemetry: this.telemetry
      };
      
      const sidecarBlob = new Blob([JSON.stringify(sidecarData, null, 2)], { 
        type: 'application/json' 
      });
      captureService.downloadBlob(sidecarBlob, sidecarFilename);
      
      console.log('🎬 Recording completed successfully');
      
    } catch (error) {
      console.error('🎬 Recording failed:', error);
      this.stop();
      throw error;
    }
  }

  /**
   * Set state change callback
   */
  onStateChanged(callback: (state: EffectState) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Set time update callback
   */
  onTimeChanged(callback: (time: number, duration?: number) => void): void {
    this.onTimeUpdate = callback;
  }

  /**
   * Main tick function called by RAF
   */
  private tick(dt: number): void {
    if (!this.activeEffect || !this.ctx || this.state === 'idle' || this.state === 'paused') {
      return;
    }

    // Update global time
    this.tGlobal += dt;
    this.telemetry.framesRendered = (this.telemetry.framesRendered || 0) + 1;

    // Check for end of animation
    const duration = this.activeEffect.getDurationSec();
    if (duration && this.tGlobal >= duration) {
      if (this.loop) {
        // Reset time for loop
        this.tGlobal = 0;
        console.log('🎬 Looping animation');
      } else {
        // Stop at end
        console.log('🎬 Animation completed');
        this.stop();
        return;
      }
    }

    // Update effect
    try {
      this.activeEffect.onUpdate(dt, this.tGlobal, this.ctx);
      this.ctx.setNeedsRedraw();
      
      // Notify time update
      if (this.onTimeUpdate) {
        this.onTimeUpdate(this.tGlobal, duration);
      }
    } catch (error) {
      console.error('🎬 Error in effect update:', error);
      this.stop();
    }
  }

  /**
   * Notify state change
   */
  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange(this.state);
    }
  }

  /**
   * Save effect config to localStorage
   */
  saveEffectConfig(effectId: EffectId, config: unknown): void {
    try {
      const key = `specialEffects_${effectId}_config`;
      localStorage.setItem(key, JSON.stringify(config));
      console.log(`💾 Saved ${effectId} config to localStorage`);
    } catch (error) {
      console.error(`💾 Failed to save ${effectId} config:`, error);
    }
  }

  /**
   * Load effect config from localStorage
   */
  loadEffectConfig(effectId: EffectId): unknown | null {
    try {
      const key = `specialEffects_${effectId}_config`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const config = JSON.parse(stored);
        console.log(`💾 Loaded ${effectId} config from localStorage`);
        return config;
      }
    } catch (error) {
      console.error(`💾 Failed to load ${effectId} config:`, error);
    }
    return null;
  }

  /**
   * Save active effect ID to localStorage
   */
  saveActiveEffectId(): void {
    if (this.activeEffect) {
      try {
        localStorage.setItem('specialEffects_activeEffect', this.activeEffect.id);
        console.log(`💾 Saved active effect: ${this.activeEffect.id}`);
      } catch (error) {
        console.error('💾 Failed to save active effect:', error);
      }
    }
  }

  /**
   * Load active effect ID from localStorage
   */
  loadActiveEffectId(): EffectId | null {
    try {
      const stored = localStorage.getItem('specialEffects_activeEffect');
      if (stored) {
        console.log(`💾 Loaded active effect: ${stored}`);
        return stored as EffectId;
      }
    } catch (error) {
      console.error('💾 Failed to load active effect:', error);
    }
    return null;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    this.activeEffect = null;
    this.ctx = null;
    console.log('🎬 SpecialEffectsManager disposed');
  }
}

// Singleton instance
export const specialEffectsManager = new SpecialEffectsManager();
