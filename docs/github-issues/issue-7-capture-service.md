## Goal
Add a service to drive fixed-step capture and write a simple manifest (no real encoding yet).

## Deliverables
- `src/studio/CaptureService.ts`: `startCapture(options)`, `stopCapture()`, `onProgress(cb)`
- Fixed-step loop that "ticks" frames and simulates encode
- Manifest: save minimal entry to IndexedDB (or stub), list function for captures
- Record dialog wires Quality/Format selections into options (UI can remain simple)

## Acceptance Criteria
- [ ] Starting capture increments progress; cancel stops cleanly
- [ ] Manifest entry visible via a basic list

## Out of Scope
- Actual WebM/PNG encoding

## Definition of Done
- [ ] No frame-drop reliance; deterministic frame count based on fps×duration
- [ ] Handles quota/error with user-visible message

## Manual Test
- Start capture → watch progress to N frames
- Cancel mid-way → no leaks; partial manifest recorded with "state":"canceled" or similar

**Labels**: `effects`, `studio`
