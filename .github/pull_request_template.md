## Summary
<!-- What does this PR do? Keep it short and specific. -->

- [ ] Part of milestone: v6.1.0 — Effects Foundation
- Related issues: #____, #____

## Scope
<!-- Select the primary area(s) this PR touches. -->
- [ ] Effects registry / host
- [ ] Transport Bar (UI)
- [ ] EffectContext
- [ ] Turn Table (modal/config)
- [ ] Turn Table (effect lifecycle)
- [ ] Capture Service (skeleton / encoding)
- [ ] QA / Dev tools
- [ ] Docs / Spec

## Implementation Notes
<!-- Key design choices, tradeoffs, and any deviations from the spec. -->

## Screens / Demos
<!-- Optional: short clips or screenshots. Include the Dev Tools pane if relevant. -->

## Acceptance Criteria (tick all before request for review)
- [ ] No Studio-global mutations or persistent globals (timers/listeners) from effects
- [ ] Single active effect at a time; null-safe guards in host & bar
- [ ] Transport Bar appears only when an effect is active
- [ ] Effect modal validates inputs; presets save/load work
- [ ] OrbitControls behavior matches spec (disabled during camera-mode play; restored on pause/stop)
- [ ] No camera reframe during playback; centroid fixed as target in camera-mode
- [ ] Preview and capture share the same scheduler path (if implemented here)
- [ ] IndexedDB/write paths handle failure gracefully (fallback message)
- [ ] Code paths contain TODOs only for explicitly deferred tasks

## Test Plan (manual for now)
- **Selection Flow**
  - [ ] Select Turn Table → modal opens → confirm → Transport Bar shows
  - [ ] Deselect/close modal leaves state stable (no leaks)
- **Transport Bar**
  - [ ] Play/Pause/Resume/Stop emit expected lifecycle logs (or behavior)
  - [ ] Record opens dialog honoring Quality + Format selectors
- **Quality & Format**
  - [ ] Switching Low/Med/High while **paused** does not move camera or geometry
  - [ ] Switching Square/Portrait/Landscape (and resolution) while **paused** only changes frame size
- **Capture (if included)**
  - [ ] Fixed-step loop drives frames; manifest saved to IndexedDB
  - [ ] Cancel/Failure exits cleanly and re-enables controls
- **Dev Tools**
  - [ ] Shows active effect id, centroid, pose matrices, quality/format

## Risk & Rollback
<!-- If something breaks, how do we revert or toggle off? -->

## Checklist (engineering hygiene)
- [ ] Types are precise; no `any` where avoidable
- [ ] Components are small; no mixed UI/business logic in JSX
- [ ] Event listeners removed on unmount/dispose
- [ ] No debug logs left on hot paths (limit to `DEBUG` gates)
- [ ] Updated `/docs/effects-spec.md` if contract changed
