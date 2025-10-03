// Orbit Effect - Keyframe Camera Animation with Turn Table parity

import { OrbitConfig, OrbitKeyframe } from './types';
import { DEFAULT_CONFIG, validateConfig } from './presets';
import { OrbitState, canPlay, canPause, canResume, canStop, canTick, isDisposed } from './state';
import { Effect } from './types';
import * as THREE from 'three';

export class OrbitEffect implements Effect {
  private state: OrbitState = OrbitState.IDLE;
  private config: OrbitConfig = { ...DEFAULT_CONFIG };
  private context: any = null; // EffectContext - will be properly typed later
  private onComplete?: () => void; // Callback when animation completes
  
  // Cached context references (validated in init)
  private scene: any = null;
  private camera: any = null;
  private controls: any = null;
  private renderer: any = null;
  
  // Animation state
  private startTime: number = 0;
  private currentTime: number = 0;
  private originalCameraState: any = null;
  private centroid: THREE.Vector3 = new THREE.Vector3();
  
  constructor() {
    console.log('🎥 OrbitEffect: Initialized');
  }

  // Initialize with context
  async init(context: any): Promise<void> {
    this.context = context;
    
    // Validate context has required properties
    if (!context?.scene || !context?.camera || !context?.controls || !context?.renderer) {
      throw new Error('OrbitEffect: Invalid context - missing scene, camera, controls, or renderer');
    }
    
    this.scene = context.scene;
    this.camera = context.camera;
    this.controls = context.controls;
    this.renderer = context.renderer;
    
    // Calculate centroid from loaded geometry
    this.updateCentroid();
    
    this.log('action=init', `state=${this.state}`, 'note=context validated and centroid calculated');
  }

  // Clean up resources
  dispose(): void {
    if (isDisposed(this.state)) return;
    
    this.stop();
    this.state = OrbitState.DISPOSED;
    this.log('action=dispose', `state=${this.state}`, 'note=effect disposed');
  }

  // Get current configuration
  getConfig(): OrbitConfig {
    return { ...this.config };
  }

  // Set configuration
  setConfig(config: OrbitConfig): void {
    this.config = { ...config };
    this.log('action=set-config', `state=${this.state}`, `keys=${config.keys.length} duration=${config.durationSec}s`);
  }

  // Set completion callback
  setOnComplete(callback: () => void): void {
    this.onComplete = callback;
    this.log('action=set-on-complete', `state=${this.state}`, 'note=completion callback set');
  }

  // Start playback
  play(): void {
    if (!canPlay(this.state)) {
      this.log('action=play', `state=${this.state}`, 'note=cannot play from current state');
      return;
    }

    // Validate configuration
    const validation = validateConfig(this.config, this.centroid.toArray() as [number, number, number]);
    if (!validation.isValid) {
      console.error('🎥 OrbitEffect: Cannot play - invalid configuration:', validation.errors);
      return;
    }

    // Save original camera state
    this.saveOriginalCameraState();
    
    // Disable controls
    if (this.controls) {
      this.controls.enabled = false;
    }
    
    // Distribute keyframe times if needed
    this.distributeKeyframeTimes();
    
    this.state = OrbitState.PLAYING;
    this.startTime = performance.now();
    this.currentTime = 0;
    
    this.log('action=play', `state=${this.state}`, `keys=${this.config.keys.length} duration=${this.config.durationSec}s`);
  }

  // Pause playback
  pause(): void {
    if (!canPause(this.state)) {
      this.log('action=pause', `state=${this.state}`, 'note=cannot pause from current state');
      return;
    }

    this.state = OrbitState.PAUSED;
    this.log('action=pause', `state=${this.state}`, `time=${this.currentTime.toFixed(2)}s`);
  }

