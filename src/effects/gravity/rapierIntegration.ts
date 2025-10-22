// Rapier Physics Integration for Gravity Effect
import * as THREE from 'three';
import { GravityEffectConfig, getGravityValue } from './types';
import { computeJointThresholds, breakJointsIfExceeded } from './breakThresholds';

// Seeded random number generator for deterministic behavior
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

export class RapierPhysicsManager {
  private RAPIER: any = null;
  private world: any = null;
  private bodies: Map<string, any> = new Map();
  private joints: any[] = [];
  private breakThresholds: Map<number, { fTh: number; tauTh: number }> | null = null;
  private releaseTimer = 0;
  private releasedBodies = new Set<string>();
  private instancedMeshMap = new Map<string, { mesh: THREE.InstancedMesh; index: number }>();
  private originalGroupY = 0; // Store original spheresGroup Y position for restoration
  
  // NEW: track colliders and original frictions for recall-mode friction drop
  private colliders: Map<string, any> = new Map();
  private originalFriction: Map<string, number> = new Map();
  private groundCollider: any | null = null;
  private wallColliders: any[] = [];
  
  // Loop mode: Magnetic Recall → Constraint Bloom
  private phase: "idle" | "fall" | "recall" | "settleHold" | "bloom" | "postBloomDampen" | "loopHold" = "idle";
  private loopCfg: Required<NonNullable<GravityEffectConfig["loop"]>> | null = null;
  private cachedConnections: Map<string, string[]> | null = null;
  private bloomQueue: Array<[string,string]> = [];
  private bloomTimer = 0;
  private settleHoldTimer = 0;
  private postBloomTimer = 0;
  private loopHoldTimer = 0;
  private phaseTimer = 0; // Tracks time within current phase
  private effectDuration = 6; // Total effect duration for T/2 split (default 6s)
  private originalGravity = { x: 0, y: -9.81, z: 0 }; // Store original gravity
  
