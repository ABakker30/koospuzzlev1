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
        // Get transformation matrix for this instance
        instancedMesh.getMatrixAt(i, matrix);
        matrix.decompose(position, quaternion, scale);
        
        // Start as kinematic (frozen) for staggered release
        const bodyDesc = config.release.mode === 'staggered'
          ? this.RAPIER.RigidBodyDesc.kinematicPositionBased()
          : this.RAPIER.RigidBodyDesc.dynamic();
        
        bodyDesc.setTranslation(position.x, position.y, position.z)
          .setRotation(quaternion);
        
        const body = this.world.createRigidBody(bodyDesc);
        
        // Create sphere collider
        const colliderDesc = this.RAPIER.ColliderDesc.ball(radius)
          .setDensity(1.0)
          .setRestitution(0.3)
          .setFriction(0.5);
        
        this.world.createCollider(colliderDesc, body);
        
        // Store mapping with unique ID
        const instanceId = `${instancedMesh.uuid}_${i}`;
        this.bodies.set(instanceId, body);
        this.instancedMeshMap.set(instanceId, { mesh: instancedMesh, index: i });
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
    
    // Detect connections and create joints
    const connections = this.detectConnections(spheresGroup, scene);
    this.createJoints(connections);
    
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
    
    console.log('✅ Rapier physics initialized');
  }
  
  private isReturning = false;
  private initialPositions = new Map<string, { x: number; y: number; z: number }>();
  
  startReturnToStart(): void {
    this.isReturning = true;
    console.log('🔄 Starting magnetic return to initial positions');
  }
  
  step(deltaTime: number, config: GravityEffectConfig, scene: THREE.Scene, progress: number = 1): void {
    if (!this.world) return;
    
    // If returning, apply magnetic forces (no physics stepping)
    if (this.isReturning) {
      this.bodies.forEach((body, meshId) => {
        const initialPos = this.initialPositions.get(meshId);
        if (!initialPos) return;
        
        const pos = body.translation();
        const dx = initialPos.x - pos.x;
        const dy = initialPos.y - pos.y;
        const dz = initialPos.z - pos.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (distance > 0.01) {
          // Magnetic force toward initial position
          const forceMagnitude = distance * 50;
          const forceX = (dx / distance) * forceMagnitude;
          const forceY = (dy / distance) * forceMagnitude;
          const forceZ = (dz / distance) * forceMagnitude;
          
          body.setLinvel({ x: forceX * 0.1, y: forceY * 0.1, z: forceZ * 0.1 }, true);
        } else {
          // Snap to exact position
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setTranslation(initialPos, true);
        }
      });
      return;
    }
    
    // Handle staggered release
    if (config.release.mode === 'staggered') {
      this.handleStaggeredRelease(deltaTime, config);
    }
    
    // Step physics simulation
    this.world.step();
    
    // Update InstancedMesh matrices from physics bodies
    const updatedMeshes = new Set<THREE.InstancedMesh>();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    
    this.bodies.forEach((body, meshId) => {
      const instanceData = this.instancedMeshMap.get(meshId);
      if (instanceData) {
        const pos = body.translation();
        const rot = body.rotation();
        
        position.set(pos.x, pos.y, pos.z);
        quaternion.set(rot.x, rot.y, rot.z, rot.w);
        matrix.compose(position, quaternion, scale);
        
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
  
  dispose(): void {
    if (this.world) {
      this.world.free();
      this.world = null;
    }
    this.bodies.clear();
    this.joints = [];
    this.breakThresholds = null;
    this.releasedBodies.clear();
    console.log('🧹 Rapier physics disposed');
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
      const dy = (rng() - 0.5) * jitter;
      const dz = (rng() - 0.5) * jitter;
      
      const pos = body.translation();
      body.setTranslation({ 
        x: pos.x + dx, 
        y: pos.y + dy, 
        z: pos.z + dz 
      }, true);
    });
    
    console.log(`✨ Applied variation jitter (${variation})`);
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
  
  private addGroundPlane(spheresGroup: THREE.Group): void {
    if (!this.world || !this.RAPIER) return;
    
    // Calculate lowest point
    const box = new THREE.Box3().setFromObject(spheresGroup);
    const groundY = box.min.y - 2;
    
    const groundDesc = this.RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, groundY, 0);
    const groundBody = this.world.createRigidBody(groundDesc);
    
    const groundCollider = this.RAPIER.ColliderDesc.cuboid(50, 0.1, 50);
    this.world.createCollider(groundCollider, groundBody);
    
    console.log(`🌏 Added ground plane at y=${groundY.toFixed(2)}`);
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
      this.world.createCollider(colliderDesc, body);
    }
    
    console.log('🧱 Added 4 boundary walls');
  }
  
  private handleStaggeredRelease(deltaTime: number, config: GravityEffectConfig): void {
    if (!this.RAPIER) return;
    
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
      if (body.isKinematic()) {
        body.setBodyType(this.RAPIER.RigidBodyType.Dynamic, true);
        this.releasedBodies.add(id);
      }
    }
    
    if (candidates.length > 0) {
      console.log(`🎲 Released ${candidates.length} bodies (batch ${numBatches})`);
    }
  }
}
