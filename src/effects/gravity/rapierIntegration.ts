// rapierIntegration.ts - Simple gravity-only Rapier physics (NO LOOP)
import * as THREE from 'three';
import { GravityEffectConfig } from './types';

function getGravityValue(g: number | string): number {
  if (typeof g === 'number') return g;
  switch (g) {
    case 'low': return -4.905;
    case 'high': return -19.62;
    case 'earth':
    default: return -9.81;
  }
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s & 0xfffffff) / 0xfffffff;
  };
}

export class RapierPhysicsManager {
  private RAPIER: any = null;
  private world: any = null;

  private bodies = new Map<string, any>();
  private colliders = new Map<string, any>();
  private instancedMap = new Map<string, { mesh: THREE.InstancedMesh; index: number }>();
  
  private releaseTimer = 0;
  private released = new Set<string>();

  private originalGroupY = 0;
  private groundCollider: any = null;
  private wallColliders: any[] = [];

  async initialize(
    config: GravityEffectConfig,
    spheresGroup: THREE.Group,
    scene: THREE.Scene
  ): Promise<void> {
    console.log('🔧 Initializing SIMPLE gravity-only Rapier...');
    
    // Load Rapier
    // @ts-ignore
    const RAPIER = await import('@dimforge/rapier3d-compat');
    await RAPIER.init();
    this.RAPIER = RAPIER;
    console.log('✅ Rapier3D loaded');

    // Create world with gravity
    const gy = getGravityValue(config.gravity);
    this.world = new this.RAPIER.World({ x: 0, y: gy, z: 0 });
    console.log(`🌍 World created with gravity: ${gy}`);

    // Lift group so sphere bottoms rest at y=0
    this.originalGroupY = spheresGroup.position.y;
    const bbox = new THREE.Box3();
    spheresGroup.updateWorldMatrix(true, true);
    bbox.setFromObject(spheresGroup);
    const lift = -bbox.min.y;
    if (Number.isFinite(lift) && lift !== 0) {
      spheresGroup.position.y += lift;
      spheresGroup.updateWorldMatrix(true, true);
      console.log(`📦 Lifted spheresGroup by ${lift.toFixed(3)} (bottoms at y=0)`);
    }

    // Collect meshes
    const instanced: THREE.InstancedMesh[] = [];
    const singles: THREE.Mesh[] = [];
    spheresGroup.traverse((obj) => {
      if ((obj as any).isInstancedMesh) instanced.push(obj as THREE.InstancedMesh);
      else if ((obj as any).isMesh) singles.push(obj as THREE.Mesh);
    });

    console.log(`🔮 Found ${singles.length} regular + ${instanced.length} instanced meshes`);

    // Build bodies for instanced spheres
    const M = new THREE.Matrix4();
    const MW = new THREE.Matrix4();
    const P = new THREE.Vector3();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3();

    for (const im of instanced) {
      const isSphere =
        (im.geometry as any)?.type === 'SphereGeometry' ||
        (im.geometry as any)?.parameters?.radius !== undefined;
      if (!isSphere) continue;

      const baseR = (im.geometry as any)?.parameters?.radius ?? this.computeRadius(im.geometry);
      im.updateWorldMatrix(true, true);
      const meshScale = new THREE.Vector3();
      im.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), meshScale);
      const r = baseR * Math.max(meshScale.x, meshScale.y, meshScale.z);

