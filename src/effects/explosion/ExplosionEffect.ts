// Explosion Effect - Progressive piece separation with optional rotation
import { ExplosionConfig, DEFAULT_CONFIG } from './presets';
import { ExplosionState, canPlay, canPause, canResume, canStop, canTick, isDisposed } from './state';
import { Effect } from './types';
import { ease } from '../shared/easing';
import { setControlsEnabled } from '../shared/controls';
import * as THREE from 'three';

interface PieceMeta {
  group: THREE.Group;
  minY: number;
  centroidY: number;
  id: string;
  originalPosition: THREE.Vector3;
}

export class ExplosionEffect implements Effect {
  private state: ExplosionState = ExplosionState.IDLE;
  private config: ExplosionConfig = { ...DEFAULT_CONFIG };
  private context: any = null;
  private onComplete?: () => void;
  private isRecording = false;
  
  // Cached context references
  private spheresGroup: any = null;
  private controls: any = null;
  
  // Motion state
  private startTime: number = 0;
  private pausedTime: number = 0;
  private cycleCount: number = 0; // Track loop cycles for recording
  private isInPause: boolean = false;
  private pauseStartTime: number = 0;
  
  // Piece data for explosion
  private pieceOrder: PieceMeta[] = [];
  private solutionCenter: THREE.Vector3 = new THREE.Vector3();
  
  // Saved states
  private initialControlsEnabled: boolean = true;
  private initialRotations: Map<THREE.Group, number> = new Map();

  constructor() {
    this.log('action=construct', 'state=idle');
  }

  init(ctx: any): void {
    if (isDisposed(this.state)) {
      this.log('action=init', 'state=disposed', 'note=effect is disposed, ignoring init');
      return;
    }

    this.log('action=init', `state=${this.state}`);

    if (!ctx) {
      throw new Error('ExplosionEffect: EffectContext is required');
    }

    const required = ['scene', 'spheresGroup', 'camera', 'controls', 'renderer', 'centroidWorld'];
    for (const prop of required) {
      if (!ctx[prop]) {
        throw new Error(`ExplosionEffect: Missing required context property: ${prop}`);
      }
    }

    this.spheresGroup = ctx.spheresGroup;
    this.controls = ctx.controls;
    
    console.log('🎯 ExplosionEffect: Initialized with context');
    
    // Compute piece data and solution center
    this.computePieceData();
    
    this.log('action=init', `state=${this.state}`, `note=effect initialized with ${this.pieceOrder.length} pieces`);
  }

  setConfig(cfg: object): void {
    if (isDisposed(this.state)) {
      this.log('action=set-config', 'state=disposed', 'note=effect is disposed, ignoring setConfig');
      return;
    }

    this.log('action=set-config', `state=${this.state}`, `config=${JSON.stringify(cfg)}`);
    this.config = JSON.parse(JSON.stringify(cfg));
    this.log('action=set-config', `state=${this.state}`, 'note=config updated successfully');
  }

  getConfig(): object {
    if (isDisposed(this.state)) {
      this.log('action=get-config', 'state=disposed', 'note=effect is disposed, returning default config');
      return { ...DEFAULT_CONFIG };
    }

    this.log('action=get-config', `state=${this.state}`);
    return JSON.parse(JSON.stringify(this.config));
  }

  setOnComplete(callback: () => void): void {
    this.onComplete = callback;
    this.log('action=set-on-complete', `state=${this.state}`, 'note=completion callback set');
  }

  setRecording(recording: boolean): void {
    this.isRecording = recording;
    this.log('action=set-recording', `state=${this.state}`, `recording=${recording}`);
  }

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
    this.state = ExplosionState.PLAYING;
    this.log('action=play', `state=${this.state}`, `note=transitioned from ${previousState}`);

    // Setup on first play
    if (previousState === ExplosionState.IDLE || previousState === ExplosionState.STOPPED) {
      this.setupExplosion();
    }

