## Goal
Add "Effects" dropdown to Studio. Selecting Turn Table opens the modal; confirming sets it as active in the Host; Transport Bar shows.

## Deliverables
- Effects dropdown in Studio header
- Turn Table (enabled) / Keyframe (coming soon)
- On confirm: active effect stored; bar visible; modal closes

## Acceptance Criteria
- [ ] Selection persists; safe to cancel/close without leaks
- [ ] No animation yet

## Out of Scope
- Motion, capture

## Definition of Done
- [ ] All null guards in place (no effect selected → bar hidden)
- [ ] Clean unmount if user cancels

## Manual Test
- Select Turn Table → modal → confirm → bar appears
- Cancel path leaves Studio unchanged

**Labels**: `effects`, `ui`, `studio`
