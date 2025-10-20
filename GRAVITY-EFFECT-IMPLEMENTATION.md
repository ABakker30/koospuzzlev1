# Gravity Effect - Implementation Guide

## 🌍 Overview

The Gravity effect is a physics-based simulation that applies realistic gravity to puzzle pieces with optional auto-break joints. This creates dramatic falling, crumbling, and collapsing animations.

## ✨ Features

### 🎛️ Configuration Options

1. **Duration** (1-20 seconds)
   - Total simulation time

2. **Gravity Presets**
   - **Earth**: -9.81 m/s² (standard gravity)
   - **Moon**: -1.62 m/s² (1/6th of Earth)
   - **Micro**: -0.2 m/s² (near weightless)
   - **Custom**: -50 to 0 m/s² (any value)

3. **Release Mode**
   - **All at once**: All pieces become dynamic simultaneously
   - **Staggered**: Pieces release in random batches
     - Stagger time: 0-1000ms between batches

4. **Auto-Break** (Optional)
   - **Enabled/Disabled**: Toggle joint breaking
   - **Break Level**: Controls break strength
     - **Low** (1.5× weight): Breaks easily, dramatic crumbling
     - **Medium** (3× weight): Balanced, realistic breaking
     - **High** (6× weight): Holds tight, only breaks on impact

5. **Environment**
   - **Ground plane**: Adds floor collision
   - **Boundary walls**: Adds invisible walls sized to AABB

6. **Variation** (0-1)
   - Adds random jitter to start poses and release order
   - 0 = perfectly deterministic
   - 1 = maximum randomness

7. **Seed**
   - Random seed for deterministic replays
   - Same seed = same animation every time

## 📐 Physics-Based Break Thresholds

The auto-break system uses **physics-accurate calculations** based on:

### Formula
For each joint connecting spheres i and j:

```
m̄ = (mᵢ + mⱼ) / 2        // Average mass
F_base = m̄ × g             // Base force from weight
F_th = k × F_base           // Force threshold (k = level multiplier)
τ_th = F_th × r_eff         // Torque threshold (r = average radius)
```

### Level Multipliers & Clamps

| Level  | Multiplier (k) | F_min | F_max  | Behavior              |
|--------|----------------|-------|--------|-----------------------|
| Low    | 1.5×           | 1     | 5,000  | Crumbles easily       |
| Medium | 3.0×           | 2     | 10,000 | Balanced, realistic   |
| High   | 6.0×           | 5     | 20,000 | Holds until impact    |

### Why This Works
- **Mass-scaled**: Heavier pieces have stronger joints
- **Radius-scaled**: Larger spheres have higher torque limits
- **Gravity-aware**: Adapts to Earth/Moon/Micro presets
- **Clamped**: Prevents extremes on tiny or massive shapes

### Runtime Break Check
Each physics step:
1. Get joint reaction force and torque
2. If `|F| > F_th` or `|τ| > τ_th`, remove joint
3. Emit "break" event (for audio/camera shake)

## 📁 File Structure

```
src/effects/gravity/
  ├── types.ts                  # Config types, defaults, validation
  ├── GravityModal.tsx          # UI configuration modal
  ├── GravityEffect.ts          # Effect runtime (placeholder for Rapier)
  ├── breakThresholds.ts        # Physics-based break calculations
  └── index.ts                  # Exports
```

## 🔧 Implementation Status

### ✅ Completed
- [x] Type definitions with GravityPreset support
- [x] Configuration modal with all controls
- [x] Validation (JavaScript, zod-free)
- [x] Break threshold calculations
- [x] Effect registry integration
- [x] Default presets
- [x] Physics-accurate formulas

### 🚧 TODO (Rapier Integration)
- [ ] Initialize Rapier physics world
- [ ] Create rigid bodies from sphere meshes
- [ ] Create fixed joints between connected spheres
- [ ] Calculate break thresholds from body masses/radii
- [ ] Step physics simulation
- [ ] Check and break joints based on thresholds
- [ ] Update Three.js meshes from physics bodies
- [ ] Implement staggered release
- [ ] Add ground plane and boundary walls
- [ ] Apply variation jitter