  // Resume playback
  resume(): void {
    if (!canResume(this.state)) {
      this.log('action=resume', `state=${this.state}`, 'note=cannot resume from current state');
      return;
    }

    this.state = OrbitState.PLAYING;
    this.startTime = performance.now() - (this.currentTime * 1000);
    this.log('action=resume', `state=${this.state}`, `time=${this.currentTime.toFixed(2)}s`);
  }

  // Stop playback
  stop(): void {
    if (!canStop(this.state)) {
      this.log('action=stop', `state=${this.state}`, 'note=cannot stop from current state');
      return;
    }

    this.state = OrbitState.IDLE;
    
    // Handle finalization
    this.handleFinalization();
    
    // Re-enable controls
    if (this.controls) {
      this.controls.enabled = true;
    }
    
    this.log('action=stop', `state=${this.state}`, `finalize=${this.config.finalize}`);
  }

  // Animation tick
  tick(deltaTime: number): void {
    if (!canTick(this.state)) return;

    // Update current time
    this.currentTime = (performance.now() - this.startTime) / 1000;
    
    // Handle seamless loop behavior
    let t = this.currentTime;
    if (this.config.loop && t >= this.config.durationSec) {
      // For seamless loop: stop after one complete sequence
      this.stop();
      // Call completion callback if set
      if (this.onComplete) {
        this.onComplete();
        this.log('action=complete', `state=${this.state}`, 'note=seamless loop completed one sequence, recording stopped');
      }
      return;
    }
    
    // Check for completion (non-loop)
    if (!this.config.loop && t >= this.config.durationSec) {
      this.stop();
      // Call completion callback if set
      if (this.onComplete) {
        this.onComplete();
        this.log('action=complete', `state=${this.state}`, 'note=animation completed, callback invoked');
      }
      return;
    }
    
    // Apply camera animation
    this.applyCameraAnimation(t);
  }

  // Jump to specific keyframe (for preview)
  jumpToKeyframe(keyIndex: number): void {
    if (keyIndex < 0 || keyIndex >= this.config.keys.length) return;
    
    const key = this.config.keys[keyIndex];
    const wasPlaying = this.state === OrbitState.PLAYING;
    
    // Pause if playing
    if (wasPlaying) {
      this.pause();
    }
    
    // Save original state if not already saved
    if (!this.originalCameraState) {
      this.saveOriginalCameraState();
    }
    
    // Disable controls temporarily
    if (this.controls) {
      this.controls.enabled = false;
    }
    
    // Animate to keyframe position (400ms ease-in-out)
    this.animateToKeyframe(key, 400);
    
    this.log('action=jump', `state=${this.state}`, `keyIndex=${keyIndex} wasPlaying=${wasPlaying}`);
  }

  // Private methods
  private log(action: string, state: string, note: string): void {
    console.log(`🎥 OrbitEffect: ${action} ${state} ${note}`);
  }

  private updateCentroid(): void {
    // Calculate centroid from scene geometry
    const box = new THREE.Box3();
    this.scene.traverse((child: any) => {
      if (child.isMesh && child.geometry) {
        child.geometry.computeBoundingBox();
        if (child.geometry.boundingBox) {
          box.expandByObject(child);
        }
      }
    });
    
    if (!box.isEmpty()) {
      box.getCenter(this.centroid);
    } else {
      this.centroid.set(0, 0, 0);
    }
    
    this.log('action=update-centroid', `state=${this.state}`, `centroid=[${this.centroid.x.toFixed(2)}, ${this.centroid.y.toFixed(2)}, ${this.centroid.z.toFixed(2)}]`);
  }

  private saveOriginalCameraState(): void {
    this.originalCameraState = {
      position: this.camera.position.clone(),
      target: this.controls?.target?.clone() || new THREE.Vector3(),
      fov: this.camera.fov
    };
  }

