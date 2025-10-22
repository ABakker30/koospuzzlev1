// Rapier Physics Integration for Gravity Effect (Simplified)
import * as THREE from 'three';
import { GravityEffectConfig, getGravityValue } from './types';

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
  private releaseTimer = 0;
  private releasedBodies = new Set<string>();
  private instancedMeshMap = new Map<string, { mesh: THREE.InstancedMesh; index: number }>();
  private originalGroupY = 0;

  async initialize(
    config: GravityEffectConfig,
    spheresGroup: THREE.Group,
    scene: THREE.Scene
  ): Promise<void> {
    // Dynamically import and initialize RAPIER
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

    // Store original position and lift spheresGroup so sphere bottoms are at y=0
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
    const liftAmount = -lowestPoint;
    console.log(`📦 Lifting by ${liftAmount.toFixed(3)} to align sphere bottoms with y=0`);
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

    // Create rigid bodies
    if (isSolutionMode) {
      // Solution mode: one body per mesh
      this.createBodiesFromMeshes(meshes, config);
    } else {
      // Shape mode: create bodies from instanced meshes
      this.createBodiesFromInstancedMeshes(instancedMeshes, config);
    }

    // Add environment elements
    this.addGroundPlane();

    if (config.environment.walls) {
      this.addBoundaryWalls(spheresGroup);
    }

    console.log(`✅ Rapier physics initialized with ${this.bodies.size} bodies (gravity=${gravityValue})`);
  }

  private createBodiesFromMeshes(meshes: THREE.Mesh[], config: GravityEffectConfig): void {
    const variation = config.variation ?? 0;
    const seed = config.seed ?? 42;
    const rng = seededRandom(seed);

    for (const mesh of meshes) {
      if (!(mesh.geometry instanceof THREE.SphereGeometry)) continue;

      const radius = this.getSphereRadius(mesh);
      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);

      // Apply variation
      if (variation > 0) {
        worldPos.x += (rng() - 0.5) * variation;
        worldPos.y += (rng() - 0.5) * variation;
        worldPos.z += (rng() - 0.5) * variation;
      }

      const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(worldPos.x, worldPos.y, worldPos.z);

      if (config.release.mode === 'staggered') {
        bodyDesc.setSleeping(true);
      }

      const body = this.world.createRigidBody(bodyDesc);

      const colliderDesc = this.RAPIER.ColliderDesc.ball(radius)
        .setRestitution(0.3)
        .setFriction(0.7);

      this.world.createCollider(colliderDesc, body);
      this.bodies.set(mesh.uuid, body);
    }

    console.log(`🔮 Created ${this.bodies.size} dynamic sphere bodies from meshes`);
  }

  private createBodiesFromInstancedMeshes(meshes: THREE.InstancedMesh[], config: GravityEffectConfig): void {
    const variation = config.variation ?? 0;
    const seed = config.seed ?? 42;
    const rng = seededRandom(seed);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();

    for (const imesh of meshes) {
      if (!(imesh.geometry instanceof THREE.SphereGeometry)) continue;

      const radius = this.getSphereRadius(imesh);
      const count = imesh.count;

      for (let i = 0; i < count; i++) {
        imesh.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);

        // Apply variation
        if (variation > 0) {
          position.x += (rng() - 0.5) * variation;
          position.y += (rng() - 0.5) * variation;
          position.z += (rng() - 0.5) * variation;
        }

        const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(position.x, position.y, position.z);

        if (config.release.mode === 'staggered') {
          bodyDesc.setSleeping(true);
        }

        const body = this.world.createRigidBody(bodyDesc);

        const colliderDesc = this.RAPIER.ColliderDesc.ball(radius)
          .setRestitution(0.3)
          .setFriction(0.7);

        this.world.createCollider(colliderDesc, body);

        const id = `${imesh.uuid}_${i}`;
        this.bodies.set(id, body);
        this.instancedMeshMap.set(id, { mesh: imesh, index: i });
      }
    }

    console.log(`🔮 Created ${this.bodies.size} dynamic sphere bodies from instanced meshes`);
  }

  private getSphereRadius(mesh: THREE.Mesh | THREE.InstancedMesh): number {
    if (mesh.geometry instanceof THREE.SphereGeometry) {
      const params = (mesh.geometry as any).parameters;
      if (params?.radius !== undefined) {
        return params.radius * mesh.scale.x;
      }
    }

    mesh.geometry.computeBoundingSphere();
    const bsphere = mesh.geometry.boundingSphere;
    return bsphere ? bsphere.radius * mesh.scale.x : 0.5;
  }

  step(deltaTime: number, config: GravityEffectConfig): void {
    if (!this.world) return;

    // Normalize dt to seconds if caller passes milliseconds
    if (deltaTime > 1.0) {
      deltaTime = deltaTime / 1000.0;
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

    this.bodies.forEach((body, id) => {
      const translation = body.translation();
      const rotation = body.rotation();

      position.set(translation.x, translation.y, translation.z);
      quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

      const instanceInfo = this.instancedMeshMap.get(id);
      if (instanceInfo) {
        matrix.compose(position, quaternion, scale);
        instanceInfo.mesh.setMatrixAt(instanceInfo.index, matrix);
        updatedMeshes.add(instanceInfo.mesh);
      }
    });

    updatedMeshes.forEach(mesh => {
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  private handleStaggeredRelease(deltaTime: number, config: GravityEffectConfig): void {
    this.releaseTimer += deltaTime;

    const staggerMs = (config.release.staggerMs || 150) / 1000;
    const numBatches = Math.floor(this.releaseTimer / staggerMs);

    if (numBatches === 0 || this.releasedBodies.size === this.bodies.size) return;

    const totalBodies = this.bodies.size;
    const bodiesPerBatch = Math.max(1, Math.ceil(totalBodies / 10));

    const seed = config.seed ?? 42;
    const rng = seededRandom(seed + numBatches);

    const candidates = Array.from(this.bodies.entries())
      .filter(([id]) => !this.releasedBodies.has(id));

    const toRelease = candidates
      .sort(() => rng() - 0.5)
      .slice(0, bodiesPerBatch);

    toRelease.forEach(([id, body]) => {
      body.wakeUp();
      this.releasedBodies.add(id);
    });

    if (toRelease.length > 0) {
      console.log(`🎲 Woke up ${toRelease.length} bodies (batch ${numBatches})`);
    }
  }

  dispose(spheresGroup?: THREE.Group): void {
    console.log('🧹 Rapier physics disposed');

    // Restore spheresGroup position
    if (spheresGroup) {
      spheresGroup.position.y = this.originalGroupY;
      console.log('🧹 Rapier physics disposed, spheresGroup position restored');
    }

    if (this.world) {
      this.world.free();
      this.world = null;
    }

    this.bodies.clear();
    this.releasedBodies.clear();
    this.instancedMeshMap.clear();
    this.releaseTimer = 0;
  }

  private addGroundPlane(): void {
    if (!this.world || !this.RAPIER) return;

    const groundY = -0.01;
    console.log(`🌏 Ground plane at y=${groundY}`);

    const groundDesc = this.RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, groundY, 0);
    const groundBody = this.world.createRigidBody(groundDesc);

    const groundCollider = this.RAPIER.ColliderDesc.cuboid(50, 0.01, 50);
    this.world.createCollider(groundCollider, groundBody);
  }

  private addBoundaryWalls(spheresGroup: THREE.Group): void {
    if (!this.world || !this.RAPIER) return;

    const box = new THREE.Box3().setFromObject(spheresGroup);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const margin = 5;
    const wallThickness = 0.5;
    const wallHeight = size.y + 20;

    const walls = [
      { x: box.max.x + margin, y: center.y, z: center.z, w: wallThickness, h: wallHeight, d: size.z + margin * 2 },
      { x: box.min.x - margin, y: center.y, z: center.z, w: wallThickness, h: wallHeight, d: size.z + margin * 2 },
      { x: center.x, y: center.y, z: box.max.z + margin, w: size.x + margin * 2, h: wallHeight, d: wallThickness },
      { x: center.x, y: center.y, z: box.min.z - margin, w: size.x + margin * 2, h: wallHeight, d: wallThickness },
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
}
