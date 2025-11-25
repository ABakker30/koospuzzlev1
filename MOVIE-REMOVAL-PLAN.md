# SolvePage.tsx Movie Code Removal Plan

## Summary
**Current Size:** 3,679 lines  
**Estimated After Removal:** ~2,400 lines  
**Estimated Reduction:** ~1,280 lines (35%)

---

## Block 1: Imports (DONE ✅)
**Lines:** Already removed  
**Count:** 16 lines removed

---

## Block 2: State Variables (DONE ✅)
**Lines:** Already removed  
**Count:** 62 lines removed

---

## Block 3: Movie Loading useEffect
**Lines:** 471-651 (180 lines)
**Description:** Entire movie loading logic from URL parameter
- Loads movie from database
- Restores placed pieces
- Sets up camera for movie playback
- Handles challenge state

**Action:** DELETE entire useEffect block

---

## Block 4: Shared Link Detection useEffect
**Lines:** 653-670 (18 lines)
**Description:** Detects shared links and shows welcome modal
**Action:** DELETE entire useEffect

---

## Block 5: visiblePlacedPieces Movie Logic
**Lines:** ~357-365, ~428-436 (scattered ~20 lines)
**Description:** Movie-specific filtering in visiblePlacedPieces useMemo
- Lines checking `loadedMovie && solveMode === 'movie'`
- Lines checking `loadedMovie && solveMode === 'manual'`

**Action:** REMOVE movie-specific conditions, keep manual/automated logic

---

## Block 6: Save Solution Handler (Keep but simplify)
**Lines:** ~1370-1378
**Description:** Currently mentions "Movie Mode now available"
**Action:** SIMPLIFY notification text (remove movie reference)

---

## Block 7: Thumbnail Capture Logic
**Lines:** ~1606-1616 (10 lines)
**Description:** Captures thumbnail before entering movie mode
**Action:** DELETE entire block

---

## Block 8: Effect Context Building useEffect
**Lines:** ~1751-1779 (29 lines)
**Description:** Builds effect context for movie mode
**Action:** DELETE entire useEffect

---

## Block 9: Auto-Activate Effect useEffect
**Lines:** ~1778-1805 (27 lines)
**Description:** Auto-activates effect when loading gallery movie
**Action:** DELETE entire useEffect

---

## Block 10: Effect Handlers (MASSIVE - 650+ lines)
**Lines:** ~1804-2465 (661 lines)
**Description:** All effect-related handlers:
- `handleActivateEffect()` (~90 lines)
- `handleEffectSelect()` (~15 lines)
- `handleTurnTableSave()` (~6 lines)
- `handleRevealSave()` (~6 lines)
- `handleGravitySave()` (~6 lines)
- `handleRecordingComplete()` (~5 lines)
- `handleCreditsSubmit()` (~190 lines)
- `handleCreditsCancel()` (~100 lines)
- Effect tick loop useEffect (~15 lines)
- onComplete callback useEffect (~60 lines)
- Multiple smaller effect-related useEffects (~150 lines)

**Action:** DELETE ALL effect handler functions and related useEffects

---

## Block 11: Mode Selector Button (Movie option)
**Lines:** ~2561-2608 (47 lines)
**Description:** Mode selector dropdown including movie mode
**Action:** REMOVE movie mode option, keep manual/automated

---

## Block 12: Movie Mode UI (Effects Dropdown, TransportBar)
**Lines:** ~2662-2948 (286 lines)
**Description:** 
- Effects dropdown menu
- Effect selection buttons
- TransportBar component
- Movie mode specific UI elements

**Action:** DELETE entire movie mode UI section

---

## Block 13: SceneCanvas Movie Props
**Lines:** ~2996-3024 (28 lines)
**Description:** Props passed to SceneCanvas for movie mode:
- `hideContainerCells`
- `turntableRotation`
- `onSceneReady` (movie-specific)
- Movie mode checks

**Action:** REMOVE movie-specific props and checks

---

## Block 14: JSX Modals (Bottom of component)
**Lines:** ~3407-3491 (84 lines)
**Description:** Effect and movie modals:
- `<TurnTableModal>`
- `<RevealModal>`
- `<GravityModal>`
- `<CreditsModal>`
- Challenge-related conditionals

**Action:** DELETE all effect modal components

---

## Block 15: Challenge Overlay (Conditional)
**Lines:** ~3635-3691 (56 lines)
**Description:** Challenge overlay for gallery movies
**Action:** DELETE entire block

---

## Block 16: Movie-Specific Success Modal Content
**Lines:** ~3492-3633 (scattered in success modal)
**Description:** Movie-specific content in success modal
**Action:** SIMPLIFY to only show solution save success

---

## Execution Order (Recommended)
1. ✅ Block 1: Imports (DONE)
2. ✅ Block 2: State Variables (DONE)
3. Block 3: Movie loading useEffect (lines 471-651)
4. Block 4: Shared link useEffect (lines 653-670)
5. Block 8: Effect context useEffect (lines 1751-1779)
6. Block 9: Auto-activate useEffect (lines 1778-1805)
7. Block 10: All effect handlers (lines 1804-2465) - BIGGEST BLOCK
8. Block 11: Mode selector (lines 2561-2608)
9. Block 12: Movie UI (lines 2662-2948)
10. Block 13: SceneCanvas props (lines 2996-3024)
11. Block 14: JSX modals (lines 3407-3491)
12. Block 15: Challenge overlay (lines 3635-3691)
13. Block 5: Scattered visiblePlacedPieces logic
14. Block 7: Thumbnail capture
15. Block 16: Success modal simplification
16. Block 6: Save solution notification simplification

---

## Total Lines to Remove
- Blocks 3-15: ~1,280 lines
- After cleanup: **~2,400 lines** (35% reduction)

---

## Post-Removal Checklist
- [ ] Fix remaining compilation errors
- [ ] Remove unused imports
- [ ] Test manual mode still works
- [ ] Test automated mode still works
- [ ] Verify no broken references
- [ ] Run TypeScript check
- [ ] Test solve page loads without errors

---

## Notes
- All movie playback functionality moves to dedicated `/movies/*` pages
- SolvePage remains focused on manual and automated solving only
- Gallery will link to movie pages, not SolvePage
- Reveal/Explosion sliders stay (used for visualization in manual mode)
