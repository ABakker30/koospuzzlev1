// Turn Table Effect - complete implementation with motion
import { TurnTableConfig, DEFAULT_CONFIG, validateConfig } from './presets';
import { TurnTableState, canPlay, canPause, canResume, canStop, canTick, isDisposed } from './state';
import { Effect } from './types';
import { ease, angleAt } from '../shared/easing';
import { createPivotAtCentroid, setCameraOnOrbit } from '../shared/pivot';
import { setControlsEnabled } from '../shared/controls';
import { finalizeTurntable } from '../shared/finalization';
import * as THREE from 'three';

export class TurnTableEffect implements Effect {
  private state: TurnTableState = TurnTableState.IDLE;
  private config: TurnTableConfig = { ...DEFAULT_CONFIG };
  private context: any = null; // EffectContext - will be properly typed later
  private onComplete?: () => void; // Callback when animation completes
  
  // Cached context references (validated in init)
  private scene: any = null;
  private spheresGroup: any = null;
  private camera: any = null;
  private controls: any = null;
  private renderer: any = null;
  private centroidWorld: any = null;
  
  // Motion state
  private pivot: THREE.Object3D | null = null;
  private originalParent: THREE.Object3D | null = null;
  private startTime: number = 0;
  private pausedTime: number = 0;
  private totalAngleRad: number = 0;
  
  // Saved states for finalization
  private initialCameraMatrix: THREE.Matrix4 | null = null;
  private initialSphereMatrix: THREE.Matrix4 | null = null;
  private initialControlsEnabled: boolean = true;
  private cameraRadius: number = 0;
  private cameraElevation: number = 0;
  private initialAngle: number = 0;

  constructor() {
    this.log('action=construct', 'state=idle');
  }

  // Initialize with effect context
  init(ctx: any): void {
    if (isDisposed(this.state)) {
      this.log('action=init', 'state=disposed', 'note=effect is disposed, ignoring init');
      return;
    }

    this.log('action=init', `state=${this.state}`);

    // Validate required context properties
    if (!ctx) {
      throw new Error('TurnTableEffect: EffectContext is required');
    }

    const required = ['scene', 'spheresGroup', 'camera', 'controls', 'renderer', 'centroidWorld'];
    for (const prop of required) {
      if (!ctx[prop]) {
        throw new Error(`TurnTableEffect: Missing required context property: ${prop}`);
      }
    }

    // Cache context references
    this.scene = ctx.scene;
    this.spheresGroup = ctx.spheresGroup;
    this.camera = ctx.camera;
    this.controls = ctx.controls;
    this.renderer = ctx.renderer;
    this.centroidWorld = ctx.centroidWorld;
    
    console.log('🎯 TurnTableEffect: Initialized with REAL objects:', {
      scene: !!this.scene,
      camera: !!this.camera,
      controls: !!this.controls,
      spheresGroup: !!this.spheresGroup,
      centroidWorld: this.centroidWorld
    });
    
    this.log('action=init', `state=${this.state}`, 'note=effect initialized with context');
  }

  // Set configuration with validation
  setConfig(cfg: object): void {
    if (isDisposed(this.state)) {
      this.log('action=set-config', 'state=disposed', 'note=effect is disposed, ignoring setConfig');
      return;
    }

    this.log('action=set-config', `state=${this.state}`, `config=${JSON.stringify(cfg)}`);

    // Validate configuration
    const validation = validateConfig(cfg as Partial<TurnTableConfig>);
    if (!validation.isValid) {
      const errorMsg = `Invalid configuration: ${Object.entries(validation.errors).map(([k, v]) => `${k}: ${v}`).join(', ')}`;
      this.log('action=set-config', `state=${this.state}`, `note=validation failed: ${errorMsg}`);
      throw new Error(`TurnTableEffect: ${errorMsg}`);
    }

    // Deep copy to prevent external mutations
    this.config = JSON.parse(JSON.stringify(cfg));
    this.log('action=set-config', `state=${this.state}`, 'note=config updated successfully');
  }

  // Get configuration (deep copy)
  getConfig(): object {
    if (isDisposed(this.state)) {
      this.log('action=get-config', 'state=disposed', 'note=effect is disposed, returning default config');
      return { ...DEFAULT_CONFIG };
    }

    this.log('action=get-config', `state=${this.state}`);
    
    // Return deep copy to prevent external mutations
    return JSON.parse(JSON.stringify(this.config));
  }

  // Set completion callback
  setOnComplete(callback: () => void): void {
    this.onComplete = callback;
    this.log('action=set-on-complete', `state=${this.state}`, 'note=completion callback set');
  }

