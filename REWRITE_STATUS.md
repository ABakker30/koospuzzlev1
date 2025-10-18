# Complete Rewrite Status

## Goal
Replace complex interaction handler in SceneCanvas with clean architecture:
- SceneCanvas: Detect gesture (single/double/long) + raycast target → call onInteraction once
- ManualPuzzlePage: Behavior table that maps (target, type) → action

## Progress
✅ Old handler disabled when onInteraction is provided (line 1464)
✅ ManualPuzzlePage behavior table created with drawing support
✅ ManualPuzzlePage passes onInteraction={handleInteraction}
❌ NEW handler implementation NOT ADDED - no interactions work currently

## Next Step
Add NEW handler useEffect after line 1935 that:
1. Detects complete gestures with pending timers
2. Raycasts to find target
3. Calls onInteraction(target, type, data) ONCE per gesture

## Test After Implementation
- Single tap empty cell → place ghost
- Double-tap empty cell → draw cell
- Single tap ghost → rotate
- Double-tap ghost → place piece
- Tap background → clear ghost