## 🎬 Usage

### 1. Select Effect
In Content Studio:
1. Load a puzzle solution
2. Click "Effects" dropdown
3. Select "Gravity"

### 2. Configure
The Gravity settings modal appears with:
- Duration slider
- Gravity preset dropdown
- Release mode options
- Auto-break toggle and level
- Environment checkboxes
- Variation slider
- Seed input

### 3. Save & Play
- Click "Save" to apply configuration
- Effect is ready for play/record

## 💾 Data Persistence

### Storage Format
Gravity configs are stored as JSON blobs:

```json
{
  "v": 1,
  "durationSec": 6,
  "gravity": "earth",
  "release": {
    "mode": "staggered",
    "staggerMs": 150
  },
  "autoBreak": {
    "enabled": true,
    "level": "medium"
  },
  "environment": {
    "ground": true,
    "walls": true
  },
  "variation": 0.25,
  "seed": 42
}
```

### Save/Load (Existing System)
Uses the same storage mechanism as other effects:

```typescript
// Save
await saveEffectConfig(shapeId, "gravity", config);

// Load
const config = await loadEffectConfig(shapeId, "gravity");
```

No new database tables needed - just stores JSON by `effectId="gravity"`.

## 🧪 Testing

### Unit Tests Needed

```typescript
// tests/effects/gravity/config.test.ts
test('default config is valid', () => {
  expect(validateGravityConfig(DEFAULT_GRAVITY)).toBe(true);
});

test('custom gravity within bounds', () => {
  const config = { ...DEFAULT_GRAVITY, gravity: { custom: -25 } };
  expect(validateGravityConfig(config)).toBe(true);
});

test('rejects invalid duration', () => {
  const config = { ...DEFAULT_GRAVITY, durationSec: 50 };
  expect(validateGravityConfig(config)).toBe(false);
});

// tests/effects/gravity/breakThresholds.test.ts
test('computes thresholds for low/med/high', () => {
  // Mock bodies with known masses
  // Verify F_th and τ_th calculations
});

test('clamps to min/max', () => {
  // Test tiny and huge masses
  // Verify clamping behavior
});
```

### Integration Tests

```typescript
// tests/effects/gravity/integration.test.ts
test('selecting gravity opens modal with defaults', () => {
  // Select gravity from dropdown
  // Verify modal shows DEFAULT_GRAVITY values
});

test('saving and reloading preserves config', () => {
  // Save custom config
  // Reload
  // Verify all fields match
});

test('deterministic replay with same seed', () => {
  // Run twice with seed=42
  // Verify identical frame sequences
});
```

## 🎯 Example Configurations

### Quick Collapse
```typescript
{
  v: 1,
  durationSec: 3,
  gravity: "earth",
  release: { mode: "all" },
  autoBreak: { enabled: true, level: "low" },
  environment: { ground: true, walls: true },
  variation: 0.1,
  seed: 123
}
```

### Slow Moon Crumble
```typescript
{
  v: 1,
  durationSec: 12,
  gravity: "moon",
  release: { mode: "staggered", staggerMs: 300 },
  autoBreak: { enabled: true, level: "medium" },
  environment: { ground: true, walls: false },
  variation: 0.5,
  seed: 456
}
```

### Weightless Drift (No Break)
```typescript
{
  v: 1,
  durationSec: 10,
  gravity: "micro",
  release: { mode: "staggered", staggerMs: 500 },
  autoBreak: { enabled: false, level: "medium" },
  environment: { ground: false, walls: true },
  variation: 0.8,
  seed: 789
}
```

### Custom Heavy Gravity
```typescript
{
  v: 1,
  durationSec: 5,
  gravity: { custom: -25 },
  release: { mode: "all" },
  autoBreak: { enabled: true, level: "high" },
  environment: { ground: true, walls: true },
  variation: 0.2,
  seed: 42
}
```

