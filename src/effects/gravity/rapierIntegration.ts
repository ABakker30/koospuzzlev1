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
  
  async initialize(
    config: GravityEffectConfig,
    spheresGroup: THREE.Group,
    scene: THREE.Scene
  ): Promise<void> {
    // Dynamically import and initialize RAPIER
    try {
      // Use dynamic string to avoid Vite static analysis
      const packageName = '@dimforge/' + 'rapier3d';
      // @ts-ignore - Dynamic import, package may not be installed yet
      const RAPModule = await import(/* @vite-ignore */ packageName);
      await RAPModule.init();
      this.RAPIER = RAPModule;
    } catch (error) {
      console.error('Failed to load Rapier3D:', error);
      throw new Error('Rapier3D not installed. Run: npm install @dimforge/rapier3d');
    }
    
    // Create physics world with gravity
    const gravityValue = getGravityValue(config.gravity);
    this.world = new this.RAPIER.World({ x: 0, y: gravityValue, z: 0 });
    
    console.log('🌍 Created Rapier world with gravity:', gravityValue);
    
    // Get all meshes (spheres for shapes, or all meshes for solutions)
    const meshes: THREE.Mesh[] = [];
    let isSolutionMode = false;
    
    spheresGroup.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        meshes.push(child);
        // Check if this is a solution (has non-sphere geometry)
        if (!(child.geometry instanceof THREE.SphereGeometry) && 
            !(child.geometry instanceof THREE.CylinderGeometry)) {
          isSolutionMode = true;
        }
      }
    });
    
    // For shapes: use spheres only
    // For solutions: use all visible geometry
    const sphereMeshes = isSolutionMode 
      ? meshes.filter(m => !(m.geometry instanceof THREE.CylinderGeometry)) // Exclude bonds
      : meshes.filter(m => m.geometry instanceof THREE.SphereGeometry); // Only spheres
    
    console.log(`🔮 Found ${sphereMeshes.length} meshes (${isSolutionMode ? 'solution' : 'shape'} mode)`);
    
    // Create rigid bodies for each sphere
    for (const mesh of sphereMeshes) {
      const radius = this.getSphereRadius(mesh);
      
      // Start as kinematic (frozen) for staggered release
      const bodyType = config.release.mode === 'staggered' 
        ? this.RAPIER.RigidBodyType.KinematicPositionBased
        : this.RAPIER.RigidBodyType.Dynamic;
      
      const bodyDesc = this.RAPIER.RigidBodyDesc.new(bodyType)
        .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
        .setRotation(mesh.quaternion);
      
      const body = this.world.createRigidBody(bodyDesc);
      
      // Create sphere collider
      const colliderDesc = this.RAPIER.ColliderDesc.ball(radius)
        .setDensity(1.0)
        .setRestitution(0.3)
        .setFriction(0.5);
      
      this.world.createCollider(colliderDesc, body);
      
      // Store mapping
      this.bodies.set(mesh.uuid, body);
    }
    
    // Apply variation jitter if needed
    if (config.variation > 0) {
      this.applyVariation(config.variation, config.seed);
    }
    
    // Detect connections and create joints
    const connections = this.detectConnections(spheresGroup, scene);
    this.createJoints(connections);
    
    // Add environment elements
    if (config.environment.ground) {
      this.addGroundPlane(spheresGroup);
    }
    
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
  
  step(deltaTime: number, config: GravityEffectConfig, scene: THREE.Scene): void {
    if (!this.world) return;
    
    // Handle staggered release
    if (config.release.mode === 'staggered') {
      this.handleStaggeredRelease(deltaTime, config);
    }
    
    // Step physics simulation
    this.world.step();
    
    // Update Three.js meshes from physics bodies
    this.bodies.forEach((body, meshId) => {
      const mesh = scene.getObjectByProperty('uuid', meshId) as THREE.Mesh;
      if (mesh && body) {
        const position = body.translation();
        const rotation = body.rotation();
        
        mesh.position.set(position.x, position.y, position.z);
        mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      }
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
  
  private getSphereRadius(mesh: THREE.Mesh): number {
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
