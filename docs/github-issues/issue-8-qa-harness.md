## Goal
Add a collapsible QA panel (bottom-right) to display active effect id, centroid, quality/format, and current camera/object matrices.

## Deliverables
- Small toggleable pane (can hide behind `?dev=1` flag)
- Print JSON snapshots suitable for copy/paste into bug reports

## Acceptance Criteria
- [ ] Zero interference with Studio interactions
- [ ] Safe to ship (hidden by default)

## Out of Scope
- Any scene mutation

## Definition of Done
- [ ] Works across all pages that mount Studio
- [ ] No persistent logs in production

## Manual Test
- Toggle on → verify values update during play/pause
- Toggle off → no perf impact

**Labels**: `needs-QA`, `studio`
