## Goal
Provide a function to build the read-only EffectContext shape with preview/capture pub/sub stubs and storage stubs.

## Deliverables
- `src/studio/EffectContext.ts` with `buildEffectContext(args)` returning:
  `{ scene, spheresGroup, camera, controls, renderer, centroidWorld, time:{preview,capture}, storage }`
- `time.preview` and `time.capture` are minimal pub/sub stubs (no timers yet)
- `storage.saveManifest/loadManifest` stubbed to resolve (IndexedDB to follow later)

## Acceptance Criteria
- [ ] Studio can create the context without touching scene/camera
- [ ] No runtime errors in console

## Out of Scope
- Real clocks, encoding, DB implementation

## Definition of Done
- [ ] Types precise; no `any` if avoidable
- [ ] No mutation of Studio state

## Manual Test
- Log the returned context fields in Dev Tools
- Subscribe/unsubscribe to preview/capture events; verify no leaks

**Labels**: `effects`, `studio`
