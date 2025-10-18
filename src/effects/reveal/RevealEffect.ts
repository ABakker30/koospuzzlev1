// Reveal Effect - Progressive piece visibility with optional rotation
import { RevealConfig, DEFAULT_CONFIG } from './presets';
import { RevealState, canPlay, canPause, canResume, canStop, canTick, isDisposed } from './state';
import { Effect } from './types';
import { ease } from '../shared/easing';
import { setControlsEnabled } from '../shared/controls';
import * as THREE from 'three';

interface PieceMeta {
  group: THREE.Group;
  minY: number;
  centroidY: number;
  id: string;
}

export class RevealEffect implements Effect {
  private state: RevealState = RevealState.IDLE;
  private config: RevealConfig = { ...DEFAULT_CONFIG };
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
  private isInPause: boolean = false; // Track if we're in between-loop pause
  private pauseStartTime: number = 0;
  
  // Piece order for reveal
  private pieceOrder: PieceMeta[] = [];
  
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
      throw new Error('RevealEffect: EffectContext is required');
    }

    const required = ['scene', 'spheresGroup', 'camera', 'controls', 'renderer', 'centroidWorld'];
    for (const prop of required) {
      if (!ctx[prop]) {
        throw new Error(`RevealEffect: Missing required context property: ${prop}`);
      }
    }

    this.spheresGroup = ctx.spheresGroup;
    this.controls = ctx.controls;
    
    // Compute piece order for reveal (deterministic like Solution Viewer)
    this.computePieceOrder();
    
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
    this.state = RevealState.PLAYING;
    this.log('action=play', `state=${this.state}`, `note=transitioned from ${previousState}`);

    // Setup on first play
    if (previousState === RevealState.IDLE || previousState === RevealState.STOPPED) {
      this.setupReveal();
    }

    // Resume from pause
    if (previousState === RevealState.PAUSED) {
      this.startTime = performance.now() / 1000 - this.pausedTime;
    } else {
      this.startTime = performance.now() / 1000;
      this.pausedTime = 0;
      this.cycleCount = 0;
      this.isInPause = false;
    }
  }

  private setupReveal(): void {
    this.initialControlsEnabled = this.controls.enabled;
    
    // Save initial rotations
    this.initialRotations.clear();
    for (const piece of this.pieceOrder) {
      this.initialRotations.set(piece.group, piece.group.rotation.y);
    }
    
    // Initially hide all pieces
    for (const piece of this.pieceOrder) {
      piece.group.visible = false;
    }
    
    this.log('action=setup-reveal', `state=${this.state}`, `pieces=${this.pieceOrder.length}`);
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
    this.state = RevealState.PAUSED;
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
    this.state = RevealState.PLAYING;
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
    this.state = RevealState.STOPPED;
    this.log('action=stop', `state=${this.state}`, `note=transitioned from ${previousState}`);

    setControlsEnabled(this.controls, this.initialControlsEnabled);

    // Restore all pieces to visible with original rotations
    for (const piece of this.pieceOrder) {
      piece.group.visible = true;
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
      
      // Check if we completed a full cycle (0→1→0)
      if (elapsed >= duration * 2) {
        // Start pause
        this.isInPause = true;
        this.pauseStartTime = time;
        
        // Set to fully hidden state
        for (const piece of this.pieceOrder) {
          piece.group.visible = false;
        }
        return;
      }
      
      // Determine if we're in forward (0→1) or backward (1→0) phase
      let t: number;
      
      if (elapsed < duration) {
        // Forward phase: 0 → 1
        t = elapsed;
      } else {
        // Backward phase: 1 → 0
        t = duration - (elapsed - duration); // Count down from duration to 0
      }
      
      // Apply easing to reveal progress
      const revealFrac = ease(t / duration, this.config.revealEasing);
      const totalElapsed = time - this.startTime; // Total time since start for continuous rotation
      this.applyReveal(revealFrac, t, duration, totalElapsed);
      
    } else {
      // Non-loop mode: simple 0 → 1
      const t = Math.min(elapsed, duration);
      const revealFrac = ease(t / duration, this.config.revealEasing);
      
      this.applyReveal(revealFrac, t, duration, elapsed);
      
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

  private applyReveal(revealFrac: number, t: number, duration: number, totalElapsed: number): void {
    const numPieces = this.pieceOrder.length;
    // Use Math.ceil to ensure the last piece is revealed when revealFrac approaches 1.0
    // Clamp to numPieces to avoid showing more pieces than exist
    const revealCount = Math.min(numPieces, Math.ceil(revealFrac * numPieces));
    
    // Apply visibility
    for (let i = 0; i < numPieces; i++) {
      const piece = this.pieceOrder[i];
      piece.group.visible = i < revealCount;
    }
    
    // Apply rotation if enabled
    if (this.config.rotationEnabled) {
      // In loop mode, use totalElapsed to keep rotation continuous and accumulating
      // In non-loop mode, use t for synchronized rotation with reveal
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
      
      for (let i = 0; i < revealCount; i++) {
        const piece = this.pieceOrder[i];
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
      piece.group.visible = true;
      const originalRotation = this.initialRotations.get(piece.group);
      if (originalRotation !== undefined) {
        piece.group.rotation.y = originalRotation;
      }
    }
    
    if (this.controls) {
      setControlsEnabled(this.controls, this.initialControlsEnabled);
    }
    
    this.state = RevealState.DISPOSED;
    
    // Clear all references
    this.context = null;
    this.spheresGroup = null;
    this.controls = null;
    this.pieceOrder = [];
    this.initialRotations.clear();

    this.log('action=dispose', `state=${this.state}`, `note=transitioned from ${previousState}`);
  }

  private convertInstancedMeshToGroups(instancedMesh: THREE.InstancedMesh): void {
    console.log(`🔄 RevealEffect: Converting InstancedMesh with ${instancedMesh.count} instances to individual groups`);
    
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    
    // Remove the instanced mesh from parent
    const parent = instancedMesh.parent;
    if (!parent) {
      console.warn('⚠️ RevealEffect: InstancedMesh has no parent');
      return;
    }
    
    parent.remove(instancedMesh);
    
    // Create individual mesh for each instance
    for (let i = 0; i < instancedMesh.count; i++) {
      instancedMesh.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      
      // Create a group to hold this single sphere (matches solution piece structure)
      const pieceGroup = new THREE.Group();
      pieceGroup.name = `cell_${i}`;
      
      // Create individual mesh
      const mesh = new THREE.Mesh(
        instancedMesh.geometry.clone(),
        instancedMesh.material
      );
      
      // Apply the instance transform
      mesh.position.copy(position);
      mesh.scale.setFromMatrixScale(matrix);
      mesh.quaternion.setFromRotationMatrix(matrix);
      
      pieceGroup.add(mesh);
      parent.add(pieceGroup);
    }
    
    console.log(`✅ RevealEffect: Created ${instancedMesh.count} individual piece groups`);
    
    // Dispose the original instanced mesh
    instancedMesh.geometry.dispose();
    
    // Recompute piece order with new structure
    this.computePieceOrder();
  }

  private computePieceOrder(): void {
    if (!this.spheresGroup || !this.spheresGroup.children) {
      console.warn('⚠️ RevealEffect: No spheresGroup children found');
      return;
    }
    
    const pieces: PieceMeta[] = [];
    
    // Check if first child is an InstancedMesh (shape mode)
    const firstChild = this.spheresGroup.children[0];
    if (firstChild instanceof THREE.InstancedMesh) {
      console.log('🔍 RevealEffect: Detected InstancedMesh (shape mode), converting to individual meshes');
      this.convertInstancedMeshToGroups(firstChild);
      return; // computePieceOrder will be called again after conversion
    }
    
    // Check if we have a nested structure (solution mode)
    const targetGroup = this.spheresGroup.children.length === 1 && 
                        this.spheresGroup.children[0] instanceof THREE.Group &&
                        this.spheresGroup.children[0].children.length > 0
                        ? this.spheresGroup.children[0]  // Use nested group
                        : this.spheresGroup;             // Use direct children
    
    console.log(`🔍 RevealEffect: Using ${targetGroup === this.spheresGroup ? 'direct' : 'nested'} children, count=${targetGroup.children.length}`);
    
    // Iterate through piece groups (each child is a piece)
    for (const child of targetGroup.children) {
      if (child instanceof THREE.Group) {
        // Compute bounding box for this piece
        const bbox = new THREE.Box3().setFromObject(child);
        const centroid = new THREE.Vector3();
        bbox.getCenter(centroid);
        
        pieces.push({
          group: child,
          minY: bbox.min.y,
          centroidY: centroid.y,
          id: child.name || child.uuid
        });
      }
    }
    
    // Sort by minY (lowest first), then centroidY, then ID (same as Solution Viewer)
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
    console.log(`📊 RevealEffect: Computed order for ${pieces.length} pieces`);
  }

  private log(action: string, state?: string, note?: string): void {
    const parts = [`effect=reveal`, action];
    if (state) parts.push(state);
    if (note) parts.push(note);
    
    console.log(parts.join(' '));
  }
}