  async initialize(
    config: GravityEffectConfig,
    spheresGroup: THREE.Group,
    scene: THREE.Scene
  ): Promise<void> {
    // Dynamically import and initialize RAPIER (using compat version)
    try {
      // @ts-ignore
      const RAPIER = await import('@dimforge/rapier3d-compat');
      await RAPIER.init();
      this.RAPIER = RAPIER;
      console.log('✅ Rapier3D (compat) loaded');
    } catch (error) {
      console.error('❌ Failed to load Rapier3D:', error);
      throw new Error('Rapier3D not installed. Run: npm install @dimforge/rapier3d-compat');
    }
    
    // Create physics world with gravity
    const gravityValue = getGravityValue(config.gravity);
    this.world = new this.RAPIER.World({ x: 0, y: gravityValue, z: 0 });
    
    console.log('🌍 Created Rapier world with gravity:', gravityValue);
    
    // Store original position and lift spheresGroup so sphere BOTTOMS are at y=0
    // Calculate bbox only from spheres/meshes, excluding shadow plane
    this.originalGroupY = spheresGroup.position.y;
    
    const sphereBbox = new THREE.Box3();
    spheresGroup.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry) {
        sphereBbox.expandByObject(child);
      } else if (child instanceof THREE.InstancedMesh && child.geometry instanceof THREE.SphereGeometry) {
        sphereBbox.expandByObject(child);
      }
    });
    
    const lowestPoint = sphereBbox.min.y;
    const liftAmount = -lowestPoint; // Amount to lift so lowest sphere bottom reaches y=0
    
    console.log(`📦 Sphere bbox: min.y=${lowestPoint.toFixed(3)}, lifting by ${liftAmount.toFixed(3)} to align sphere bottoms with y=0 ground`);
    
    spheresGroup.position.y += liftAmount;
    
    // Check for InstancedMesh (shapes) or regular meshes (solutions)
    const instancedMeshes: THREE.InstancedMesh[] = [];
    const meshes: THREE.Mesh[] = [];
    
    spheresGroup.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.InstancedMesh) {
        instancedMeshes.push(child);
      } else if (child instanceof THREE.Mesh) {
        meshes.push(child);
      }
    });
    
    const isSolutionMode = instancedMeshes.length === 0 && meshes.length > 0;
    
    console.log(`🔮 Found ${meshes.length} individual meshes + ${instancedMeshes.length} instanced meshes (${isSolutionMode ? 'solution' : 'shape'} mode)`);
    
    // Create rigid bodies for instanced meshes (shapes)
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    
    for (const instancedMesh of instancedMeshes) {
      const radius = this.getSphereRadius(instancedMesh);
      const isSphereInstanced = instancedMesh.geometry instanceof THREE.SphereGeometry;
      
      // Only process sphere instances (skip bond cylinders)
      if (!isSphereInstanced) continue;
      
      console.log(`🎨 Processing ${instancedMesh.count} sphere instances...`);
      
      for (let i = 0; i < instancedMesh.count; i++) {
        // Get transformation matrix for this instance in mesh-local space
        instancedMesh.getMatrixAt(i, matrix);
        
        // Convert to world space (apply mesh's world transform)
        const worldMatrix = new THREE.Matrix4()
          .multiplyMatrices(instancedMesh.matrixWorld, matrix);
        
        worldMatrix.decompose(position, quaternion, scale);
        
        // All bodies are DYNAMIC from start at exact world positions
        // For staggered release, bodies start SLEEPING and wake up gradually
        const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(position.x, position.y, position.z)
          .setRotation(quaternion)
          .setLinvel(0, 0, 0)
          .setAngvel(0, 0, 0)
          .setCanSleep(true); // Enable sleeping
        
        const body = this.world.createRigidBody(bodyDesc);
        
        // Start truly asleep if staggered release mode
        if (config.release.mode === 'staggered') {
          body.sleep();
        }
        
        // Create sphere collider
        const colliderDesc = this.RAPIER.ColliderDesc.ball(radius)
          .setDensity(1.0)
          .setRestitution(0.05) // Very low bounce for gentle settling
          .setFriction(0.7);
        
        const collider = this.world.createCollider(colliderDesc, body);
        
        // Store mapping with unique ID
        const instanceId = `${instancedMesh.uuid}_${i}`;
        this.bodies.set(instanceId, body);
        this.instancedMeshMap.set(instanceId, { mesh: instancedMesh, index: i });
        this.colliders.set(instanceId, collider);
        this.originalFriction.set(instanceId, 0.7);
      }
    }
    
    console.log(`✅ Created ${this.bodies.size} total rigid bodies`);
    
    // Store initial positions for magnetic return
    this.bodies.forEach((body, meshId) => {
      const pos = body.translation();
      this.initialPositions.set(meshId, { x: pos.x, y: pos.y, z: pos.z });
    });
    
    // Apply variation jitter if needed
    if (config.variation > 0) {
      this.applyVariation(config.variation, config.seed);
    }
    
    // Detect connections but DO NOT create joints yet (defer to Bloom phase)
    this.cachedConnections = this.detectConnections(spheresGroup, scene);
    console.log(`🧩 Cached ${this.cachedConnections.size} connected sphere nodes for Bloom stage`);
    
    // If not using loop mode, create joints immediately (traditional gravity)
    if (!config.loop?.enabled) {
      this.createJoints(this.cachedConnections);
    }
    
    // Add environment elements (ground plane always enabled)
    this.addGroundPlane(spheresGroup);
    
    if (config.environment.walls) {
      this.addBoundaryWalls(spheresGroup);
    }
    
    // Calculate break thresholds if auto-break enabled
    if (config.autoBreak.enabled && this.joints.length > 0) {
      const gAbs = Math.abs(gravityValue);
      this.breakThresholds = computeJointThresholds(
        config.autoBreak.level,
        gAbs,
        (body: any) => {
          // Find mesh for this body to get radius
          for (const [meshId, b] of this.bodies.entries()) {
            if (b.handle === body.handle) {
              const mesh = scene.getObjectByProperty('uuid', meshId) as THREE.Mesh;
              if (mesh) return this.getSphereRadius(mesh);
            }
          }
          return 0.5; // Fallback
        },
        this.world.bodies as any,
        this.joints as any[]
      );
      
      console.log(`🔨 Break thresholds calculated for ${this.joints.length} joints`);
    }
    
    console.log('✅ Rapier physics initialized (dynamic bodies at exact positions, sleeping=' + (config.release.mode === 'staggered') + ')');
    
    // --- Auto-start loop if enabled (guarantees Recall/Bloom without host wiring) ---
    console.log('🔍 Loop config check: config.loop?.enabled =', config.loop?.enabled, 'config.loop =', config.loop);
    if (config.loop?.enabled) {
      console.log("🔁 Auto-starting Recall→Bloom loop from initialize()");
      this.startRecallBloomLoop(config);
    } else {
      console.log("⚠️ Loop NOT enabled - config.loop?.enabled is falsy");
    }
  }
  
  private initialPositions = new Map<string, { x: number; y: number; z: number }>();
  
  // Public API for loop phase inspection
  getPhase(): typeof this.phase {
    return this.phase;
  }
  
  isLoopCycleDone(): boolean {
    return this.phase === "loopHold";
  }
  
  private setAllSphereFriction(value: number): void {
    this.colliders.forEach((col) => {
      try { col.setFriction(value); } catch {}
    });
  }

  private restoreAllSphereFriction(): void {
    this.colliders.forEach((col, id) => {
      try { col.setFriction(this.originalFriction.get(id) ?? 0.7); } catch {}
    });
  }
  
  startRecallBloomLoop(config: GravityEffectConfig): void {
    if (!config.loop?.enabled) return;
    this.loopCfg = {
      enabled: true,
      mode: "recall-bloom",
      recallGain: config.loop.recallGain ?? 90,
      recallMaxSpeed: config.loop.recallMaxSpeed ?? 12,
      recallTauSec: config.loop.recallTauSec ?? 0, // computed dynamically as half * 0.6
      recallMaxAccel: config.loop.recallMaxAccel ?? 40,
      settleThreshold: config.loop.settleThreshold ?? 0.02,
      settleHoldMs: config.loop.settleHoldMs ?? 400,
      bloomBatchSize: config.loop.bloomBatchSize ?? 24,
      bloomIntervalMs: config.loop.bloomIntervalMs ?? 80,
      postBloomDampenMs: config.loop.postBloomDampenMs ?? 400,
      loopHoldMs: config.loop.loopHoldMs ?? 1200,
    };

    // Guard duration with sane default
    this.effectDuration = (config.durationSec && config.durationSec > 0) ? config.durationSec : 6;
    
    // Store original gravity for restoration
    const gravityValue = getGravityValue(config.gravity);
    this.originalGravity = { x: 0, y: gravityValue, z: 0 };

    // Phase 1: FALL (first half of duration)
    this.resetJointsForNextFall(); // Clear any existing joints
    this.phase = "fall";
    this.phaseTimer = 0;
    
    // Ensure gravity restored for fall
    this.world.setGravity(this.originalGravity);
    console.log("🌐 World gravity now:", this.originalGravity);
    
    // Enable sleep for fall
    this.bodies.forEach(b => {
      b.setCanSleep(true);
    });
    
    // Wake all bodies for fall
    this.bodies.forEach(b => b.wakeUp());

    console.log("🔁 Loop started: FALL (T/2) → RECALL (T/2) → Bloom");
  }
  
  step(deltaTime: number, config: GravityEffectConfig, scene: THREE.Scene, progress: number = 1): void {
    if (!this.world) return;
    
    // 🔧 Normalize dt to seconds if caller passes milliseconds
    // Heuristic: if dt is greater than ~1.0s, it's probably ms
    if (deltaTime > 1.0) {
      deltaTime = deltaTime / 1000.0;
    }
    
    // Debug logging for phase tracking
    if (this.loopCfg && this.phase !== "idle" && Math.floor(this.phaseTimer * 2) % 10 === 0) {
      console.log(`[physics] phase=${this.phase} t=${this.phaseTimer.toFixed(2)}`);
    }
    
    // --- Loop Phase Handling ---
    if (this.loopCfg && this.phase !== "idle") {
      this.phaseTimer += deltaTime;
      const halfDuration = (this.effectDuration / 2);

      if (this.phase === "fall") {
        // Fall for first T/2
        if (this.phaseTimer >= halfDuration) {
          // Switch to RECALL
          this.phase = "recall";
          this.phaseTimer = 0;
          
          // 2a) Gravity OFF
          this.world.setGravity({ x: 0, y: 0, z: 0 });
          console.log("🌐 World gravity now: OFF (0, 0, 0)");
          
          // 2b) Make ground and walls sensors (no contact constraints during recall)
          if (this.groundCollider) {
            try { this.groundCollider.setSensor(true); } catch {}
          }
          for (const c of this.wallColliders) {
            try { c.setSensor(true); } catch {}
          }
          
          // 2c) Drop friction so spheres can glide (solver won't "stick" them)
          this.setAllSphereFriction(0.02);
          
          // 2d) Break resting contacts: lift each sphere a stronger epsilon
          const eps = 0.02; // 2 cm in your world units
          this.bodies.forEach((b) => {
            const p = b.translation();
            b.setTranslation({ x: p.x, y: p.y + eps, z: p.z }, true);
          });
          
          // 2e) Disable sleep during recall and wake now
          this.bodies.forEach(b => {
            b.setCanSleep(false);
            b.wakeUp();
          });
          console.log("⬆️ RECALL (physics): gravity OFF, ground/walls sensor, friction low, lifted ε");
        }
      }
      else if (this.phase === "recall") {
        const half = this.effectDuration / 2;
        const tau = (this.loopCfg?.recallTauSec && this.loopCfg.recallTauSec > 0)
          ? this.loopCfg.recallTauSec
          : half * 0.6;

        const vmax = (this.loopCfg?.recallMaxSpeed && this.loopCfg.recallMaxSpeed > 0)
          ? this.loopCfg.recallMaxSpeed
          : 12; // units/s, raise if your scene is large

        // Critically-damped-ish velocity target:
        // v_target = (2/tau) * error - (1/tau) * v_current
        const a = 2 / tau;
        const b = 1 / tau;

        this.bodies.forEach((body, id) => {
          const goal = this.initialPositions.get(id);
          if (!goal) return;

          if (body.isSleeping?.()) body.wakeUp();

          const p = body.translation();
          const v = body.linvel();

          const ex = goal.x - p.x;
          const ey = goal.y - p.y;
          const ez = goal.z - p.z;

          let vx = a * ex - b * v.x;
          let vy = a * ey - b * v.y;
          let vz = a * ez - b * v.z;

          // clamp speed
          const speed = Math.hypot(vx, vy, vz);
          if (speed > vmax) {
            const k = vmax / speed;
            vx *= k; vy *= k; vz *= k;
          }

          // drive velocity directly (still dynamic & colliding)
          body.setLinvel({ x: vx, y: vy, z: vz }, true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        });
        
        // Debug: log one sample body to verify motion
        if (Math.floor(this.phaseTimer * 2) % 1 === 0) {
          const it = this.bodies.entries().next();
          if (!it.done) {
            const [id, b] = it.value;
            const p = b.translation();
            const v = b.linvel();
            console.log(`[recall] sample id=${id.slice(-8)} p=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) v=(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})`);
          }
        }

        if (this.phaseTimer >= half) {
          this.bodies.forEach((b, id) => {
            const goal = this.initialPositions.get(id);
            if (!goal) return;
            b.setLinvel({ x: 0, y: 0, z: 0 }, true);
            const p = b.translation();
            const d = Math.hypot(goal.x - p.x, goal.y - p.y, goal.z - p.z);
            if (d < 0.01) b.setTranslation(goal, true);
          });

          this.phase = "settleHold";
          this.phaseTimer = 0;
          this.settleHoldTimer = 0;
          this.prepareBloomQueue();
          console.log("⏸️ SettleHold (physics recall complete)");
        }
      }
      else if (this.phase === "settleHold") {
        this.settleHoldTimer += deltaTime * 1000;
        if (this.settleHoldTimer >= this.loopCfg!.settleHoldMs) {
          this.phase = "bloom";
          this.bloomTimer = 0;
          console.log("🌸 Bloom starting (creating joints in batches)");
        }
      }
      else if (this.phase === "bloom") {
        this.bloomTimer += deltaTime * 1000;
        while (this.bloomTimer >= this.loopCfg!.bloomIntervalMs && this.bloomQueue.length > 0) {
          this.bloomTimer -= this.loopCfg!.bloomIntervalMs;
          this.createBloomBatch(this.loopCfg!.bloomBatchSize);
        }
        if (this.bloomQueue.length === 0) {
          this.phase = "postBloomDampen";
          this.postBloomTimer = 0;
          // Small global slow-down
          this.bodies.forEach(b => {
            const v = b.linvel();
            b.setLinvel({ x: v.x*0.2, y: v.y*0.2, z: v.z*0.2 }, true);
          });
          console.log("✅ Bloom complete");
        }
      }
      else if (this.phase === "postBloomDampen") {
        this.postBloomTimer += deltaTime * 1000;
        if (this.postBloomTimer >= this.loopCfg!.postBloomDampenMs) {
          this.phase = "loopHold";
          this.loopHoldTimer = 0;
          
          // Restore gravity, ground/walls, friction, and re-enable sleeping after bloom
          this.world.setGravity(this.originalGravity);
          console.log("🌐 World gravity now:", this.originalGravity);
          if (this.groundCollider) {
            try { this.groundCollider.setSensor(false); } catch {}
          }
          for (const c of this.wallColliders) {
            try { c.setSensor(false); } catch {}
          }
          this.restoreAllSphereFriction();
          this.bodies.forEach(b => {
            b.setCanSleep(true);
          });
        }
      }
      else if (this.phase === "loopHold") {
        this.loopHoldTimer += deltaTime * 1000;
        if (this.loopHoldTimer >= this.loopCfg!.loopHoldMs) {
          // Remove joints, restore gravity and colliders, fall again
          this.resetJointsForNextFall();
          
          this.world.setGravity(this.originalGravity);
          console.log("🌐 World gravity now:", this.originalGravity);
          if (this.groundCollider) {
            try { this.groundCollider.setSensor(false); } catch {}
          }
          for (const c of this.wallColliders) {
            try { c.setSensor(false); } catch {}
          }
          this.restoreAllSphereFriction();
          
          // Restore normal dynamics for fall
          this.bodies.forEach(b => {
            b.setCanSleep(true);
          });
          
          this.phase = "fall";
          this.phaseTimer = 0;
          this.bodies.forEach(b => b.wakeUp());
          console.log("⬇️ Fall phase (T/2) - gravity ON");
        }
      }
    } else {
      // Non-loop mode: allow staggered release if configured
      if (!this.loopCfg && config.release.mode === 'staggered' && this.phase === "idle") {
        this.handleStaggeredRelease(deltaTime, config);
      }
    }
    
    // Step physics simulation
    this.world.step();
    
    // Update InstancedMesh matrices from physics bodies
    const updatedMeshes = new Set<THREE.InstancedMesh>();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const invMW = new THREE.Matrix4(); // For world→local conversion
    
    this.bodies.forEach((body, meshId) => {
      const instanceData = this.instancedMeshMap.get(meshId);
      if (instanceData) {
        const pos = body.translation();
        const rot = body.rotation();
        
        // Compose world-space transform
        position.set(pos.x, pos.y, pos.z);
        quaternion.set(rot.x, rot.y, rot.z, rot.w);
        matrix.compose(position, quaternion, scale);
        
        // Convert world → mesh-local before setting
        invMW.copy(instanceData.mesh.matrixWorld).invert();
        matrix.premultiply(invMW);
        
        instanceData.mesh.setMatrixAt(instanceData.index, matrix);
        updatedMeshes.add(instanceData.mesh);
      }
    });
    
    // Mark all updated meshes as needing update
    updatedMeshes.forEach(mesh => {
      mesh.instanceMatrix.needsUpdate = true;
    });
    
    // Check for joint breaks
    if (config.autoBreak.enabled && this.breakThresholds && this.joints.length > 0) {
      const broken = breakJointsIfExceeded(
        this.world as any,
        this.joints as any[],
        this.breakThresholds,
        (joint) => {
          console.log('🔨 Joint broke!');
        }
      );
      
      if (broken > 0) {
        // Filter out broken joints
        this.joints = this.joints.filter(j => {
          try {
            return this.world!.impulseJoints.contains(j.handle);
          } catch {
            return false;
          }
        });
      }
    }
  }
  
  dispose(spheresGroup?: THREE.Group): void {
    if (this.world) {
      this.world.free();
      this.world = null;
    }
    this.bodies.clear();
    this.joints = [];
    this.breakThresholds = null;
    this.releasedBodies.clear();
    this.instancedMeshMap.clear();
    this.colliders.clear();
    this.originalFriction.clear();
    
    // Restore original spheresGroup position
    if (spheresGroup) {
      spheresGroup.position.y = this.originalGroupY;
      console.log('🧹 Rapier physics disposed, spheresGroup position restored');
    } else {
      console.log('🧹 Rapier physics disposed');
    }
  }
  
  private getSphereRadius(mesh: THREE.Mesh | THREE.InstancedMesh): number {
    if (mesh.geometry instanceof THREE.SphereGeometry) {
      const params = mesh.geometry.parameters;
      return params.radius * Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z);
    }
    
    // For non-sphere geometry (solutions), compute bounding sphere
    if (!mesh.geometry.boundingSphere) {
      mesh.geometry.computeBoundingSphere();
    }
    
    const boundingSphere = mesh.geometry.boundingSphere;
    if (boundingSphere) {
      return boundingSphere.radius * Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z);
    }
    
    return 0.5; // Fallback
  }
  
  private applyVariation(variation: number, seed: number): void {
    const rng = seededRandom(seed);
    
    this.bodies.forEach((body) => {
      const jitter = variation * 0.1;
      const dx = (rng() - 0.5) * jitter;
      const dz = (rng() - 0.5) * jitter;
      // NO Y jitter - preserve ground contact
      
      const pos = body.translation();
      body.setTranslation({ 
        x: pos.x + dx, 
        y: pos.y, 
        z: pos.z + dz 
      }, true);
    });
    
    console.log(`✨ Applied variation jitter (horizontal only, ${variation})`);
  }
  
  private detectConnections(spheresGroup: THREE.Group, scene: THREE.Scene): Map<string, string[]> {
    const connections = new Map<string, string[]>();
    
    // Find all cylinder meshes (bonds)
    const cylinders: THREE.Mesh[] = [];
    scene.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh && child.geometry instanceof THREE.CylinderGeometry) {
        cylinders.push(child);
      }
    });
    
    console.log(`🔗 Found ${cylinders.length} bond cylinders`);
    
    // Get sphere positions
    const spheres: { mesh: THREE.Mesh; uuid: string; position: THREE.Vector3 }[] = [];
    spheresGroup.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry) {
        spheres.push({
          mesh: child,
          uuid: child.uuid,
          position: child.position.clone()
        });
      }
    });
    
    // For each cylinder, find the two closest spheres
    for (const cylinder of cylinders) {
      const cylinderPos = new THREE.Vector3();
      cylinder.getWorldPosition(cylinderPos);
      
      // Find two closest spheres
      const distances = spheres.map(s => ({
        uuid: s.uuid,
        distance: s.position.distanceTo(cylinderPos)
      }));
      
      distances.sort((a, b) => a.distance - b.distance);
      
      if (distances.length >= 2) {
        const sphere1 = distances[0].uuid;
        const sphere2 = distances[1].uuid;
        
        if (!connections.has(sphere1)) connections.set(sphere1, []);
        if (!connections.has(sphere2)) connections.set(sphere2, []);
        
        connections.get(sphere1)!.push(sphere2);
        connections.get(sphere2)!.push(sphere1);
      }
    }
    
    console.log(`🔗 Detected ${connections.size} connected spheres`);
    return connections;
  }
  
  private createJoints(connections: Map<string, string[]>): void {
    if (!this.world || !this.RAPIER) return;
    
    const processed = new Set<string>();
    
    for (const [meshId1, neighbors] of connections.entries()) {
      const body1 = this.bodies.get(meshId1);
      if (!body1) continue;
      
      for (const meshId2 of neighbors) {
        // Skip if already processed this pair
        const pairKey = [meshId1, meshId2].sort().join('-');
        if (processed.has(pairKey)) continue;
        processed.add(pairKey);
        
        const body2 = this.bodies.get(meshId2);
        if (!body2) continue;
        
        // Create fixed joint between bodies
        const jointDesc = this.RAPIER.ImpulseJointDesc.fixed(
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 }
        );
        
        const jointHandle = this.world.createImpulseJoint(jointDesc, body1, body2, true);
        this.joints.push(jointHandle);
      }
    }
    
    console.log(`🔗 Created ${this.joints.length} fixed joints`);
  }
  
  private prepareBloomQueue(): void {
    this.bloomQueue = [];
    
    // Build connections from body IDs (InstancedMesh compatible)
    // For now, create a simple lattice: connect each body to its nearest neighbors
    const bodyArray = Array.from(this.bodies.entries());
    const seen = new Set<string>();
    
    for (let i = 0; i < bodyArray.length; i++) {
      const [id1, body1] = bodyArray[i];
      const pos1 = body1.translation();
      
      // Find 2-4 closest neighbors
      const distances: Array<{id: string; dist: number}> = [];
      for (let j = 0; j < bodyArray.length; j++) {
        if (i === j) continue;
        const [id2, body2] = bodyArray[j];
        const pos2 = body2.translation();
        const dx = pos2.x - pos1.x, dy = pos2.y - pos1.y, dz = pos2.z - pos1.z;
        const dist = Math.hypot(dx, dy, dz);
        distances.push({ id: id2, dist });
      }
      
      // Sort by distance and take closest 3 (typical lattice coordination)
      distances.sort((a, b) => a.dist - b.dist);
      const neighbors = distances.slice(0, 3);
      
      // Add unique pairs to bloom queue
      for (const nbr of neighbors) {
        const key = [id1, nbr.id].sort().join("-");
        if (!seen.has(key)) {
          seen.add(key);
          this.bloomQueue.push([id1, nbr.id]);
        }
      }
    }
    
    console.log(`🧩 Prepared ${this.bloomQueue.length} joint pairs for bloom`);
  }

  private createBloomBatch(batchSize: number): void {
    if (!this.world || !this.RAPIER) return;
    let created = 0;
    while (created < batchSize && this.bloomQueue.length > 0) {
      const [id1, id2] = this.bloomQueue.shift()!;
      const body1 = this.bodies.get(id1);
      const body2 = this.bodies.get(id2);
      if (!body1 || !body2) continue;

      const jointDesc = this.RAPIER.ImpulseJointDesc.fixed(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 }
      );
      const handle = this.world.createImpulseJoint(jointDesc, body1, body2, true);
      this.joints.push(handle);
      created++;
    }
    if (created > 0) {
      // Small nudge down velocities after a snap
      this.bodies.forEach(b => {
        const v = b.linvel();
        b.setLinvel({ x: v.x*0.6, y: v.y*0.6, z: v.z*0.6 }, true);
      });
    }
  }

  private resetJointsForNextFall(): void {
    if (!this.world) return;
    // Remove all joints so structure can fall apart again
    for (const j of this.joints) {
      try { this.world.removeImpulseJoint(j, true); } catch {}
    }
    this.joints = [];
    // Go idle; caller will trigger next phase
    this.phase = "idle";
  }
  
  private addGroundPlane(spheresGroup: THREE.Group): void {
    if (!this.world || !this.RAPIER) return;
    
    // Ground just below shadow plane to avoid initial penetration
    // Thin slab with top surface at y≈0
    const groundY = -0.01;
    
    console.log(`🌏 Ground plane at y=${groundY} (thin slab, top surface at y≈0)`);
    
    const groundDesc = this.RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, groundY, 0);
    const groundBody = this.world.createRigidBody(groundDesc);
    
    // Very thin ground (0.01 half-height) to prevent overlap & tunneling
    const groundCollider = this.RAPIER.ColliderDesc.cuboid(50, 0.01, 50);
    this.groundCollider = this.world.createCollider(groundCollider, groundBody);
  }
  
  private addBoundaryWalls(spheresGroup: THREE.Group): void {
    if (!this.world || !this.RAPIER) return;
    
    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(spheresGroup);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    
    const margin = 5;
    const wallThickness = 0.5;
    const wallHeight = size.y + 20;
    
    // Create 4 walls
    const walls = [
      { x: box.max.x + margin, y: center.y, z: center.z, w: wallThickness, h: wallHeight, d: size.z + margin * 2 }, // +X
      { x: box.min.x - margin, y: center.y, z: center.z, w: wallThickness, h: wallHeight, d: size.z + margin * 2 }, // -X
      { x: center.x, y: center.y, z: box.max.z + margin, w: size.x + margin * 2, h: wallHeight, d: wallThickness }, // +Z
      { x: center.x, y: center.y, z: box.min.z - margin, w: size.x + margin * 2, h: wallHeight, d: wallThickness }, // -Z
    ];
    
    for (const wall of walls) {
      const bodyDesc = this.RAPIER.RigidBodyDesc.fixed()
        .setTranslation(wall.x, wall.y, wall.z);
      const body = this.world.createRigidBody(bodyDesc);
      
      const colliderDesc = this.RAPIER.ColliderDesc.cuboid(wall.w / 2, wall.h / 2, wall.d / 2);
      const col = this.world.createCollider(colliderDesc, body);
      this.wallColliders.push(col);
    }
    
    console.log('🧱 Added 4 boundary walls');
  }
  
  private handleStaggeredRelease(deltaTime: number, config: GravityEffectConfig): void {
    this.releaseTimer += deltaTime;
    
    const staggerMs = (config.release.staggerMs || 150) / 1000; // Convert to seconds
    const numBatches = Math.floor(this.releaseTimer / staggerMs);
    
    if (numBatches === 0 || this.releasedBodies.size === this.bodies.size) return;
    
    const totalBodies = this.bodies.size;
    const bodiesPerBatch = Math.max(1, Math.ceil(totalBodies / 10));
    
    // Seed random for deterministic release order
    const rng = seededRandom(config.seed + numBatches);
    
    // Pick bodies to release this batch
    const candidates = Array.from(this.bodies.entries())
      .filter(([id]) => !this.releasedBodies.has(id))
      .sort(() => rng() - 0.5)
      .slice(0, bodiesPerBatch);
    
    for (const [id, body] of candidates) {
      // Wake up sleeping bodies instead of changing body type
      if (body.isSleeping()) {
        body.wakeUp();
        this.releasedBodies.add(id);
      }
    }
    
    if (candidates.length > 0) {
      console.log(`🎲 Woke up ${candidates.length} bodies (batch ${numBatches})`);
    }
  }
}
