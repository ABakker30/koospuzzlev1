## Goal
Create minimal shells for the effects registry and host to manage a single active effect (by id) and render a placeholder when selected.

## Deliverables
- `src/effects/registry.ts` with `registerEffect(def)`, `getEffect(id)`, `listEffects()`
- `src/studio/EffectHost.tsx` holds `activeEffectId` and shows a placeholder card when set

## Acceptance Criteria
- [ ] Can set/clear an active effect id and see a placeholder render
- [ ] No imports from `three` in this PR
- [ ] No side effects / global state

## Out of Scope
- EffectContext, transport bar, modals, actual effect code

## Definition of Done
- [ ] Builds cleanly, lint passes
- [ ] Unit tests or simple runtime check for set/clear active id
- [ ] PR uses the provided template; checkboxes ticked

## Manual Test
- Enable a mock "select effect" button → set active id to 'turntable'
- Host displays placeholder content
- Clear active id → placeholder disappears

**Labels**: `effects`, `studio`, `ui`, `low-risk`