      console.log(`🎨 Processing ${im.count} sphere instances (radius=${r.toFixed(3)})...`);

      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, M);
        MW.multiplyMatrices(im.matrixWorld, M);
        MW.decompose(P, Q, S);

        const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(P.x, P.y, P.z)
          .setRotation(Q)
          .setCanSleep(true);
        const body = this.world.createRigidBody(bodyDesc);

        const colliderDesc = this.RAPIER.ColliderDesc.ball(r)
          .setRestitution(0.05)
          .setFriction(0.7);
        const collider = this.world.createCollider(colliderDesc, body);

        const id = `${im.uuid}_${i}`;
        this.bodies.set(id, body);
        this.colliders.set(id, collider);
        this.instancedMap.set(id, { mesh: im, index: i });
      }
    }

    // Optional: regular meshes
    for (const m of singles) {
      const isSphere =
        (m.geometry as any)?.type === 'SphereGeometry' ||
        (m.geometry as any)?.parameters?.radius !== undefined;
      if (!isSphere) continue;

      m.updateWorldMatrix(true, true);
      m.matrixWorld.decompose(P, Q, S);
      const r =
        ((m.geometry as any)?.parameters?.radius ?? this.computeRadius(m.geometry)) *
        Math.max(S.x, S.y, S.z);

      const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(P.x, P.y, P.z)
        .setRotation(Q)
        .setCanSleep(true);
      const body = this.world.createRigidBody(bodyDesc);

      const colliderDesc = this.RAPIER.ColliderDesc.ball(r)
        .setRestitution(0.05)
        .setFriction(0.7);
      const collider = this.world.createCollider(colliderDesc, body);

      this.bodies.set(m.uuid, body);
      this.colliders.set(m.uuid, collider);
    }

    // Apply variation (xz jitter)
    if (config.variation && config.variation > 0) {
      const rng = seededRandom(config.seed ?? 1);
      const amp = config.variation * 0.1;
      this.bodies.forEach((b) => {
        const t = b.translation();
        b.setTranslation(
          { x: t.x + (rng() - 0.5) * amp, y: t.y, z: t.z + (rng() - 0.5) * amp },
          true
        );
      });
      console.log(`✨ Applied variation jitter (amp=${amp.toFixed(3)})`);
    }

    // Ground
    this.addGround();

    // Optional walls
    if (config.environment?.walls) {
      this.addWalls(spheresGroup);
    }

    console.log(`✅ Gravity-only physics ready: ${this.bodies.size} bodies, gravity=${gy}`);
  }

  step(dt: number, config: GravityEffectConfig, _scene: THREE.Scene, _progress: number): void {
    if (!this.world) return;

    // Normalize dt
    if (dt > 1.0) dt = dt / 1000.0;
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;

    // Staggered or all-at-once release
    if (config.release?.mode === 'staggered') {
      this.handleStaggered(dt, config);
    } else if (this.released.size === 0 && this.bodies.size > 0) {
      // All at once: mark all as released
      this.bodies.forEach((_b, id) => this.released.add(id));
    }

    // Step world
    this.world.step();

    // Push transforms to instanced meshes (world → mesh-local)
    const touched = new Set<THREE.InstancedMesh>();
    const inv = new THREE.Matrix4();
    const M = new THREE.Matrix4();
    const P = new THREE.Vector3();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3(1, 1, 1);

    this.bodies.forEach((b, id) => {
      const map = this.instancedMap.get(id);
      if (!map) return;

      const t = b.translation();
      const r = b.rotation();
      if (!Number.isFinite(t.x) || !Number.isFinite(r.w)) {
        console.warn(`⚠️ NaN detected for body ${id.slice(-8)}`);
        return;
      }

      P.set(t.x, t.y, t.z);
      Q.set(r.x, r.y, r.z, r.w);
      M.compose(P, Q, S);

      // World → mesh-local
      inv.copy(map.mesh.matrixWorld).invert();
      M.premultiply(inv);

      map.mesh.setMatrixAt(map.index, M);
      touched.add(map.mesh);
    });

    touched.forEach((im) => (im.instanceMatrix.needsUpdate = true));
  }

  dispose(spheresGroup?: THREE.Group): void {
    if (this.world) {
      try {
        this.world.free();
      } catch {}
      this.world = null;
    }
    this.bodies.clear();
    this.colliders.clear();
    this.instancedMap.clear();
    this.released.clear();
    this.groundCollider = null;
    this.wallColliders = [];

    if (spheresGroup) {
      spheresGroup.position.y = this.originalGroupY;
    }
    console.log('🧹 Gravity-only physics disposed');
  }

  // --- Helpers ---

  private computeRadius(geom: THREE.BufferGeometry): number {
    if (!geom.boundingSphere) geom.computeBoundingSphere();
    return geom.boundingSphere ? geom.boundingSphere.radius : 0.5;
  }

  private addGround(): void {
    if (!this.world || !this.RAPIER) return;
    const rb = this.world.createRigidBody(
      this.RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.01, 0)
    );
    this.groundCollider = this.world.createCollider(
      this.RAPIER.ColliderDesc.cuboid(50, 0.01, 50),
      rb
    );
    console.log('🌏 Ground added at y=-0.01');
  }

  private addWalls(group: THREE.Group): void {
    if (!this.world || !this.RAPIER) return;
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const m = 5;
    const t = 0.5;
    const h = Math.max(10, size.y + 20);

    const walls = [
      { x: box.max.x + m, y: center.y, z: center.z, sx: t, sy: h / 2, sz: size.z / 2 + m },
      { x: box.min.x - m, y: center.y, z: center.z, sx: t, sy: h / 2, sz: size.z / 2 + m },
      { x: center.x, y: center.y, z: box.max.z + m, sx: size.x / 2 + m, sy: h / 2, sz: t },
      { x: center.x, y: center.y, z: box.min.z - m, sx: size.x / 2 + m, sy: h / 2, sz: t },
    ];

    for (const w of walls) {
      const rb = this.world.createRigidBody(
        this.RAPIER.RigidBodyDesc.fixed().setTranslation(w.x, w.y, w.z)
      );
      const col = this.world.createCollider(
        this.RAPIER.ColliderDesc.cuboid(w.sx, w.sy, w.sz),
        rb
      );
      this.wallColliders.push(col);
    }
    console.log(`🧱 Added ${walls.length} boundary walls`);
  }

  private handleStaggered(dt: number, cfg: GravityEffectConfig): void {
    this.releaseTimer += dt;
    const stag = (cfg.release.staggerMs ?? 150) / 1000;
    const batches = Math.floor(this.releaseTimer / stag);
    if (batches <= 0) return;
    this.releaseTimer -= batches * stag;

    const total = this.bodies.size;
    const per = Math.max(1, Math.ceil(total / 10));
    const rng = seededRandom((cfg.seed ?? 1) + Math.floor(per + this.releaseTimer * 1000));
    const candidates = Array.from(this.bodies.keys()).filter((id) => !this.released.has(id));
    if (candidates.length === 0) return;

    candidates.sort(() => rng() - 0.5);
    const slice = candidates.slice(0, per);
    for (const id of slice) {
      const b = this.bodies.get(id);
      if (b && b.isSleeping && b.isSleeping()) b.wakeUp();
      this.released.add(id);
    }
    console.log(`🎲 Woke ${slice.length}/${total} (released=${this.released.size})`);
  }
}
