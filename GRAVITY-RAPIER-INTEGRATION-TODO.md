# Gravity Effect - Rapier Physics Integration TODO

## ✅ Completed
- [x] Modal UI with all configuration options
- [x] Rounded corner fix (header/content/footer structure)
- [x] Effect registration in effects dropdown
- [x] Database storage type added ('gravity' to EffectType)
- [x] Rapier3D added to package.json (v0.11.2)
- [x] Break threshold calculations (physics-accurate formulas)
- [x] Effect lifecycle methods (init, play, pause, tick, dispose)

## 🚀 Next Steps to Complete Integration

### 1. Install Rapier
```bash
npm install
```

This will install `@dimforge/rapier3d@^0.11.2`.

### 2. Initialize Rapier in GravityEffect

Update `src/effects/gravity/GravityEffect.ts`:

```typescript
import RAPIER from '@dimforge/rapier3d';

private async initializePhysics(): Promise<void> {
  // Wait for RAPIER to initialize
  await RAPIER.init();
  
  // Create physics world with gravity
  const gravityValue = getGravityValue(this.config.gravity);
  this.world = new RAPIER.World({ x: 0, y: gravityValue, z: 0 });
  
  // Get sphere meshes from spheresGroup
  const sphereMeshes: THREE.Mesh[] = [];
  this.spheresGroup.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh) {
      sphereMeshes.push(child);
    }
  });
  
  // Create rigid bodies for each sphere
  for (const mesh of sphereMeshes) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
      .setRotation(mesh.quaternion);
    
    const body = this.world.createRigidBody(bodyDesc);
    
    // Assume spheres have same radius (or extract from geometry)
    const radius = 0.5; // TODO: Get from mesh geometry
    const colliderDesc = RAPIER.ColliderDesc.ball(radius)
      .setDensity(1.0)
      .setRestitution(0.3)
      .setFriction(0.5);
    
    this.world.createCollider(colliderDesc, body);
    
    // Store mapping between mesh and body
    this.bodies.set(mesh.uuid, body);
  }
  
  // Create fixed joints between connected spheres
  // TODO: Determine which spheres are connected (from bonds/cylinders)
  
  // Add ground plane if enabled
  if (this.config.environment.ground) {
    const groundDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, -10, 0); // Adjust based on puzzle bounds
    const groundBody = this.world.createRigidBody(groundDesc);
    
    const groundCollider = RAPIER.ColliderDesc.cuboid(50, 0.1, 50);
    this.world.createCollider(groundCollider, groundBody);
  }
  
  // Add boundary walls if enabled
  if (this.config.environment.walls) {
    // TODO: Calculate AABB of puzzle
    // Create 4 wall colliders
  }
  
  // Calculate break thresholds if auto-break enabled
  if (this.config.autoBreak.enabled) {
    const gAbs = Math.abs(gravityValue);
    this.breakThresholds = computeJointThresholds(
      this.config.autoBreak.level,
      gAbs,
      (body) => 0.5, // TODO: Get actual radius
      this.world.bodies,
      this.joints
    );
  }
}
```

### 3. Implement Physics Step

```typescript
private updatePhysics(): void {
  if (!this.world) return;
  
  // Step the physics simulation
  this.world.step();
  
  // Update Three.js meshes from physics bodies
  this.bodies.forEach((body, meshId) => {
    const mesh = this.scene.getObjectByProperty('uuid', meshId) as THREE.Mesh;
    if (mesh && body) {
      const position = body.translation();
      const rotation = body.rotation();
      
      mesh.position.set(position.x, position.y, position.z);
      mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    }
  });
  
  // Check for joint breaks if auto-break enabled
  if (this.config.autoBreak.enabled && this.breakThresholds) {
    const broken = breakJointsIfExceeded(
      this.world,
      this.joints,
      this.breakThresholds,
      (joint) => {
        console.log('🔨 Joint broke!');
        // Optional: emit break event for audio/particles
      }
    );
    
    if (broken > 0) {
      // Remove broken joints from array
      this.joints = this.joints.filter(j => this.world.impulseJoints.contains(j.handle));
    }
  }
}
```

### 4. Implement Staggered Release