    // Resume from pause
    if (previousState === ExplosionState.PAUSED) {
      this.startTime = performance.now() / 1000 - this.pausedTime;
    } else {
      this.startTime = performance.now() / 1000;
      this.pausedTime = 0;
      this.cycleCount = 0;
      this.isInPause = false;
    }
  }

  private setupExplosion(): void {
    this.initialControlsEnabled = this.controls.enabled;
    
    // Save initial rotations and positions
    this.initialRotations.clear();
    for (const piece of this.pieceOrder) {
      this.initialRotations.set(piece.group, piece.group.rotation.y);
      // Original positions already saved in computePieceData
    }
    
    this.log('action=setup-explosion', `state=${this.state}`, `pieces=${this.pieceOrder.length}`);
  }

  pause(): void {
    if (isDisposed(this.state)) {
      this.log('action=pause', 'state=disposed', 'note=effect is disposed, ignoring pause');
      return;
    }

    if (!canPause(this.state)) {
      this.log('action=pause', `state=${this.state}`, 'note=cannot pause from current state');
      return;
    }

    this.pausedTime = performance.now() / 1000 - this.startTime;

    const previousState = this.state;
    this.state = ExplosionState.PAUSED;
    this.log('action=pause', `state=${this.state}`, `note=transitioned from ${previousState}`);
  }

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
    this.state = ExplosionState.PLAYING;
    this.log('action=resume', `state=${this.state}`, `note=transitioned from ${previousState}`);

    this.startTime = performance.now() / 1000 - this.pausedTime;
  }

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
    this.state = ExplosionState.STOPPED;
    this.log('action=stop', `state=${this.state}`, `note=transitioned from ${previousState}`);

    setControlsEnabled(this.controls, this.initialControlsEnabled);

    // Restore all pieces to original positions and rotations
    for (const piece of this.pieceOrder) {
      piece.group.position.copy(piece.originalPosition);
      const originalRotation = this.initialRotations.get(piece.group);
      if (originalRotation !== undefined) {
        piece.group.rotation.y = originalRotation;
      }
    }
    
    this.log('action=stop', `state=${this.state}`, 'note=restored all pieces');
  }

  tick(time: number): void {
    if (isDisposed(this.state)) {
      return;
    }

    if (!canTick(this.state)) {
      return;
    }

    let elapsed = time - this.startTime;
    const duration = this.config.durationSec;
    
    // Handle loop mode
    if (this.config.loop) {
      
      // Check if we're in between-loop pause
      if (this.isInPause) {
        const pauseElapsed = time - this.pauseStartTime;
        if (pauseElapsed >= this.config.pauseBetweenLoops) {
          // End pause, start new cycle
          this.isInPause = false;
          this.startTime = time;
          elapsed = 0;
          this.cycleCount++;
          
          // Stop after one full cycle when recording
          if (this.cycleCount >= 1 && this.isRecording) {
            this.stop();
            if (this.onComplete) {
              this.onComplete();
            }
            return;
          }
        } else {
          // Still in pause, don't update
          return;
        }
      }
      
      // Check if we completed a full cycle (0→max→0)
      if (elapsed >= duration * 2) {
        // Start pause
        this.isInPause = true;
        this.pauseStartTime = time;
        
        // Set to fully assembled state
        for (const piece of this.pieceOrder) {
          piece.group.position.copy(piece.originalPosition);
        }
        return;
      }
      
      // Determine if we're in explode (0→max) or implode (max→0) phase
      let t: number;
      
      if (elapsed < duration) {
        // Explode phase: 0 → max
        t = elapsed;
      } else {
        // Implode phase: max → 0
        t = duration - (elapsed - duration); // Count down from duration to 0
      }
      
      // Apply easing to explosion progress
      const explosionFrac = ease(t / duration, this.config.explosionEasing);
      const totalElapsed = time - this.startTime; // Total time since start for continuous rotation
      this.applyExplosion(explosionFrac, t, duration, totalElapsed);
      
    } else {
      // Non-loop mode: simple 0 → max
      const t = Math.min(elapsed, duration);
      const explosionFrac = ease(t / duration, this.config.explosionEasing);
      
      this.applyExplosion(explosionFrac, t, duration, elapsed);
      
      // Auto-stop when duration reached
      if (elapsed >= duration) {
        this.stop();
        if (this.onComplete) {
          this.onComplete();
          this.log('action=complete', `state=${this.state}`, 'note=animation completed');
        }
      }
    }
  }

  private applyExplosion(explosionFrac: number, t: number, duration: number, totalElapsed: number): void {
    const factor = explosionFrac * this.config.maxExplosionFactor;
    
    // Apply explosion to each piece
    for (const piece of this.pieceOrder) {
      // Compute piece centroid
      const bbox = new THREE.Box3().setFromObject(piece.group);
      const pieceCentroid = new THREE.Vector3();
      bbox.getCenter(pieceCentroid);
      
      // Compute explosion vector: from solution center to piece centroid
      const explosionVector = new THREE.Vector3().subVectors(pieceCentroid, this.solutionCenter);
      
      // Apply explosion: originalPosition + factor * 1.5 * explosionVector
      const offset = explosionVector.multiplyScalar(factor * 1.5);
      piece.group.position.copy(piece.originalPosition).add(offset);
    }
    
    // Apply rotation if enabled
    if (this.config.rotationEnabled) {
      // In loop mode, use totalElapsed to keep rotation continuous and accumulating
      // In non-loop mode, use t for synchronized rotation with explosion
      let rotationAngle: number;
      if (this.config.loop) {
        // Continuous rotation: totalElapsed / duration gives how many "duration" cycles have passed
        // Multiply by rotationDegrees to get total rotation
        const rotationFrac = totalElapsed / duration;
        rotationAngle = (this.config.rotationDegrees * Math.PI / 180) * rotationFrac;
      } else {
        // Synchronized rotation: use easing and clamp to duration
        const rotationFrac = ease(Math.min(t / duration, 1), this.config.rotationEasing);
        rotationAngle = (this.config.rotationDegrees * Math.PI / 180) * rotationFrac;
      }
      
      for (const piece of this.pieceOrder) {
        const originalRotation = this.initialRotations.get(piece.group) || 0;
        piece.group.rotation.y = originalRotation + rotationAngle;
      }
    }
  }

  dispose(): void {
    if (isDisposed(this.state)) {
      this.log('action=dispose', 'state=disposed', 'note=already disposed, ignoring');
      return;
    }

    const previousState = this.state;
    
    // Restore all pieces
    for (const piece of this.pieceOrder) {
      piece.group.position.copy(piece.originalPosition);
      const originalRotation = this.initialRotations.get(piece.group);
      if (originalRotation !== undefined) {
        piece.group.rotation.y = originalRotation;
      }
    }
    
    if (this.controls) {
      setControlsEnabled(this.controls, this.initialControlsEnabled);
    }
    
    this.state = ExplosionState.DISPOSED;
    
    // Clear all references
    this.context = null;
    this.spheresGroup = null;
    this.controls = null;
    this.pieceOrder = [];
    this.initialRotations.clear();

    this.log('action=dispose', `state=${this.state}`, `note=transitioned from ${previousState}`);
  }

  private computePieceData(): void {
    if (!this.spheresGroup || !this.spheresGroup.children) {
      console.warn('⚠️ ExplosionEffect: No spheresGroup children found');
      return;
    }
    
    const pieces: PieceMeta[] = [];
    const bbox = new THREE.Box3();
    
    // Compute solution bounding box
    for (const child of this.spheresGroup.children) {
      if (child instanceof THREE.Group) {
        child.updateMatrixWorld(true);
        bbox.expandByObject(child);
      }
    }
    
    bbox.getCenter(this.solutionCenter);
    console.log('💥 ExplosionEffect: Solution center:', this.solutionCenter);
    
    // Iterate through piece groups
    for (const child of this.spheresGroup.children) {
      if (child instanceof THREE.Group) {
        const pieceBbox = new THREE.Box3().setFromObject(child);
        const centroid = new THREE.Vector3();
        pieceBbox.getCenter(centroid);
        
        pieces.push({
          group: child,
          minY: pieceBbox.min.y,
          centroidY: centroid.y,
          id: child.name || child.uuid,
          originalPosition: child.position.clone()
        });
      }
    }
    
    // Sort same as reveal (for consistency)
    pieces.sort((a, b) => {
      if (Math.abs(a.minY - b.minY) > 1e-6) {
        return a.minY - b.minY;
      }
      if (Math.abs(a.centroidY - b.centroidY) > 1e-6) {
        return a.centroidY - b.centroidY;
      }
      return a.id.localeCompare(b.id);
    });
    
    this.pieceOrder = pieces;
    console.log(`📊 ExplosionEffect: Computed data for ${pieces.length} pieces`);
  }

  private log(action: string, state?: string, note?: string): void {
    const parts = [`effect=explosion`, action];
    if (state) parts.push(state);
    if (note) parts.push(note);
    
    console.log(parts.join(' '));
  }
}
