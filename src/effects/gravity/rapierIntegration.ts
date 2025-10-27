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
  
  // For compound bodies (solution pieces)
  private pieceMap = new Map<number, {
    bodyId: string;
    instanceIndices: number[];
    localOffsets: THREE.Vector3[];
  }>();
  private usePieces = false;
  private bondMeshes: Array<{
    mesh: THREE.Mesh;
    sphereA: THREE.Mesh;
    sphereB: THREE.Mesh;
  }> = [];
  private preJitterPositions: Map<string, THREE.Matrix4> | null = null;
  
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

    // Check if we should use compound bodies (pieces) or individual spheres
    if (config.solutionData && config.solutionData.pieces.length > 0) {
      console.log(`🧩 Solution data detected: ${config.solutionData.pieces.length} pieces`);
      this.usePieces = true;
      await this.buildCompoundBodies(config, instanced, spheresGroup);
      return; // Skip single-sphere logic
    }

    // Build bodies for instanced spheres (single-sphere mode)
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

    // Update transforms based on mode
    if (this.usePieces) {
      this.updatePieceTransforms();
    } else {
      this.updateSphereTransforms();
    }
  }

  private updateSphereTransforms(): void {
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

  private updatePieceTransforms(): void {
    const P = new THREE.Vector3();
    const Q = new THREE.Quaternion();
    const localP = new THREE.Vector3();

    this.pieceMap.forEach((pieceInfo) => {
      const body = this.bodies.get(pieceInfo.bodyId);
      if (!body) return;

      const bodyT = body.translation();
      const bodyR = body.rotation();

      if (!Number.isFinite(bodyT.x) || !Number.isFinite(bodyR.w)) {
        console.warn(`⚠️ NaN detected for piece body ${pieceInfo.bodyId}`);
        return;
      }

      P.set(bodyT.x, bodyT.y, bodyT.z);
      Q.set(bodyR.x, bodyR.y, bodyR.z, bodyR.w);

      // Update each sphere mesh in this piece
      for (let i = 0; i < pieceInfo.instanceIndices.length; i++) {
        const instIdx = pieceInfo.instanceIndices[i];
        const offset = pieceInfo.localOffsets[i];
        const map = this.instancedMap.get(`sphere_${instIdx}`);
        if (!map) continue;

        const mesh = map.mesh as THREE.Mesh;

        // Compute world transform: bodyTransform * localOffset
        localP.copy(offset).applyQuaternion(Q).add(P);

        // For regular meshes, directly update position/quaternion
        if ((mesh as any).isInstancedMesh) {
          // InstancedMesh path (original logic)
          const M = new THREE.Matrix4();
          const S = new THREE.Vector3(1, 1, 1);
          const inv = new THREE.Matrix4();
          
          M.compose(localP, Q, S);
          inv.copy(mesh.matrixWorld).invert();
          M.premultiply(inv);
          (mesh as THREE.InstancedMesh).setMatrixAt(map.index, M);
          (mesh as THREE.InstancedMesh).instanceMatrix.needsUpdate = true;
        } else {
          // Regular mesh path (new)
          mesh.position.copy(localP);
          mesh.quaternion.copy(Q);
          mesh.updateMatrix();
        }
      }
    });
    
    // Update bond meshes (cylinders connecting spheres) using stored sphere references
    this.bondMeshes.forEach((bond, index) => {
      // Use the sphere pair we identified during initialization
      const sphereA = bond.sphereA;
      const sphereB = bond.sphereB;
      
      // Update bond position (midpoint between spheres)
      bond.mesh.position.addVectors(sphereA.position, sphereB.position).multiplyScalar(0.5);
      
      // Update bond orientation (point from A to B)
      const direction = new THREE.Vector3().subVectors(sphereB.position, sphereA.position);
      direction.normalize();
      
      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction
      );
      bond.mesh.setRotationFromQuaternion(quaternion);
      
      // IMPORTANT: Keep original scale.y from pre-jitter capture (don't stretch bonds)
      // The bond length should stay constant since spheres move as a rigid body
      if (this.preJitterPositions) {
        const originalMatrix = this.preJitterPositions.get(`bond_${index}`);
        if (originalMatrix) {
          const originalScale = new THREE.Vector3();
          originalMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), originalScale);
          bond.mesh.scale.y = originalScale.y; // Keep original length
        }
      }
    });
  }

  // Public getter for instancedMap (needed by GravityEffect for frame recording)
  getInstancedMap(): Map<string, { mesh: THREE.InstancedMesh; index: number }> {
    return this.instancedMap;
  }

  // Public getter for bondMeshes (needed by GravityEffect for frame recording)
  getBondMeshes(): Array<{ mesh: THREE.Mesh; sphereA: THREE.Mesh; sphereB: THREE.Mesh }> {
    return this.bondMeshes;
  }

  // Public getter for pre-jitter positions (needed by GravityEffect for perfect reassembly)
  capturePreJitterPositions(): Map<string, THREE.Matrix4> | null {
    return this.preJitterPositions;
  }

  // Public method to apply explosion impulse to all bodies
  applyExplosion(strength: number): void {
    if (!this.world) return;
    
    // Calculate center of mass of all bodies
    const centerOfMass = new THREE.Vector3();
    let totalMass = 0;
    
    this.bodies.forEach((body) => {
      const t = body.translation();
      const mass = body.mass();
      centerOfMass.x += t.x * mass;
      centerOfMass.y += t.y * mass;
      centerOfMass.z += t.z * mass;
      totalMass += mass;
    });
    
    if (totalMass > 0) {
      centerOfMass.divideScalar(totalMass);
    }
    
    // Apply outward impulse to each body from center
    const impulseScale = strength * 0.2; // Scale strength (1-100) to impulse multiplier (20x original)
    
    this.bodies.forEach((body) => {
      const t = body.translation();
      const direction = new THREE.Vector3(t.x - centerOfMass.x, t.y - centerOfMass.y, t.z - centerOfMass.z);
      const distance = direction.length();
      
      if (distance > 0.01) { // Avoid division by zero
        direction.normalize();
        
        // Impulse magnitude inversely proportional to distance (closer = stronger push)
        const impulseMagnitude = impulseScale / Math.max(distance, 0.1); // Very sensitive to distance
        
        body.applyImpulse({
          x: direction.x * impulseMagnitude,
          y: direction.y * impulseMagnitude * 0.3, // Less vertical impulse (30%)
          z: direction.z * impulseMagnitude
        }, true);
        
        // Add some random spin
        body.applyTorqueImpulse({
          x: (Math.random() - 0.5) * impulseMagnitude * 0.1,
          y: (Math.random() - 0.5) * impulseMagnitude * 0.1,
          z: (Math.random() - 0.5) * impulseMagnitude * 0.1
        }, true);
      }
    });
    
    console.log(`💥 Applied explosion impulse to ${this.bodies.size} bodies (strength: ${strength}, center: ${centerOfMass.x.toFixed(2)}, ${centerOfMass.y.toFixed(2)}, ${centerOfMass.z.toFixed(2)})`);
  }

  // Public method to update bonds without stepping physics (for reverse playback)
  updateBonds(): void {
    if (this.bondMeshes.length === 0) return;
    
    this.bondMeshes.forEach((bond) => {
      const sphereA = bond.sphereA;
      const sphereB = bond.sphereB;
      
      // Update bond position (midpoint between spheres)
      bond.mesh.position.addVectors(sphereA.position, sphereB.position).multiplyScalar(0.5);
      
      // Update bond orientation (point from A to B)
      const direction = new THREE.Vector3().subVectors(sphereB.position, sphereA.position);
      const distance = direction.length();
      direction.normalize();
      
      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction
      );
      bond.mesh.setRotationFromQuaternion(quaternion);
      
      // Update bond scale to match distance
      bond.mesh.scale.y = distance;
      
      // Force matrix updates for rendering
      bond.mesh.updateMatrix();
      bond.mesh.updateMatrixWorld(true);
    });
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
    this.pieceMap.clear();
    this.bondMeshes = [];
    this.usePieces = false;
    this.released.clear();
    this.groundCollider = null;
    this.wallColliders = [];

    if (spheresGroup) {
      spheresGroup.position.y = this.originalGroupY;
    }
    console.log('🧹 Gravity-only physics disposed');
  }

  // --- Helpers ---

  private async buildCompoundBodies(
    config: GravityEffectConfig,
    instanced: THREE.InstancedMesh[],
    spheresGroup: THREE.Group
  ): Promise<void> {
    const solutionData = config.solutionData!;
    const radius = solutionData.radius;
    
    // Collect all sphere meshes (instanced or regular)
    const sphereMeshes: THREE.Mesh[] = [];
    spheresGroup.traverse((obj) => {
      if ((obj as any).isMesh) {
        const mesh = obj as THREE.Mesh;
        const isSphere = 
          (mesh.geometry as any)?.type === 'SphereGeometry' ||
          (mesh.geometry as any)?.parameters?.radius !== undefined;
        if (isSphere) {
          sphereMeshes.push(mesh);
        }
      }
    });

    if (sphereMeshes.length === 0) {
      console.error('❌ No sphere meshes found');
      return;
    }
    
    console.log(`📸 Found ${sphereMeshes.length} sphere meshes`);

    // Verify we have enough meshes for the solution
    const totalSpheres = solutionData.pieces.reduce((sum, p) => sum + p.spheres.length, 0);
    if (sphereMeshes.length < totalSpheres) {
      console.error(`❌ Not enough sphere meshes: need ${totalSpheres}, found ${sphereMeshes.length}`);
      return;
    }

    // Find piece groups in the scene (they contain spheres + bonds)
    const pieceGroups: THREE.Group[] = [];
    spheresGroup.traverse((obj) => {
      if (obj.name && obj.name.startsWith('PieceGroup_')) {
        pieceGroups.push(obj as THREE.Group);
      }
    });
    console.log(`🔍 Found ${pieceGroups.length} piece groups in scene`);

    // Create compound body for each piece
    let globalSphereIdx = 0;
    const P = new THREE.Vector3();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3();

    for (let pieceIdx = 0; pieceIdx < solutionData.pieces.length; pieceIdx++) {
      const piece = solutionData.pieces[pieceIdx];
      const pieceGroup = pieceGroups[pieceIdx];
      // Compute piece centroid (for body origin)
      const centroid = new THREE.Vector3();
      const worldSpheres: THREE.Vector3[] = [];
      
      for (let i = 0; i < piece.spheres.length; i++) {
        const mesh = sphereMeshes[globalSphereIdx + i];
        
        mesh.updateWorldMatrix(true, true);
        mesh.matrixWorld.decompose(P, Q, S);
        worldSpheres.push(P.clone());
        centroid.add(P);
        
        // Map mesh to "instance" index for tracking
        this.instancedMap.set(`sphere_${globalSphereIdx + i}`, { 
          mesh: mesh as any, // Store regular mesh as if it's instanced
          index: 0 // Regular meshes don't have index
        });
      }
      centroid.divideScalar(piece.spheres.length);

      // Create rigid body at centroid
      const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(centroid.x, centroid.y, centroid.z)
        .setCanSleep(true);
      const body = this.world.createRigidBody(bodyDesc);

      // Attach ball colliders for each sphere at local offset
      const localOffsets: THREE.Vector3[] = [];
      for (let i = 0; i < piece.spheres.length; i++) {
        const worldPos = worldSpheres[i];
        const localOffset = worldPos.clone().sub(centroid);
        localOffsets.push(localOffset);

        const colliderDesc = this.RAPIER.ColliderDesc.ball(radius)
          .setTranslation(localOffset.x, localOffset.y, localOffset.z)
          .setRestitution(0.05)
          .setFriction(0.7);
        this.world.createCollider(colliderDesc, body);
      }

      // Optional: Add capsule colliders for bonds
      if (piece.bonds && piece.bonds.length > 0) {
        for (const bond of piece.bonds) {
          const a = localOffsets[bond.from];
          const b = localOffsets[bond.to];
          this.addCapsuleBond(body, a, b, radius * 0.5); // Half radius for bonds
        }
      }

      // Track piece
      const bodyId = `piece_${piece.id}`;
      this.bodies.set(bodyId, body);
      
      const instanceIndices: number[] = [];
      for (let i = 0; i < piece.spheres.length; i++) {
        instanceIndices.push(globalSphereIdx + i);
      }
      
      this.pieceMap.set(piece.id, { bodyId, instanceIndices, localOffsets });
      
      // Collect bond meshes from this piece group and identify connected spheres
      if (pieceGroup) {
        const pieceSpheres: THREE.Mesh[] = [];
        const bondCandidates: THREE.Mesh[] = [];
        
        // First pass: collect all spheres and bonds
        pieceGroup.children.forEach((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            if (mesh.geometry?.type === 'SphereGeometry') {
              pieceSpheres.push(mesh);
            } else if (mesh.geometry?.type === 'CylinderGeometry') {
              bondCandidates.push(mesh);
            }
          }
        });
        
        // Second pass: for each bond, find its connected sphere pair (based on initial position)
        bondCandidates.forEach((bondMesh) => {
          // Find the TWO spheres that are closest to the bond position
          // Sort spheres by distance to bond
          const sphereDistances = pieceSpheres.map(sphere => ({
            sphere,
            distance: bondMesh.position.distanceTo(sphere.position)
          })).sort((a, b) => a.distance - b.distance);
          
          // Take the two closest spheres
          const sphereA = sphereDistances[0]?.sphere || null;
          const sphereB = sphereDistances[1]?.sphere || null;
          
          if (!sphereA || !sphereB) return;
          
          // Calculate distance from bond to midpoint of these two spheres
          const midpoint = new THREE.Vector3()
            .addVectors(sphereA.position, sphereB.position)
            .multiplyScalar(0.5);
          const minDist = bondMesh.position.distanceTo(midpoint);
          
          // Check 1: Bond must be at the midpoint
          const MIDPOINT_THRESHOLD = 0.01;
          const bondAtMidpoint = minDist < MIDPOINT_THRESHOLD;
          
          // Check 2: Sphere centers must be ~1 diameter apart (±1%)
          const sphereRadius = config.solutionData?.radius || 0.5;
          const sphereDiameter = sphereRadius * 2;
          const expectedDistance = sphereDiameter;
          const minValidDistance = expectedDistance * 0.99; // -1%
          const maxValidDistance = expectedDistance * 1.01; // +1%
          const sphereDistance = sphereA.position.distanceTo(sphereB.position);
          const validDistance = sphereDistance >= minValidDistance && sphereDistance <= maxValidDistance;
          
          if (bondAtMidpoint && validDistance) {
            console.log(`✓ Accepted bond: distance=${sphereDistance.toFixed(4)}, expected=${expectedDistance.toFixed(4)}, midpoint=${minDist.toFixed(4)}`);
            this.bondMeshes.push({
              mesh: bondMesh,
              sphereA: sphereA,
              sphereB: sphereB
            });
          } else {
            const reason = !bondAtMidpoint ? `not at midpoint (${minDist.toFixed(4)})` : `wrong distance (${sphereDistance.toFixed(4)} vs ${expectedDistance.toFixed(4)})`;
            console.log(`✗ Rejected bond: ${reason}`);
          }
        });
      }
      
      globalSphereIdx += piece.spheres.length;
    }
    
    console.log(`🔗 Collected ${this.bondMeshes.length} bond meshes for tracking`);

    // Capture pre-jitter positions of ALL meshes (spheres + bonds) BEFORE applying jitter
    this.preJitterPositions = new Map<string, THREE.Matrix4>();
    this.instancedMap.forEach((map, id) => {
      const M = new THREE.Matrix4();
      const mesh = map.mesh as any;
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(map.index, M);
      } else {
        M.compose(mesh.position, mesh.quaternion, mesh.scale);
      }
      this.preJitterPositions!.set(id, M.clone());
    });
    // Also capture bonds
    this.bondMeshes.forEach((bond, index) => {
      const M = new THREE.Matrix4();
      M.compose(bond.mesh.position, bond.mesh.quaternion, bond.mesh.scale);
      this.preJitterPositions!.set(`bond_${index}`, M.clone());
    });
    console.log(`📸 Captured ${this.preJitterPositions.size} pre-jitter positions`);

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

    console.log(`✅ Compound bodies ready: ${this.pieceMap.size} pieces, ${this.bodies.size} bodies`);
  }

  private addCapsuleBond(body: any, a: THREE.Vector3, b: THREE.Vector3, radius: number): void {
    // Midpoint
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    
    // Direction and length
    const dir = new THREE.Vector3().subVectors(b, a);
    const length = dir.length();
    if (length < 1e-6) return; // Skip zero-length bonds
    
    const halfLen = length * 0.5;
    dir.normalize();
    
    // Capsule in Rapier is along local Y axis, build rotation from Y to dir
    const quat = this.quatFromYToDir(dir);
    
    const colliderDesc = this.RAPIER.ColliderDesc.capsule(halfLen, radius)
      .setTranslation(mid.x, mid.y, mid.z)
      .setRotation(quat)
      .setRestitution(0.05)
      .setFriction(0.7);
    
    this.world.createCollider(colliderDesc, body);
  }

  private quatFromYToDir(dir: THREE.Vector3): { x: number; y: number; z: number; w: number } {
    const up = new THREE.Vector3(0, 1, 0);
    const dot = up.dot(dir);
    
    // Nearly opposite: 180° rotation around X
    if (dot < -0.999999) return { x: 1, y: 0, z: 0, w: 0 };
    
    // Nearly identical: identity
    if (dot > 0.999999) return { x: 0, y: 0, z: 0, w: 1 };
    
    // Cross product for axis
    const axis = new THREE.Vector3().crossVectors(up, dir);
    const s = Math.sqrt((1 + dot) * 2);
    const invs = 1 / s;
    
    return {
      x: axis.x * invs,
      y: axis.y * invs,
      z: axis.z * invs,
      w: s * 0.5
    };
  }

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
