# DEPRECATED ASSEMBLY/PHYSICS SYSTEM

**Date:** December 24, 2025  
**Status:** DEPRECATED - System abandoned for Phase 0 reset

## Overview

The assembly/physics system was an attempt to create animated puzzle assembly using Cannon.js physics. After extensive tuning, the system was abandoned in favor of starting fresh with a simpler, view-based approach.

## Deprecated Files (DO NOT USE)

### Core Assembly System
- `src/pages/KoosPuzzleAssemblyPage.tsx` - Main assembly page with timeline
- `src/pages/koosAssembly/AssemblyCanvas.tsx` - Three.js + Cannon.js physics integration
- `src/pages/koosAssembly/useAssemblyTimeline.ts` - Animation timeline hook
- `src/pages/koosAssembly/AssemblyTimeline.ts` - Timeline state management
- `src/pages/koosAssembly/computeAssemblyTransforms.ts` - Transform calculations
- `src/pages/koosAssembly/PieceProxies.tsx` - Piece rendering system
- `src/pages/koosAssembly/MatGridOverlay.tsx` - Grid overlay system
- `src/pages/koosAssembly/types.ts` - Type definitions
- `src/pages/koosAssembly/constants.ts` - Constants
- `src/pages/koosAssembly/loadSolutionForAssembly.ts` - Solution loading
- `src/pages/koosAssembly/orientation/autoOrientSolution.ts` - Auto-orientation

### Test Pages
- `src/pages/PhysicsTest.tsx` - Physics test with dumbbell/tetrahedral pieces

## Why Deprecated

1. **Complexity:** Cannon.js physics integration was too complex for the use case
2. **Scaling Issues:** Multiple iterations on sphere radius and FCC spacing
3. **Visual Mismatch:** Physics bodies and rendered meshes had scaling mismatches
4. **Balancing Issues:** Pieces would balance in unrealistic ways despite extensive tuning
5. **Over-Engineering:** System became too coupled and difficult to debug

## Physics Tuning Attempts

The system went through multiple iterations:
- Gravity tuning (-30)
- Contact material adjustments (friction 1.2, stiffness 1e9)
- Damping values (linear 0.5, angular 0.9)
- Support pad positioning
- FCC scaling corrections
- Mass properties updates

Despite all tuning, the visual/physics mismatch and complexity made the system untenable.

## Replacement System

**Phase 0 Reset:** Clean view-based sandbox
- Route: `/view-sandbox/:solutionId`
- Component: `PuzzleViewSandboxPage.tsx`
- Features: Static puzzle viewing, orbit controls, preset selector
- No physics, no animation, no settling
- Goal: Verify geometry and orientation correctness only

## Migration Path

- "Koos Puzzle" button now routes to sandbox page
- No camera snapshots passed
- No orientation computation
- No thumbnail generation
- Just pure viewing with existing SceneCanvas

## Files to Keep

✅ `PuzzleViewerPage.tsx` - Original view page (cleaned of assembly logic)
✅ `PuzzleViewSandboxPage.tsx` - New sandbox for geometry verification
✅ `SceneCanvas.tsx` - Core rendering component
✅ Existing gallery/solve/create pages

## Future Considerations

If animation is revisited:
- Consider pre-computed animations (not real-time physics)
- Use simpler transform interpolation
- Don't mix physics simulation with visual rendering
- Keep systems decoupled and testable
