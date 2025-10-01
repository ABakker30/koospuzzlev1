# Contributing — Effects Workstream (v6.x)

This repo's Studio supports a pluggable effects system. Each effect is a **standalone module** with its own config modal, lifecycle, and deterministic tick loop. The Studio remains unmodified except where an effect explicitly owns state (camera/geometry) per the spec.

## Branching & Versioning
- Branch names: `feature/effects-foundation`, `feat/effects-turntable-v1`, `feat/effects-capture-skeleton`, etc.
- Small PRs (≤ ~300 lines net) > large PRs. One concern per PR.
- Tags:
  - `v6.1.0-alpha` — UI scaffolding (registry, host, bar, context, modal)
  - `v6.1.0-beta` — Turn Table motion + capture plumbing
  - `v6.1.0` — QA pass complete

## Effect Contracts (must read)
- **Interface**: `init(ctx)`, `play()`, `pause()`, `resume()`, `stop()`, `dispose()`, `tick(t)`, `setConfig(cfg)`, `getConfig()`
- **Context**: read-only handles (scene, spheresGroup, camera, controls, renderer, centroidWorld, time, storage)
- **Finalization policy**: `leaveAsEnded | returnToStart | snapToPose`
- **Determinism**: preview and capture must produce identical poses for the same `(t, config, seed, startState)`

See `/docs/effects-spec.md` for full details.

## Project Layout

```
src/
├── effects/
│   ├── registry.ts
│   ├── turntable/
│   │   ├── TurnTableEffect.ts
│   │   └── TurnTableModal.tsx
│   ├── keyframe/          # coming soon
│   └── shared/            # tiny math/validation/easing
├── studio/
│   ├── EffectHost.tsx
│   ├── TransportBar.tsx
│   ├── EffectContext.ts
│   └── CaptureService.ts
├── services/storage/
│   └── LocalCaptures.ts
└── docs/
    └── effects-spec.md
```

## Coding Guidelines
- **No globals**. No Studio-wide side effects. One active effect at a time.
- **Ownership**:
  - Camera-mode: effect may disable OrbitControls during **play**; must re-enable on pause/stop.
  - Object-mode: never disable OrbitControls.
  - Use a **single pivot/group** at the centroid; do not scale; do not "fit to view" during playbook.
- **Schedulers**:
  - Preview clock: clamped real-time
  - Capture clock: fixed-step (deterministic)
  - Both call the same `tick(t)` path; easing has to match exactly.
- **Quality & Format**:
  - Quality affects **pixels** only (resolution scale, shadows, AA), not transforms.
  - Format (Square/Portrait/Landscape) changes aspect/resolution only, not camera/object pose.
- **Storage**:
  - Use IndexedDB for binary (WebM/PNG); keep a small manifest index (localStorage or IndexedDB).
  - Handle quota errors and provide clear messages.

## PR Expectations
- Follow `.github/pull_request_template.md`.
- Include at least one short screen capture or screenshot of the feature where relevant.
- Demonstrate that **pause → format/quality change → resume** does not alter poses.
- Ensure all **event listeners** and **timers** are torn down on unmount/dispose.
- If you change any contract: update `/docs/effects-spec.md` in the same PR.

## Manual Test Matrix (minimum)
| Mode     | Quality | Format                 | Expected                                           |
|----------|---------|------------------------|---------------------------------------------------|
| Preview  | L/M/H   | Square/Portrait/Land. | UI responsive; poses stable on selector changes   |
| Record   | L/M/H   | Square/Portrait/Land. | Progress ticks; manifest saved; cancel is clean   |

## Common Pitfalls
- Reframing or re-targeting the camera during playback
- Leaving OrbitControls disabled after stop
- Variable-step physics/animation sneaking into capture
- Format/quality switches that accidentally mutate transforms
- Event listeners on `window`/`document` not removed on dispose

## Review Checklist (for maintainers)
- Effect code is fully encapsulated; no cross-module leaks
- Deterministic `tick` path; same results preview vs capture
- IndexedDB errors are handled with visible user feedback
- Dev Tools panel shows stable centroid and pose data
- Spec is updated if behavior diverges

Thanks for contributing! Keep PRs small, deterministic, and spec-aligned. 🙌
