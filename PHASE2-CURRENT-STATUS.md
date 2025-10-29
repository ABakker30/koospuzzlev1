# Phase 2 SolvePage - Current Status

## Problem
Attempted to copy entire ManualPuzzlePage (1700+ lines) and adapt it through many small edits. This approach got stuck in an inefficient loop.

## What's Working
✅ Phase 2 Sprint 1 infrastructure:
- `usePuzzleLoader` hook - loads puzzles from Supabase by ID
- `SolveStats` component - displays timer and move count
- Route `/solve/:id` configured in App.tsx
- Supabase `puzzles` table with challenge_message column

## What's Needed
A clean, minimal SolvePage that:
1. **Loads puzzle from URL** - use `usePuzzleLoader(puzzleId)`
2. **Displays puzzle geometry** - render with SceneCanvas
3. **Manual solving** - ALL the proven logic from ManualPuzzlePage:
   - Gold orientations
   - Fit finding
   - Piece placement
   - Draw mode
   - Undo/redo
4. **Timer & moves** - track from first placement
5. **Save solution** - to `solutions` table with `puzzle_id`
6. **Simple header** - puzzle name, home button, info

## Recommended Path Forward

### Option A: Minimal Rewrite (Fastest)
Create clean SolvePage with just the core pieces:
- Copy ONLY the essential functions from ManualPuzzlePage
- Simple header (not ManualPuzzleTopBar)
- Focus on working solve flow
- ~400-500 lines instead of 1700

### Option B: Complete the Current Adaptation
Continue editing SolvePage-full.tsx:
- Replace render section (last major edit)
- Remove unused modals and state
- Test and debug

### Option C: Use ManualPuzzlePage As-Is
Create a wrapper that:
- Loads puzzle from URL
- Converts to shape format
- Passes to ManualPuzzlePage
- Intercepts solution save

## Recommendation
**Option A** - Start fresh with minimal rewrite. Copy proven functions but build clean structure.

## Files Created So Far
- `/src/pages/solve/SolvePage.tsx` - Original basic version (incomplete)
- `/src/pages/solve/SolvePage-full.tsx` - Copy of ManualPuzzlePage (partially adapted, has errors)
- `/src/pages/solve/components/SolveStats.tsx` - ✅ Complete
- `/src/pages/solve/hooks/usePuzzleLoader.ts` - ✅ Complete

## Next Action
Choose a path and execute cleanly.