  // Start playback
  play(): void {
    if (isDisposed(this.state)) {
      this.log('action=play', 'state=disposed', 'note=effect is disposed, ignoring play');
      return;
    }

    if (!canPlay(this.state)) {
      this.log('action=play', `state=${this.state}`, 'note=cannot play from current state');
      return;
    }

    const previousState = this.state;
    this.state = TurnTableState.PLAYING;
    this.log('action=play', `state=${this.state}`, `note=transitioned from ${previousState}`);

    // Setup motion on first play
    if (previousState === TurnTableState.IDLE || previousState === TurnTableState.STOPPED) {
      this.setupMotion();
    }

    // Resume from pause
    if (previousState === TurnTableState.PAUSED) {
      this.startTime = performance.now() / 1000 - this.pausedTime;
    } else {
      this.startTime = performance.now() / 1000;
      this.pausedTime = 0;
    }

    // Disable controls in camera mode (unless preserveControls flag is set for gallery playback)
    if (this.config.mode === 'camera' && !this.config.preserveControls) {
      setControlsEnabled(this.controls, false);
      console.log('🔒 Controls disabled in play() (preserveControls:', this.config.preserveControls, ')');
    } else if (this.config.mode === 'camera') {
      // For gallery playback, ensure controls are fully enabled
      if (this.controls) {
        this.controls.enabled = true;
        this.controls.enableRotate = true;
        this.controls.enableZoom = true;
        this.controls.enablePan = true;
      }
      console.log('✅ Controls fully enabled for gallery playback (preserveControls:', this.config.preserveControls, ')');
    }
  }

  // Setup motion state and pivot
  private setupMotion(): void {
    // Calculate total angle in radians
    const direction = this.config.direction === 'cw' ? -1 : 1;
    this.totalAngleRad = (this.config.degrees * Math.PI / 180) * direction;
    
    // Save initial states for finalization
    this.initialCameraMatrix = this.camera.matrix.clone();
    this.initialSphereMatrix = this.spheresGroup.matrix.clone();
    this.initialControlsEnabled = this.controls.enabled;
    
    // Create pivot at centroid (keep on XZ plane for object mode to prevent Y jump)
    const keepOnXZPlane = this.config.mode === 'object';
    this.pivot = createPivotAtCentroid(this.centroidWorld, keepOnXZPlane);
    this.scene.add(this.pivot);
    
    if (this.config.mode === 'object') {
      // Object mode: reparent sculpture under pivot
      this.originalParent = this.spheresGroup.parent;
      this.originalParent?.remove(this.spheresGroup);
      this.pivot.add(this.spheresGroup);
    } else {
      // Camera mode: calculate orbit parameters from user's current camera position
      const cameraPos = this.camera.position.clone();
      const centroid = this.centroidWorld.clone();
      const toCamera = cameraPos.sub(centroid);
      
      this.cameraRadius = toCamera.length();
      this.cameraElevation = Math.asin(toCamera.y / this.cameraRadius);
      this.initialAngle = Math.atan2(toCamera.z, toCamera.x);
      
      // Don't change camera orientation - user's view will be preserved during orbit
    }
    
    this.log('action=setup-motion', `state=${this.state}`, `mode=${this.config.mode} totalAngle=${this.totalAngleRad.toFixed(3)}rad`);
  }

  // Pause playback
  pause(): void {
    if (isDisposed(this.state)) {
      this.log('action=pause', 'state=disposed', 'note=effect is disposed, ignoring pause');
      return;
    }

    if (!canPause(this.state)) {
      this.log('action=pause', `state=${this.state}`, 'note=cannot pause from current state');
      return;
    }

    // Store paused time
    this.pausedTime = performance.now() / 1000 - this.startTime;
    
    // Store current camera position to preserve it during pause
    if (this.config.mode === 'camera') {
      console.log('🎯 PAUSE: Storing camera position:', this.camera.position.clone());
    }

    const previousState = this.state;
    this.state = TurnTableState.PAUSED;
    this.log('action=pause', `state=${this.state}`, `note=transitioned from ${previousState}`);

    // Keep controls disabled during pause to maintain camera position
    // Controls will be re-enabled when effect stops or is disposed
  }

  // Resume playback
  resume(): void {
    if (isDisposed(this.state)) {
      this.log('action=resume', 'state=disposed', 'note=effect is disposed, ignoring resume');
      return;
    }

    if (!canResume(this.state)) {
      this.log('action=resume', `state=${this.state}`, 'note=cannot resume from current state');
      return;
    }

    const previousState = this.state;
    this.state = TurnTableState.PLAYING;
    this.log('action=resume', `state=${this.state}`, `note=transitioned from ${previousState}`);

    // Resume timing from where we paused
    this.startTime = performance.now() / 1000 - this.pausedTime;

    // Disable controls in camera mode (unless preserveControls flag is set for gallery playback)
    if (this.config.mode === 'camera' && !this.config.preserveControls) {
      setControlsEnabled(this.controls, false);
      console.log('🔒 Controls disabled in resume() (preserveControls:', this.config.preserveControls, ')');
    } else if (this.config.mode === 'camera') {
      // For gallery playback, ensure controls are fully enabled
      if (this.controls) {
        this.controls.enabled = true;
        this.controls.enableRotate = true;
        this.controls.enableZoom = true;
        this.controls.enablePan = true;
      }
      console.log('✅ Controls fully enabled for gallery playback (preserveControls:', this.config.preserveControls, ')');
    }
  }

