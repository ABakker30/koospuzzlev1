# Effects Specification (v6.0.0 Baseline)

## Purpose
Define a clean, minimal foundation for implementing standalone visual effects in the Studio (starting with Turn Table and Keyframe Animation). Each effect is self-contained, with its own configuration, modal UI, and lifecycle. Studio remains unmodified except where the effect explicitly owns state (camera, geometry).

## Effect Interface
Every effect implements this contract:
```typescript
interface Effect {
  init(ctx: EffectContext): void
  play(): void
  pause(): void
  resume(): void
  stop(): void
  dispose(): void
  tick(time: number): void
  setConfig(cfg: object): void
  getConfig(): object
}
```

**Guarantees:**
- Only one effect is active at a time.
- No globals. No Studio-wide side effects.
- Leaves geometry and camera in a state consistent with its finalization policy.
- Deterministic given (config, seed, start state).

## EffectContext
The context Studio passes into an effect:
```typescript
interface EffectContext {
  scene: THREE.Scene
  spheresGroup: THREE.Group   // sculpture
  camera: THREE.Camera
  controls: OrbitControls
  renderer: THREE.WebGLRenderer
  centroidWorld: THREE.Vector3
  time: {
    preview: { now(): number; onTick(cb); offTick(cb) }
    capture: { fixedStep: number; onFrame(cb); offFrame(cb) }
  }
  storage: {
    saveManifest(manifest: object): void
    loadManifest(id: string): object | null
  }
}
```

## Finalization Policy
Each effect declares how it ends:
- **leaveAsEnded**: leave camera/geometry at the last frame.
- **returnToStart**: restore the initial state.
- **snapToPose**: move to a designated final pose (e.g. hero frame).

## Transport Bar (global mini UI)
- **Controls**: Play ▸ | Pause ‖ | Resume ▸ | Stop ■ | Record ⬤
- **Selectors**: Quality (Low/Med/High), Format (Square/Portrait/Landscape → resolution)
- **Events**: onPlay, onPause, onResume, onStop, onRecord(config)
- Always attached to the currently active effect.

## Config Schemas

### TurnTableConfig v1
```json
{
  "schemaVersion": 1,
  "durationSec": 8.0,
  "degrees": 360,
  "direction": "cw",
  "mode": "camera",
  "easing": "linear",
  "finalize": "leaveAsEnded"
}
```

### KeyframeConfig v1
```json
{
  "schemaVersion": 1,
  "durationSec": 10.0,
  "fps": 30,
  "keys": [
    { "t": 0.0, "pos": [x,y,z], "target": [x,y,z], "fov": 45 }
  ],
  "easing": "ease-in-out",
  "loop": false,
  "finalize": "leaveAsEnded"
}
```

### CaptureOptions
```json
{
  "mode": "webm",
  "quality": "medium",
  "format": { "aspect": "landscape", "w": 1920, "h": 1080 },
  "fps": 30,
  "durationSec": 8.0
}
```

## Quality Presets
- **Low**: 0.75× scale, 1k shadows, no MSAA, ~3 Mbps encode.
- **Medium**: 1× scale, 2k shadows, FXAA, ~6–8 Mbps.
- **High**: 1–1.25× scale, 4k shadows, TAA, ~12–20 Mbps, 4K cap.
- **Physics** (if used): Low=1 substep, Med=2, High=3–4.

## Formats
- **Square (1:1)**: 1080×1080, 1440×1440, 2160×2160
- **Portrait (9:16)**: 1080×1920, 1440×2560, 2160×3840
- **Landscape (16:9)**: 1920×1080, 2560×1440, 3840×2160

## Capture Rules
- One pipeline for preview and export.
- Capture uses fixed-step scheduler (deterministic).
- Outputs WebM (VP9) or PNG sequence.
- Manifest stored in IndexedDB + entry in localStorage.

## Acceptance Criteria
- Preview vs Capture produce identical first/middle/last-frame poses.
- Low/Med/High differ only in pixels, not transforms.
- Square/Portrait/Landscape don't alter pose, only aspect.
- Cancel/export failure cleans up gracefully.
- OrbitControls disabled only during camera-mode play, restored on pause/stop.

---

**This doc becomes the north star for Windsurf: implement scaffolding, then Turn Table, then Keyframe — all under these exact contracts.**
