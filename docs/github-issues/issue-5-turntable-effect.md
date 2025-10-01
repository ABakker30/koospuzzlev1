## Goal
Implement TurnTableEffect.ts with full interface and no-op behavior, caching context references safely.

## Deliverables
- `effects/turntable/TurnTableEffect.ts` implementing:
  - `init`, `play`, `pause`, `resume`, `stop`, `dispose`, `tick`, `setConfig`, `getConfig`
- Logs lifecycle transitions; no scene/camera changes

## Acceptance Criteria
- [ ] Lifecycle calls succeed without errors or leaks
- [ ] No geometry/camera modifications

## Out of Scope
- Rotation math, pivot creation

## Definition of Done
- [ ] Verified dispose removes listeners/timers (none yet)
- [ ] Config round-trips via setConfig/getConfig

## Manual Test
- Instantiate effect; call lifecycle methods in order
- Ensure no camera/mesh changes occur

**Labels**: `effects`