## 🚀 Next Steps

### Phase 1: Basic Physics (Next PR)
1. Install/setup Rapier3D
2. Create world with gravity vector
3. Build rigid bodies from sphere meshes
4. Create fixed joints between neighbors
5. Step simulation
6. Update Three.js from physics

### Phase 2: Auto-Break (Following PR)
1. Import break threshold functions
2. Calculate thresholds after building joints
3. Store force estimates per joint
4. Check thresholds each step
5. Remove broken joints
6. Emit break events

### Phase 3: Polish (Final PR)
1. Implement staggered release with RNG
2. Add ground plane and boundary walls
3. Apply variation jitter to start poses
4. Test with various shape sizes
5. Tune clamps if needed
6. Add audio/camera shake on breaks

## 📊 Performance Notes

### Physics Cost
- **Rapier world step**: ~1-5ms per frame (depends on complexity)
- **Joint count**: Linear with sphere connections
- **Break checks**: O(n) per step where n = # of joints

### Optimization Tips
- Use Rapier's built-in spatial partitioning
- Only check joints that still exist
- Batch break removals
- Consider physics substeps for accuracy

### Memory
- **Rigid body**: ~200 bytes each
- **Joint**: ~100 bytes each
- **World**: ~10KB base + bodies + joints

For typical puzzle (50 spheres, 150 joints):
- Bodies: 10KB
- Joints: 15KB
- Total: ~25KB physics state

## 🎓 Learning Resources

### Rapier3D
- Docs: https://rapier.rs/docs/
- JS API: https://rapier.rs/javascript3d/classes/World.html

### Physics Concepts
- **Rigid body dynamics**: Bodies have mass, velocity, angular velocity
- **Joints**: Constraints that connect bodies
- **Reaction forces**: Forces applied by constraints
- **Break thresholds**: Max force/torque before joint fails

### Tuning Break Levels
- Run test with known shape (e.g., 4×4×4 cube)
- Observe at Low/Med/High
- Low should crumble immediately
- High should only break on hard impact
- Adjust multipliers/clamps if needed

## 🔮 Future Enhancements

### Possible Additions
- [ ] **Material properties**: Different break strengths per piece
- [ ] **Particle effects**: Dust/sparks on break
- [ ] **Audio**: Break sounds, collision sounds
- [ ] **Camera shake**: Reactive to breaks
- [ ] **Slow motion**: Time dilation on dramatic moments
- [ ] **Replay control**: Scrub through simulation
- [ ] **Export physics**: Save simulation as animation

### Advanced Physics
- [ ] **Soft body joints**: Springy connections
- [ ] **Friction/restitution**: Per-body material properties
- [ ] **Wind forces**: Apply external forces
- [ ] **Buoyancy**: Underwater effects

## 📝 Version History

### v1.0 (Current - Scaffolding)
- ✅ Type definitions
- ✅ Configuration modal
- ✅ Break threshold calculations
- ✅ Effect registry
- ⏳ Rapier integration (pending)

### v1.1 (Planned - Basic Physics)
- Rapier world initialization
- Body/joint creation
- Basic simulation

### v1.2 (Planned - Auto-Break)
- Break threshold application
- Joint removal on exceed
- Break event system

### v1.3 (Planned - Polish)
- Staggered release
- Environment (ground/walls)
- Variation jitter
- Production-ready

## 🤝 Contributing

When implementing Rapier integration:

1. **Reference other effects** (Explosion, Turntable) for patterns
2. **Use existing context** (scene, spheresGroup, camera, controls)
3. **Follow Effect interface** (init, play, pause, tick, dispose)
4. **Test incrementally** (bodies → joints → break → release)
5. **Document as you go** (add TODOs, explain tricky parts)

## 📞 Support

Questions about:
- **Configuration**: See GravityModal.tsx
- **Break physics**: See breakThresholds.ts
- **Effect lifecycle**: See GravityEffect.ts
- **Integration**: See registry.ts

The gravity effect is **production-ready for UI/config**, pending Rapier physics integration.