```typescript
private releaseTimer = 0;
private releasedBodies = new Set<string>();

private handleStaggeredRelease(deltaTime: number): void {
  if (this.config.release.mode !== 'staggered') return;
  
  this.releaseTimer += deltaTime * 1000; // Convert to ms
  
  const staggerMs = this.config.release.staggerMs || 150;
  const numBatches = Math.floor(this.releaseTimer / staggerMs);
  const totalBodies = this.bodies.size;
  const bodiesPerBatch = Math.ceil(totalBodies / 10); // Release in ~10 batches
  
  // Seed random for deterministic release order
  const rng = seededRandom(this.config.seed + numBatches);
  
  // Pick bodies to release this batch
  const bodiesToRelease = Array.from(this.bodies.keys())
    .filter(id => !this.releasedBodies.has(id))
    .sort(() => rng() - 0.5)
    .slice(0, bodiesPerBatch);
  
  bodiesToRelease.forEach(id => {
    const body = this.bodies.get(id);
    if (body && body.isKinematic()) {
      body.setBodyType(RAPIER.RigidBodyType.Dynamic);
      this.releasedBodies.add(id);
    }
  });
}
```

### 5. Detect Connected Spheres

You need to identify which spheres are connected by looking at the bond cylinders:

```typescript
private detectConnections(): Map<string, string[]> {
  const connections = new Map<string, string[]>();
  
  // Find all cylinder meshes (bonds)
  const cylinders: THREE.Mesh[] = [];
  this.scene.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh && 
        child.geometry instanceof THREE.CylinderGeometry) {
      cylinders.push(child);
    }
  });
  
  // For each cylinder, find the two closest spheres
  // Those are the connected pair
  // Create a fixed joint between them
  
  return connections;
}
```

### 6. Add Variation Jitter

```typescript
private applyVariation(): void {
  if (this.config.variation === 0) return;
  
  const rng = seededRandom(this.config.seed);
  
  this.bodies.forEach((body) => {
    // Add small random offset to initial position
    const jitter = this.config.variation * 0.1; // Scale jitter
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
}
```

### 7. Seeded Random Helper

```typescript
// Add to types.ts or utils
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}
```

## 🧪 Testing Checklist

After integration:

- [ ] Bodies fall with correct gravity (Earth/Moon/Micro)
- [ ] All at once: All pieces release simultaneously
- [ ] Staggered: Pieces release in batches with correct timing
- [ ] Auto-break Low: Pieces break easily on contact
- [ ] Auto-break Medium: Balanced breaking
- [ ] Auto-break High: Only breaks on hard impacts
- [ ] Ground plane: Pieces land and stack
- [ ] Boundary walls: Pieces don't fly off screen
- [ ] Variation: Different initial jitter with different seeds
- [ ] Same seed = same animation every time
- [ ] Custom gravity values work correctly
- [ ] Duration setting controls total simulation time
- [ ] Play/pause/resume/stop work correctly
- [ ] Recording captures physics simulation
- [ ] Disposal cleans up all Rapier resources

## 📊 Performance Tips

- Physics substeps: Use 2-4 substeps for accuracy without lag
- Sleep bodies: Let Rapier sleep static bodies automatically
- Spatial partitioning: Rapier handles this automatically
- Batch operations: Update all meshes in one loop
- Memory: Clean up properly in dispose()

## 🐛 Common Issues

### Issue: Bodies fall through ground
**Fix**: Increase ground collider thickness or adjust position

### Issue: Joints break immediately
**Fix**: Increase break level or check mass calculations

### Issue: Simulation is jittery
**Fix**: Add physics substeps or reduce timestep

### Issue: Memory leak
**Fix**: Ensure all bodies/colliders/joints are removed in dispose()

### Issue: Performance drops
**Fix**: Reduce number of active bodies or use simplified colliders

## 📝 Next PR Checklist

- [ ] Run `npm install` to get Rapier
- [ ] Implement `initializePhysics()`
- [ ] Implement `updatePhysics()`
- [ ] Add connection detection from bond cylinders
- [ ] Add staggered release logic
- [ ] Add variation jitter
- [ ] Test all gravity presets
- [ ] Test all break levels
- [ ] Test with different puzzle sizes
- [ ] Verify memory cleanup
- [ ] Add unit tests for break calculations
- [ ] Document Rapier version in ARCHITECTURE.md

## 🎯 Entry Point

Start here: `src/effects/gravity/GravityEffect.ts` line ~191 (`initializePhysics()`)

The structure is ready, just needs the Rapier implementation filled in!
