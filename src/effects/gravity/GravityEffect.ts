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
  INITIAL_PAUSE = 'INITIAL_PAUSE',
  EXPLOSION = 'EXPLOSION',
  FALL = 'FALL',
  PAUSE = 'PAUSE',
  REVERSE = 'REVERSE',
  FINAL_BLEND = 'FINAL_BLEND',
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
  private bondMeshes: THREE.Mesh[] = [];
  private recordedFrames: Map<string, THREE.Matrix4>[] = [];
  private originalPositions: Map<string, THREE.Matrix4> | null = null; // True original before physics
  private reverseProgress = 0;
  private pauseTimer = 0;
  private loopCount = 0; // Track number of completed loops
  private phase: PlaybackPhase = PlaybackPhase.INITIAL_PAUSE;
  private rafId: number | null = null;
  private initializing = false;
  private blendProgress = 0;
  private blendStartPositions: Map<string, THREE.Matrix4> | null = null;
  
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
      // Build instancedMap first
      this.buildInstancedMap();
      
      await this.initializePhysics();
      
      // After physics init, check if physics manager built an instancedMap (for compound bodies)
      if (this.physicsManager && (this.physicsManager as any).getInstancedMap) {
        const physicsMap = (this.physicsManager as any).getInstancedMap();
        if (physicsMap && physicsMap.size > 0) {
          console.log(`📥 Using instancedMap from physics manager: ${physicsMap.size} entries`);
          // IMPORTANT: Copy the map, don't just reference it (it gets cleared on physics cleanup)
          this.instancedMap.clear();
          physicsMap.forEach((value: any, key: string) => {
            this.instancedMap.set(key, value);
          });
          console.log(`📋 Copied instancedMap: ${this.instancedMap.size} entries (independent copy)`);
        }
      }
      
      // Get bond meshes for recording
      if (this.physicsManager && (this.physicsManager as any).getBondMeshes) {
        const bonds = (this.physicsManager as any).getBondMeshes();
        this.bondMeshes = bonds.map((b: any) => b.mesh);
        console.log(`🔗 Got ${this.bondMeshes.length} bond meshes for recording`);
      }
      
      // CRITICAL: Capture original positions BEFORE any physics step
      // This must happen AFTER we get instancedMap but BEFORE first physics tick
      // Store the scene positions before jitter affects the visuals
      if (this.physicsManager && (this.physicsManager as any).capturePreJitterPositions) {
        this.originalPositions = (this.physicsManager as any).capturePreJitterPositions();
        console.log(`📸 Using pre-jitter positions from physics manager: ${this.originalPositions?.size || 0} entries`);
      } else {
        // Fallback: capture current positions
        this.captureOriginalPositions();
      }
      
      if (this.state === GravityState.DISPOSED) return;
      
      this.state = GravityState.PLAYING;
      const now = performance.now();
      this.startTime = now;
      this.lastTickTime = now;
      this.elapsedTime = 0;
      this.loopCount = 0; // Reset loop counter
      
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
      case PlaybackPhase.INITIAL_PAUSE:
        // Pause at the start before falling (same duration as loop pause)
        this.pauseTimer += deltaTime;
        const initialPauseDuration = (this.config.loop?.pauseMs ?? 1000) / 1000;
        
        if (this.pauseTimer >= initialPauseDuration) {
          console.log(`⏸️ Initial pause complete`);
          this.pauseTimer = 0;
          
          // Check if explosion is enabled
          if (this.config.explosion?.enabled) {
            console.log(`💥 Starting mini explosion (strength: ${this.config.explosion.strength ?? 20})`);
            this.applyExplosion();
            this.phase = PlaybackPhase.EXPLOSION;
          } else {
            console.log(`🎬 Starting fall`);
            this.phase = PlaybackPhase.FALL;
          }
          
          this.startTime = performance.now(); // Reset start time
          this.lastTickTime = this.startTime;
          this.elapsedTime = 0;
        }
        break;

      case PlaybackPhase.EXPLOSION:
        // Explosion phase (3 seconds) to let pieces spread dramatically before fall
        this.updatePhysics();
        
        if (this.elapsedTime >= 3.0) {
          console.log(`💥 Explosion complete, starting fall`);
          this.phase = PlaybackPhase.FALL;
          this.startTime = performance.now(); // Reset start time for fall duration
          this.lastTickTime = this.startTime;
          this.elapsedTime = 0;
        }
        break;

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
        // Update progress (0 to 1) linearly for constant speed
        this.reverseProgress += deltaTime / (this.config.durationSec ?? 6);
        this.reverseProgress = Math.min(this.reverseProgress, 1);
        
        // Calculate exact frame position (with decimals for interpolation)
        const framePosition = (1 - this.reverseProgress) * (this.recordedFrames.length - 1);
        const frameIndex = Math.floor(framePosition);
        const frameFraction = framePosition - frameIndex;
        
        if (frameIndex >= 0) {
          // Interpolate between current frame and next frame for smooth motion
          if (frameFraction > 0.001 && frameIndex < this.recordedFrames.length - 1) {
            this.playReverseFrameInterpolated(frameIndex, frameIndex + 1, frameFraction);
          } else {
            this.playReverseFrameAt(frameIndex);
          }
          
          // Log every 10% to reduce console overhead
          const progressPercent = Math.floor(this.reverseProgress * 10);
          const prevProgressPercent = Math.floor((this.reverseProgress - deltaTime / (this.config.durationSec ?? 6)) * 10);
          if (progressPercent !== prevProgressPercent) {
            console.log(`⏪ Reverse progress: ${(this.reverseProgress * 100).toFixed(0)}% (frame ${framePosition.toFixed(1)}/${this.recordedFrames.length - 1})`);
          }
        }
        
        if (this.reverseProgress >= 1) {
          console.log(`⏪ Reverse complete (${this.recordedFrames.length} frames played)`);
          
          // Start smooth blend to exact original positions
          this.captureCurrentPositions();
          this.phase = PlaybackPhase.FINAL_BLEND;
          this.blendProgress = 0;
          this.reverseProgress = 0;
        }
        break;

      case PlaybackPhase.FINAL_BLEND:
        // Smooth blend from current position to exact original (0.2 seconds)
        this.blendProgress += deltaTime / 0.2;
        this.blendProgress = Math.min(this.blendProgress, 1);
        
        this.blendToOriginalPositions(this.blendProgress);
        
        if (this.blendProgress >= 1) {
          console.log(`✨ Blend to original complete (0.2s)`);
          this.phase = PlaybackPhase.LOOP_PAUSE;
          this.pauseTimer = 0;
          this.blendProgress = 0;
          this.blendStartPositions = null; // Free memory
          console.log(`⏸️ Starting loop pause (${(this.config.loop?.pauseMs ?? 1000) / 1000}s)`);
        }
        break;

      case PlaybackPhase.LOOP_PAUSE:
        this.pauseTimer += deltaTime;
        const loopPauseDuration = (this.config.loop?.pauseMs ?? 1000) / 1000;
        
        // Log pause start
        if (this.pauseTimer === deltaTime) {
          console.log(`⏸️ Loop pause started (${loopPauseDuration}s)`);
        }
        
        if (this.pauseTimer >= loopPauseDuration) {
          this.loopCount++;
          console.log(`🔄 Loop cycle ${this.loopCount} complete, restarting...`);
          
          // Loop infinitely - restart the cycle
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
    
    // Use instancedMap which already tracks all meshes (instanced or regular)
    this.instancedMap.forEach((map, id) => {
      const M = new THREE.Matrix4();
      const mesh = map.mesh as any;
      
      if (mesh.isInstancedMesh) {
        // InstancedMesh: get matrix at specific index
        mesh.getMatrixAt(map.index, M);
      } else {
        // Regular Mesh: compose matrix from position/quaternion/scale
        M.compose(mesh.position, mesh.quaternion, mesh.scale);
      }
      
      this.originalPositions!.set(id, M.clone());
    });
    
    console.log(`📸 Captured ${this.originalPositions.size} original positions (before physics)`);
  }

  private recordFrame(): void {
    const frame = new Map<string, THREE.Matrix4>();
    
    this.instancedMap.forEach((map, id) => {
      const M = new THREE.Matrix4();
      const mesh = map.mesh as any;
      
      if (mesh.isInstancedMesh) {
        // InstancedMesh: get matrix at specific index
        mesh.getMatrixAt(map.index, M);
      } else {
        // Regular Mesh: compose matrix from position/quaternion/scale
        M.compose(mesh.position, mesh.quaternion, mesh.scale);
      }
      
      frame.set(id, M.clone());
    });
    
    // Also record bond meshes (cylinders)
    this.bondMeshes.forEach((mesh, index) => {
      const M = new THREE.Matrix4();
      M.compose(mesh.position, mesh.quaternion, mesh.scale);
      frame.set(`bond_${index}`, M.clone());
    });
    
    // Log first frame for debugging
    if (this.recordedFrames.length === 0) {
      console.log(`📹 Recording first frame: ${frame.size} entries (${this.instancedMap.size} spheres + ${this.bondMeshes.length} bonds)`);
      if (frame.size > 0) {
        const firstEntry = Array.from(frame.entries())[0];
        console.log(`   Sample ID: "${firstEntry[0]}", position:`, firstEntry[1].elements.slice(12, 15));
      }
    }
    
    this.recordedFrames.push(frame);
  }

  private captureCurrentPositions(): void {
    // Capture current positions at the start of blending
    this.blendStartPositions = new Map<string, THREE.Matrix4>();
    
    const M = new THREE.Matrix4();
    
    // Capture sphere positions
    this.instancedMap.forEach((map, id) => {
      const mesh = map.mesh as any;
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(map.index, M);
      } else {
        M.compose(mesh.position, mesh.quaternion, mesh.scale);
      }
      this.blendStartPositions!.set(id, M.clone());
    });
    
    // Capture bond positions
    this.bondMeshes.forEach((mesh, index) => {
      M.compose(mesh.position, mesh.quaternion, mesh.scale);
      this.blendStartPositions!.set(`bond_${index}`, M.clone());
    });
    
    console.log(`📸 Captured ${this.blendStartPositions.size} current positions for blending`);
  }

  private blendToOriginalPositions(t: number): void {
    // Interpolate from blendStartPositions to originalPositions
    if (!this.blendStartPositions || !this.originalPositions) return;
    
    const P = new THREE.Vector3();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3();
    const P0 = new THREE.Vector3();
    const Q0 = new THREE.Quaternion();
    const S0 = new THREE.Vector3();
    const P1 = new THREE.Vector3();
    const Q1 = new THREE.Quaternion();
    const S1 = new THREE.Vector3();
    const touched = new Set<THREE.InstancedMesh>();
    
    // Blend spheres
    this.instancedMap.forEach((map, id) => {
      const startMatrix = this.blendStartPositions!.get(id);
      const endMatrix = this.originalPositions!.get(id);
      if (!startMatrix || !endMatrix) return;
      
      // Decompose start and end
      startMatrix.decompose(P0, Q0, S0);
      endMatrix.decompose(P1, Q1, S1);
      
      // Interpolate
      P.lerpVectors(P0, P1, t);
      Q.slerpQuaternions(Q0, Q1, t);
      S.lerpVectors(S0, S1, t);
      
      const mesh = map.mesh as any;
      if (mesh.isInstancedMesh) {
        const M = new THREE.Matrix4();
        M.compose(P, Q, S);
        mesh.setMatrixAt(map.index, M);
        touched.add(mesh);
      } else {
        mesh.position.copy(P);
        mesh.quaternion.copy(Q);
        mesh.scale.copy(S);
        mesh.updateMatrix();
        mesh.matrixWorldNeedsUpdate = true;
      }
    });
    
    touched.forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true));
    
    // Blend bonds
    this.bondMeshes.forEach((mesh, index) => {
      const bondId = `bond_${index}`;
      const startMatrix = this.blendStartPositions!.get(bondId);
      const endMatrix = this.originalPositions!.get(bondId);
      if (!startMatrix || !endMatrix) return;
      
      startMatrix.decompose(P0, Q0, S0);
      endMatrix.decompose(P1, Q1, S1);
      
      P.lerpVectors(P0, P1, t);
      Q.slerpQuaternions(Q0, Q1, t);
      S.lerpVectors(S0, S1, t);
      
      mesh.position.copy(P);
      mesh.quaternion.copy(Q);
      mesh.scale.copy(S);
      mesh.updateMatrix();
      mesh.matrixWorldNeedsUpdate = true;
    });
  }

  private snapToOriginalPositions(): void {
    // Snap all meshes to their exact original positions (before any physics)
    if (!this.originalPositions) return;
    
    const P = new THREE.Vector3();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3();
    const touched = new Set<THREE.InstancedMesh>();
    let snapCount = 0;
    
    this.originalPositions.forEach((matrix, id) => {
      const map = this.instancedMap.get(id);
      if (map) {
        const mesh = map.mesh as any;
        
        if (mesh.isInstancedMesh) {
          mesh.setMatrixAt(map.index, matrix);
          touched.add(mesh);
          snapCount++;
        } else {
          matrix.decompose(P, Q, S);
          mesh.position.copy(P);
          mesh.quaternion.copy(Q);
          mesh.scale.copy(S);
          mesh.updateMatrix();
          mesh.updateMatrixWorld(true);
          snapCount++;
        }
      }
    });
    
    touched.forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true));
    
    // Also snap bonds to their original transforms (from pre-jitter positions)
    if (this.originalPositions && this.bondMeshes.length > 0) {
      let bondSnapCount = 0;
      
      this.bondMeshes.forEach((mesh, index) => {
        const bondId = `bond_${index}`;
        const matrix = this.originalPositions!.get(bondId);
        if (matrix) {
          matrix.decompose(P, Q, S);
          mesh.position.copy(P);
          mesh.quaternion.copy(Q);
          mesh.scale.copy(S);
          mesh.updateMatrix();
          mesh.updateMatrixWorld(true);
          bondSnapCount++;
        }
      });
      
      console.log(`📍 Snapped to original: ${snapCount} spheres + ${bondSnapCount} bonds`);
    } else {
      console.log(`📍 Snapped to original: ${snapCount} meshes`);
    }
  }

  private playReverseFrameInterpolated(frameIndex0: number, frameIndex1: number, t: number): void {
    // Interpolate between two frames for ultra-smooth playback
    if (frameIndex0 < 0 || frameIndex1 >= this.recordedFrames.length) return;
    
    const frame0 = this.recordedFrames[frameIndex0];
    const frame1 = this.recordedFrames[frameIndex1];
    
    const P = new THREE.Vector3();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3();
    const P0 = new THREE.Vector3();
    const Q0 = new THREE.Quaternion();
    const S0 = new THREE.Vector3();
    const P1 = new THREE.Vector3();
    const Q1 = new THREE.Quaternion();
    const S1 = new THREE.Vector3();
    const touched = new Set<THREE.InstancedMesh>();
    
    // Interpolate spheres
    this.instancedMap.forEach((map, id) => {
      const matrix0 = frame0.get(id);
      const matrix1 = frame1.get(id);
      if (!matrix0 || !matrix1) return;
      
      matrix0.decompose(P0, Q0, S0);
      matrix1.decompose(P1, Q1, S1);
      
      P.lerpVectors(P0, P1, t);
      Q.slerpQuaternions(Q0, Q1, t);
      S.lerpVectors(S0, S1, t);
      
      const mesh = map.mesh as any;
      if (mesh.isInstancedMesh) {
        const M = new THREE.Matrix4();
        M.compose(P, Q, S);
        mesh.setMatrixAt(map.index, M);
        touched.add(mesh);
      } else {
        mesh.position.copy(P);
        mesh.quaternion.copy(Q);
        mesh.scale.copy(S);
        mesh.updateMatrix();
        mesh.matrixWorldNeedsUpdate = true;
      }
    });
    
    touched.forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true));
    
    // Interpolate bonds
    this.bondMeshes.forEach((mesh, index) => {
      const bondId = `bond_${index}`;
      const matrix0 = frame0.get(bondId);
      const matrix1 = frame1.get(bondId);
      if (!matrix0 || !matrix1) return;
      
      matrix0.decompose(P0, Q0, S0);
      matrix1.decompose(P1, Q1, S1);
      
      P.lerpVectors(P0, P1, t);
      Q.slerpQuaternions(Q0, Q1, t);
      S.lerpVectors(S0, S1, t);
      
      mesh.position.copy(P);
      mesh.quaternion.copy(Q);
      mesh.scale.copy(S);
      mesh.updateMatrix();
      mesh.matrixWorldNeedsUpdate = true;
    });
  }

  private playReverseFrameAt(frameIndex: number): void {
    if (frameIndex < 0 || frameIndex >= this.recordedFrames.length) return;
    
    const frame = this.recordedFrames[frameIndex];
    const touched = new Set<THREE.InstancedMesh>();
    let updatedCount = 0;
    
    const P = new THREE.Vector3();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3();
    
    frame.forEach((matrix, id) => {
      const map = this.instancedMap.get(id);
      if (map) {
        const mesh = map.mesh as any;
        
        // Check if it's an InstancedMesh or regular Mesh
        if (mesh.isInstancedMesh) {
          // InstancedMesh: use setMatrixAt
          mesh.setMatrixAt(map.index, matrix);
          touched.add(mesh);
        } else {
          // Regular Mesh: decompose matrix and apply to position/quaternion
          matrix.decompose(P, Q, S);
          mesh.position.copy(P);
          mesh.quaternion.copy(Q);
          mesh.scale.copy(S);
          mesh.updateMatrix();
          mesh.matrixWorldNeedsUpdate = true;
          updatedCount++;
        }
      }
    });
    
    touched.forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true));
    
    // Also play back bonds from recorded transforms
    let bondUpdatedCount = 0;
    this.bondMeshes.forEach((mesh, index) => {
      const bondId = `bond_${index}`;
      const matrix = frame.get(bondId);
      if (matrix) {
        matrix.decompose(P, Q, S);
        mesh.position.copy(P);
        mesh.quaternion.copy(Q);
        mesh.scale.copy(S);
        mesh.updateMatrix();
        mesh.matrixWorldNeedsUpdate = true;
        bondUpdatedCount++;
      }
    });
    
    // Debug: log every ~4 seconds to reduce overhead
    if (frameIndex % 240 === 0) {
      console.log(`🎬 Reverse frame ${frameIndex}: updated ${updatedCount}/${this.instancedMap.size} spheres + ${bondUpdatedCount}/${this.bondMeshes.length} bonds`);
      if (updatedCount === 0 && frame.size > 0) {
        const firstFrameId = Array.from(frame.keys())[0];
        const inMap = this.instancedMap.has(firstFrameId);
        console.log(`   ⚠️ Sample frame ID "${firstFrameId}" found in map: ${inMap}`);
        if (this.instancedMap.size > 0) {
          const firstMapId = Array.from(this.instancedMap.keys())[0];
          console.log(`   First map ID: "${firstMapId}"`);
        }
      }
    }
  }

  private async restartLoop(): Promise<void> {
    console.log('🔄 Restarting loop...');
    
    // Reset to TRUE original positions (before any physics/jitter)
    if (this.originalPositions) {
      const touched = new Set<THREE.InstancedMesh>();
      const P = new THREE.Vector3();
      const Q = new THREE.Quaternion();
      const S = new THREE.Vector3();
      
      this.originalPositions.forEach((matrix, id) => {
        const map = this.instancedMap.get(id);
        if (map) {
          const mesh = map.mesh as any;
          
          if (mesh.isInstancedMesh) {
            // InstancedMesh: use setMatrixAt
            mesh.setMatrixAt(map.index, matrix);
            touched.add(mesh);
          } else {
            // Regular Mesh: decompose and apply
            matrix.decompose(P, Q, S);
            mesh.position.copy(P);
            mesh.quaternion.copy(Q);
            mesh.scale.copy(S);
            mesh.updateMatrix();
            mesh.updateMatrixWorld(true);
          }
        }
      });
      
      touched.forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true));
      console.log(`🔄 Reset to original positions (${this.originalPositions.size} meshes)`);
    }
    
    // Clear recorded frames for fresh recording
    this.recordedFrames = [];
    
    // Reinitialize physics (instancedMap persists, no need to rebuild)
    this.cleanupPhysics();
    await this.initializePhysics();
    
    // CRITICAL: Re-fetch bond meshes after physics reinitialization
    // The physics manager creates a new bondMeshes array, so we need a new reference
    if (this.physicsManager && (this.physicsManager as any).getBondMeshes) {
      const bonds = (this.physicsManager as any).getBondMeshes();
      this.bondMeshes = bonds.map((b: any) => b.mesh);
      console.log(`🔄 Re-fetched ${this.bondMeshes.length} bond meshes after restart`);
      
      // Also update originalPositions with the new bond references
      // Use pre-jitter positions from physics manager
      if (this.originalPositions && (this.physicsManager as any).capturePreJitterPositions) {
        const preJitter = (this.physicsManager as any).capturePreJitterPositions();
        if (preJitter) {
          // Update bond entries in originalPositions
          this.bondMeshes.forEach((mesh, index) => {
            const bondId = `bond_${index}`;
            const matrix = preJitter.get(bondId);
            if (matrix) {
              this.originalPositions!.set(bondId, matrix);
            }
          });
          console.log(`🔄 Updated originalPositions with ${this.bondMeshes.length} new bond references`);
        }
      }
    }
    
    // Reset timers and phase AFTER physics is ready
    this.phase = PlaybackPhase.INITIAL_PAUSE;
    this.pauseTimer = 0;
    this.startTime = performance.now();
    this.lastTickTime = this.startTime;
    this.elapsedTime = 0;
    
    console.log('✅ Loop restarted, starting with initial pause');
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

  private applyExplosion(): void {
    if (!this.physicsManager || !(this.physicsManager as any).applyExplosion) return;
    
    const strength = this.config.explosion?.strength ?? 20;
    (this.physicsManager as any).applyExplosion(strength);
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
