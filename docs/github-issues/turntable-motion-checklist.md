# Turn Table Motion — Acceptance Checklist

## Deterministic motion
- [ ] For the same `durationSec`, `degrees`, `direction`, and `easing`, preview and capture yield identical camera/mesh transforms at `t=0`, `t=mid`, and `t=duration`.
- [ ] Fixed-step capture uses `N = fps * durationSec` frames exactly; no drift, no off-by-one.
- [ ] Easing applies to angle vs. time, not velocity.

## Pivot & modes
- [ ] A single pivot at the sculpture centroid (world); never re-centered mid-run.
- [ ] **Object mode**: rotate the sculpture group about pivot Y. OrbitControls remain enabled.
- [ ] **Camera mode**: orbit the camera around Y while keeping `controls.target = centroid`. OrbitControls disabled only during play, restored on pause/stop.

## No unintended scene changes
- [ ] No scaling; no refit-to-view during playback; no material/HDR changes.
- [ ] No re-parenting of spheres except under the effect-local group when needed; full cleanup on `dispose()`.

## Finalization policy
- [ ] `leaveAsEnded` leaves camera/mesh at final pose.
- [ ] `returnToStart` restores initial transforms and re-enables controls.
- [ ] `snapToPose` snaps to a provided "hero" pose (document the pose source).

## Quality/Format invariants
- [ ] Switching Quality (Low/Med/High) while paused doesn't change transforms—only pixels.
- [ ] Switching Format (Square/Portrait/Landscape) while paused changes only render size/aspect, not camera/mesh pose.