  private distributeKeyframeTimes(): void {
    const keys = this.config.keys;
    let needsDistribution = false;
    
    for (const key of keys) {
      if (key.t === undefined) {
        needsDistribution = true;
        break;
      }
    }
    
    if (needsDistribution) {
      for (let i = 0; i < keys.length; i++) {
        keys[i].t = (i / (keys.length - 1)) * this.config.durationSec;
      }
      this.log('action=distribute-times', `state=${this.state}`, `keys=${keys.length}`);
    }
  }

  private applyCameraAnimation(t: number): void {
    if (this.config.keys.length < 2) return;
    
    // Find current segment
    const keys = this.config.keys;
    let segmentIndex = 0;
    
    // Clamp time to animation duration to prevent overshooting
    const clampedT = Math.min(t, this.config.durationSec);
    
    // For seamless loop, create virtual segment from last keyframe to first
    const effectiveKeys = this.config.loop ? [...keys, { ...keys[0], t: this.config.durationSec }] : keys;
    
    for (let i = 0; i < effectiveKeys.length - 1; i++) {
      if (clampedT >= (effectiveKeys[i].t || 0) && clampedT <= (effectiveKeys[i + 1].t || 0)) {
        segmentIndex = i;
        break;
      }
    }
    
    // Handle edge case: if we're at or past the last keyframe
    if (clampedT >= (effectiveKeys[effectiveKeys.length - 1].t || this.config.durationSec)) {
      segmentIndex = Math.max(0, effectiveKeys.length - 2);
    }
    
    const key1 = effectiveKeys[segmentIndex];
    const key2 = effectiveKeys[segmentIndex + 1] || effectiveKeys[segmentIndex];
    
    // Calculate interpolation factor
    const t1 = key1.t || 0;
    const t2 = key2.t || this.config.durationSec;
    const factor = t2 > t1 ? Math.min((clampedT - t1) / (t2 - t1), 1.0) : 0;
    
    // Apply easing if enabled
    const easedFactor = key1.easeToNext ? this.easeInOut(factor) : factor;
    
    // Interpolate position
    const pos = this.interpolatePosition(key1, key2, easedFactor);
    this.camera.position.copy(pos);
    
    // Interpolate target
    const target = this.interpolateTarget(key1, key2, easedFactor);
    if (this.controls && this.controls.target) {
      this.controls.target.copy(target);
    }
    
    // Interpolate FOV
    const fov1 = key1.fov || this.camera.fov;
    const fov2 = key2.fov || this.camera.fov;
    this.camera.fov = fov1 + (fov2 - fov1) * easedFactor;
    this.camera.updateProjectionMatrix();
    
    // Update controls
    if (this.controls && this.controls.update) {
      this.controls.update();
    }
  }

  private interpolatePosition(key1: OrbitKeyframe, key2: OrbitKeyframe, factor: number): THREE.Vector3 {
    if (this.config.mode === 'locked') {
      return this.interpolateOrbitLocked(key1, key2, factor);
    } else {
      return this.interpolateFreePath(key1, key2, factor);
    }
  }

  private interpolateFreePath(key1: OrbitKeyframe, key2: OrbitKeyframe, factor: number): THREE.Vector3 {
    // Simple linear interpolation for now (Catmull-Rom for ≥3 keys would be more complex)
    const pos1 = new THREE.Vector3(...key1.pos);
    const pos2 = new THREE.Vector3(...key2.pos);
    return pos1.lerp(pos2, factor);
  }

