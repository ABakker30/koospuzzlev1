## Goal
Add a compact transport bar UI with Play ▸ / Pause ‖ / Resume ▸ / Stop ■ / Record ⬤ and Quality & Format selectors. For now, emit console.log only.

## Deliverables
- `src/studio/TransportBar.tsx` (tiny horizontal bar)
- Buttons and selectors produce clear console logs
- Only visible when an effect is active (read host state)

## Acceptance Criteria
- [ ] Appears only with active effect
- [ ] All controls log actions; no scene/effect wiring yet
- [ ] Compact layout (space-saving)

## Out of Scope
- Scheduling, capture, effect calls

## Definition of Done
- [ ] Responsive at common widths; accessible focus states
- [ ] No layout shift in Studio header

## Manual Test
- Activate effect → bar appears
- Click each control; verify logs
- Deactivate effect → bar hides

**Labels**: `effects`, `ui`
