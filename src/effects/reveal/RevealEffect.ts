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
    
    console.log('🔍🔍🔍 INIT: About to compute piece order, spheresGroup:', this.spheresGroup);
    console.log('🔍🔍🔍 INIT: spheresGroup.children:', this.spheresGroup?.children);
    
    // Compute piece order for reveal (deterministic like Solution Viewer)
    this.computePieceOrder();
    
    console.log('🔍🔍🔍 INIT: Finished computing, pieceOrder length:', this.pieceOrder.length);
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
    }
  }

  private setupReveal(): void {
    this.initialControlsEnabled = this.controls.enabled;
    
    // Save initial rotations from the actual mesh (not the wrapper group)
    this.initialRotations.clear();
    for (const piece of this.pieceOrder) {
      // Get rotation from the mesh (bonds should have same rotation)
      const initialRotation = piece.group.userData.pieceMesh?.rotation.y || 0;
      this.initialRotations.set(piece.group, initialRotation);
    }
    
    // Initially hide all pieces (both mesh and bonds)
    for (const piece of this.pieceOrder) {
      if (piece.group.userData.pieceMesh) {
        piece.group.userData.pieceMesh.visible = false;
      }
      if (piece.group.userData.bondGroup) {
        piece.group.userData.bondGroup.visible = false;
      }
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

    // Restore all pieces to visible with original rotations (both mesh and bonds)
    for (const piece of this.pieceOrder) {
      if (piece.group.userData.pieceMesh) {
        piece.group.userData.pieceMesh.visible = true;
      }
      if (piece.group.userData.bondGroup) {
        piece.group.userData.bondGroup.visible = true;
      }
      piece.group.visible = true;
      
      const originalRotation = this.initialRotations.get(piece.group);
      if (originalRotation !== undefined) {
        // Restore rotation to mesh and bonds
        if (piece.group.userData.pieceMesh) {
          piece.group.userData.pieceMesh.rotation.y = originalRotation;
        }
        if (piece.group.userData.bondGroup) {
          piece.group.userData.bondGroup.rotation.y = originalRotation;
        }
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

    const elapsed = time - this.startTime;
    const duration = this.config.durationSec;
    
    // Simple 0 → 1 reveal (loop removed)
    const t = Math.min(elapsed, duration);
    const revealFrac = ease(t / duration, this.config.revealEasing);
    
    this.applyReveal(revealFrac, t, duration);
    
    // Auto-stop when duration reached
    if (elapsed >= duration) {
      this.stop();
      if (this.onComplete) {
        this.onComplete();
        this.log('action=complete', `state=${this.state}`, 'note=animation completed');
      }
    }
  }

  private applyReveal(revealFrac: number, t: number, duration: number): void {
    const numPieces = this.pieceOrder.length;
    // Use Math.ceil to ensure the last piece is revealed when revealFrac approaches 1.0
    // Clamp to numPieces to avoid showing more pieces than exist
    const revealCount = Math.min(numPieces, Math.ceil(revealFrac * numPieces));
    
    // Apply visibility
    for (let i = 0; i < numPieces; i++) {
      const piece = this.pieceOrder[i];
      const shouldBeVisible = i < revealCount;
      
      // Control visibility of both mesh and bonds
      if (piece.group.userData.pieceMesh) {
        piece.group.userData.pieceMesh.visible = shouldBeVisible;
      }
      if (piece.group.userData.bondGroup) {
        piece.group.userData.bondGroup.visible = shouldBeVisible;
      }
      
      // Also set group visibility (though not strictly needed)
      piece.group.visible = shouldBeVisible;
    }
    
    // Apply rotation if enabled
    if (this.config.rotationEnabled) {
      // Synchronized rotation: use easing and clamp to duration
      const rotationFrac = ease(Math.min(t / duration, 1), this.config.rotationEasing);
      const rotationAngle = (this.config.rotationDegrees * Math.PI / 180) * rotationFrac;
      
      for (let i = 0; i < revealCount; i++) {
        const piece = this.pieceOrder[i];
        const originalRotation = this.initialRotations.get(piece.group) || 0;
        
        // Rotate both mesh and bonds if they exist
        if (piece.group.userData.pieceMesh) {
          piece.group.userData.pieceMesh.rotation.y = originalRotation + rotationAngle;
        }
        if (piece.group.userData.bondGroup) {
          piece.group.userData.bondGroup.rotation.y = originalRotation + rotationAngle;
        }
      }
    }
  }

  dispose(): void {
    if (isDisposed(this.state)) {
      this.log('action=dispose', 'state=disposed', 'note=already disposed, ignoring');
      return;
    }

    const previousState = this.state;
    
    // Restore all pieces (both mesh and bonds)
    for (const piece of this.pieceOrder) {
      if (piece.group.userData.pieceMesh) {
        piece.group.userData.pieceMesh.visible = true;
      }
      if (piece.group.userData.bondGroup) {
        piece.group.userData.bondGroup.visible = true;
      }
      piece.group.visible = true;
      
      const originalRotation = this.initialRotations.get(piece.group);
      if (originalRotation !== undefined) {
        // Restore rotation to mesh and bonds
        if (piece.group.userData.pieceMesh) {
          piece.group.userData.pieceMesh.rotation.y = originalRotation;
        }
        if (piece.group.userData.bondGroup) {
          piece.group.userData.bondGroup.rotation.y = originalRotation;
        }
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
    
    console.log('🔍🔍 RevealEffect: spheresGroup structure:', {
      childCount: this.spheresGroup.children.length,
      firstChildType: this.spheresGroup.children[0]?.type,
      firstChildName: this.spheresGroup.children[0]?.name,
      firstChildIsGroup: this.spheresGroup.children[0] instanceof THREE.Group,
      firstChildIsInstancedMesh: this.spheresGroup.children[0] instanceof THREE.InstancedMesh
    });
    
    const pieces: PieceMeta[] = [];
    
    // SOLVE PAGE MODE: Multiple InstancedMeshes (each is a piece with multiple spheres)
    const hasInstancedMeshes = this.spheresGroup.children.some((c: any) => c instanceof THREE.InstancedMesh);
    if (hasInstancedMeshes) {
      console.log('🔍🔍 SOLVE PAGE MODE: Treating each InstancedMesh as a piece (with bonds)');
      
      // Build a map of pieces and their bonds (by uid/name)
      const pieceMeshes: Map<string, THREE.InstancedMesh> = new Map();
      const bondGroups: Map<string, THREE.Group> = new Map();
      
      for (const child of this.spheresGroup.children) {
        if (child instanceof THREE.InstancedMesh) {
          const uid = child.name || child.uuid;
          pieceMeshes.set(uid, child);
        } else if (child instanceof THREE.Group && child.children.length > 0) {
          // This might be a bond group (has cylinders as children)
          const hasCylinders = child.children.some(c => c instanceof THREE.Mesh);
          if (hasCylinders) {
            // Find matching piece by checking all uids
            for (const [uid, mesh] of pieceMeshes.entries()) {
              if (!bondGroups.has(uid)) {
                bondGroups.set(uid, child);
                break;
              }
            }
          }
        }
      }
      
      console.log(`🔍🔍 Found ${pieceMeshes.size} pieces and ${bondGroups.size} bond groups`);
      
      // Create piece entries with both mesh and bonds
      for (const [uid, mesh] of pieceMeshes.entries()) {
        const bbox = new THREE.Box3().setFromObject(mesh);
        const centroid = new THREE.Vector3();
        bbox.getCenter(centroid);
        
        const bonds = bondGroups.get(uid);
        console.log(`🔍🔍 Piece: ${uid}, instances: ${mesh.count}, bonds: ${bonds ? 'YES' : 'NO'}, minY: ${bbox.min.y.toFixed(3)}`);
        
        // Create a wrapper group that includes both mesh and bonds
        const pieceGroup = new THREE.Group();
        pieceGroup.name = `piece_${uid}`;
        pieceGroup.userData.pieceMesh = mesh;
        pieceGroup.userData.bondGroup = bonds;
        
        pieces.push({
          group: pieceGroup,
          minY: bbox.min.y,
          centroidY: centroid.y,
          id: uid
        });
      }
      
      // Sort pieces
      pieces.sort((a, b) => {
        if (Math.abs(a.minY - b.minY) > 1e-6) return a.minY - b.minY;
        if (Math.abs(a.centroidY - b.centroidY) > 1e-6) return a.centroidY - b.centroidY;
        return a.id.localeCompare(b.id);
      });
      
      this.pieceOrder = pieces;
      console.log(`📊 RevealEffect: Computed ${pieces.length} pieces (from InstancedMeshes)`);
      return;
    }
    
    // Check if we have a nested structure (solution mode)
    const targetGroup = this.spheresGroup.children.length === 1 && 
                        this.spheresGroup.children[0] instanceof THREE.Group &&
                        this.spheresGroup.children[0].children.length > 0
                        ? this.spheresGroup.children[0]  // Use nested group
                        : this.spheresGroup;             // Use direct children
    
    console.log(`🔍 RevealEffect: Using ${targetGroup === this.spheresGroup ? 'direct' : 'nested'} children, count=${targetGroup.children.length}`);
    
    // DEBUG: Log first few children structure
    console.log('🔍🔍 First 3 children:', targetGroup.children.slice(0, 3).map((c: any) => ({
      type: c.type,
      name: c.name,
      childCount: c instanceof THREE.Group ? c.children.length : 0,
      hasChildren: c instanceof THREE.Group && c.children.length > 0
    })));
    
    // Iterate through piece groups (each child is a piece)
    for (const child of targetGroup.children) {
      if (child instanceof THREE.Group) {
        // Compute bounding box for this piece
        const bbox = new THREE.Box3().setFromObject(child);
        const centroid = new THREE.Vector3();
        bbox.getCenter(centroid);
        
        console.log(`🔍🔍 Piece: ${child.name}, spheres: ${child.children.length}, minY: ${bbox.min.y.toFixed(3)}`);
        
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