  private interpolateOrbitLocked(key1: OrbitKeyframe, key2: OrbitKeyframe, factor: number): THREE.Vector3 {
    // Convert positions to spherical coordinates around centroid
    const pos1 = new THREE.Vector3(...key1.pos);
    const pos2 = new THREE.Vector3(...key2.pos);
    
    const spherical1 = new THREE.Spherical();
    const spherical2 = new THREE.Spherical();
    
    spherical1.setFromVector3(pos1.clone().sub(this.centroid));
    spherical2.setFromVector3(pos2.clone().sub(this.centroid));
    
    // Interpolate spherical coordinates
    const radius = spherical1.radius + (spherical2.radius - spherical1.radius) * factor;
    const phi = spherical1.phi + (spherical2.phi - spherical1.phi) * factor;
    
    // Handle azimuth wrapping (shortest arc)
    let theta1 = spherical1.theta;
    let theta2 = spherical2.theta;
    const diff = theta2 - theta1;
    
    if (Math.abs(diff) > Math.PI) {
      if (diff > 0) {
        theta1 += 2 * Math.PI;
      } else {
        theta2 += 2 * Math.PI;
      }
    }
    
    const theta = theta1 + (theta2 - theta1) * factor;
    
    // Convert back to Cartesian
    const result = new THREE.Vector3();
    result.setFromSpherical(new THREE.Spherical(radius, phi, theta));
    result.add(this.centroid);
    
    return result;
  }

  private interpolateTarget(key1: OrbitKeyframe, key2: OrbitKeyframe, factor: number): THREE.Vector3 {
    if (this.config.lockTargetToCentroid || this.config.mode === 'locked') {
      return this.centroid.clone();
    }
    
    if (key1.target && key2.target) {
      const target1 = new THREE.Vector3(...key1.target);
      const target2 = new THREE.Vector3(...key2.target);
      return target1.lerp(target2, factor);
    }
    
    return this.centroid.clone();
  }

  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  private animateToKeyframe(key: OrbitKeyframe, duration: number): void {
    const startPos = this.camera.position.clone();
    const startTarget = this.controls?.target?.clone() || new THREE.Vector3();
    const startFov = this.camera.fov;
    
    const endPos = new THREE.Vector3(...key.pos);
    const endTarget = this.config.lockTargetToCentroid || this.config.mode === 'locked' 
      ? this.centroid.clone() 
      : key.target ? new THREE.Vector3(...key.target) : this.centroid.clone();
    const endFov = key.fov || this.camera.fov;
    
    const startTime = performance.now();
    
    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = this.easeInOut(progress);
      
      // Interpolate position
      this.camera.position.lerpVectors(startPos, endPos, easedProgress);
      
      // Interpolate target
      if (this.controls && this.controls.target) {
        this.controls.target.lerpVectors(startTarget, endTarget, easedProgress);
      }
      
      // Interpolate FOV
      this.camera.fov = startFov + (endFov - startFov) * easedProgress;
      this.camera.updateProjectionMatrix();
      
      // Update controls
      if (this.controls && this.controls.update) {
        this.controls.update();
      }
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation complete - re-enable controls
        if (this.controls) {
          this.controls.enabled = true;
        }
        this.log('action=jump-complete', `state=${this.state}`, 'note=keyframe animation complete, controls re-enabled');
      }
    };
    
    animate();
  }

  private handleFinalization(): void {
    if (!this.originalCameraState) return;
    
    switch (this.config.finalize) {
      case 'returnToStart':
        this.camera.position.copy(this.originalCameraState.position);
        if (this.controls && this.controls.target) {
          this.controls.target.copy(this.originalCameraState.target);
        }
        this.camera.fov = this.originalCameraState.fov;
        this.camera.updateProjectionMatrix();
        break;
        
      case 'snapToPose':
        // Snap to a specific pose (could be implemented later)
        break;
        
      case 'leaveAsEnded':
      default:
        // Leave camera where animation ended - ensure stable final state
        if (this.controls && this.controls.target) {
          // Make sure target is properly set for the final position
          this.controls.target.copy(this.config.lockTargetToCentroid ? this.centroid : this.controls.target);
        }
        break;
    }
    
    // Always update controls and ensure they're in a stable state
    if (this.controls) {
      this.controls.update();
      // Force a second update to ensure stability
      setTimeout(() => {
        if (this.controls && this.controls.update) {
          this.controls.update();
        }
      }, 16); // Next frame
    }
  }
}
