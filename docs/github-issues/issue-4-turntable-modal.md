## Goal
Add a floating modal for Turn Table parameters with client-side validation and local preset save/load.

## Deliverables
- `effects/turntable/TurnTableModal.tsx` with fields:
  - `durationSec`, `degrees`, `direction(cw|ccw)`, `mode(camera|object)`, `easing`, `finalize`
- Validation & friendly messages
- Preset save/load (localStorage)

## Acceptance Criteria
- [ ] Modal opens/closes; invalid input blocked with clear hints
- [ ] Presets round-trip (save → list → load)

## Out of Scope
- Effect instantiation, animation

## Definition of Done
- [ ] Keyboard-accessible modal
- [ ] No Studio mutations

## Manual Test
- Open modal, try bad values → see validation
- Save preset; reload page; load preset

**Labels**: `effects`, `ui`