  // Stop playback
  stop(): void {
    if (isDisposed(this.state)) {
      this.log('action=stop', 'state=disposed', 'note=effect is disposed, ignoring stop');
      return;
    }

    if (!canStop(this.state)) {
      this.log('action=stop', `state=${this.state}`, 'note=cannot stop from current state');
      return;
    }

    const previousState = this.state;
    this.state = TurnTableState.STOPPED;
    this.log('action=stop', `state=${this.state}`, `note=transitioned from ${previousState}`);

    // Always re-enable controls
    setControlsEnabled(this.controls, this.initialControlsEnabled);

    // Apply finalization policy
    this.applyFinalization();
    
    this.log('action=stop', `state=${this.state}`, `note=finalization policy applied: ${this.config.finalize}`);
  }

  // Main animation tick
  tick(time: number): void {
    if (isDisposed(this.state)) {
      return;
    }

    if (!canTick(this.state)) {
      return;
    }

    // Calculate elapsed time
    const elapsed = time - this.startTime;
    const duration = this.config.durationSec;
    
    // Clamp time to duration
    const t = Math.min(elapsed, duration);
    
    // Calculate angle using easing
    const angle = angleAt(t, duration, this.totalAngleRad, this.config.easing);
    
    // Apply motion based on mode
    if (this.config.mode === 'object' && this.pivot) {
      // Object mode: rotate pivot (puzzle rotates, camera stays under user control)
      this.pivot.rotation.y = angle;
    } else if (this.config.mode === 'camera') {
      // Camera mode: orbit camera position around centroid
      // The camera orientation stays fixed (no forced lookAt)
      const currentAngle = this.initialAngle + angle;
      setCameraOnOrbit(this.camera, this.centroidWorld, this.cameraRadius, currentAngle, this.cameraElevation);
    }

    // Auto-stop when duration reached
    if (elapsed >= duration) {
      this.stop();
      // Call completion callback if set
      if (this.onComplete) {
        this.onComplete();
        this.log('action=complete', `state=${this.state}`, 'note=animation completed, callback invoked');
      }
    }

    // Debug logging only (to avoid noise)
    // Only log occasionally to avoid spam
    if (Math.floor(time * 10) % 30 === 0) { // Every ~3 seconds at 10fps
      this.log('action=tick', `state=${this.state}`, `time=${t.toFixed(3)}s angle=${angle.toFixed(3)}rad`);
    }
  }

  // Apply finalization policy
  private applyFinalization(): void {
    const restoreStart = () => {
      if (this.initialCameraMatrix) {
        this.camera.matrix.copy(this.initialCameraMatrix);
        this.camera.matrix.decompose(this.camera.position, this.camera.quaternion, this.camera.scale);
      }
      if (this.initialSphereMatrix) {
        this.spheresGroup.matrix.copy(this.initialSphereMatrix);
        this.spheresGroup.matrix.decompose(this.spheresGroup.position, this.spheresGroup.quaternion, this.spheresGroup.scale);
      }
    };

    const snapToHero = () => {
      // For now, same as returnToStart - could be enhanced with specific hero poses
      restoreStart();
    };

    finalizeTurntable(this.config.finalize, restoreStart, snapToHero);
  }

  // Clean up and dispose
  dispose(): void {
    if (isDisposed(this.state)) {
      this.log('action=dispose', 'state=disposed', 'note=already disposed, ignoring');
      return;
    }

    const previousState = this.state;
    
    // Clean up motion state
    this.cleanupMotion();
    
    // Always restore controls
    if (this.controls) {
      setControlsEnabled(this.controls, this.initialControlsEnabled);
    }
    
    this.state = TurnTableState.DISPOSED;
    
    // Clear all references
    this.context = null;
    this.scene = null;
    this.spheresGroup = null;
    this.camera = null;
    this.controls = null;
    this.renderer = null;
    this.centroidWorld = null;
    this.pivot = null;
    this.originalParent = null;
    this.initialCameraMatrix = null;
    this.initialSphereMatrix = null;

    this.log('action=dispose', `state=${this.state}`, `note=transitioned from ${previousState}, references cleared`);
  }

  // Clean up motion state
  private cleanupMotion(): void {
    // Restore original parenting if we changed it
    if (this.originalParent && this.spheresGroup && this.pivot) {
      this.pivot.remove(this.spheresGroup);
      this.originalParent.add(this.spheresGroup);
    }

    // Remove pivot from scene
    if (this.pivot && this.scene) {
      this.scene.remove(this.pivot);
    }
  }

  // Structured logging helper
  private log(action: string, state?: string, note?: string): void {
    const parts = [`effect=turntable`, action];
    if (state) parts.push(state);
    if (note) parts.push(note);
    
    console.log(parts.join(' '));
  }
}
