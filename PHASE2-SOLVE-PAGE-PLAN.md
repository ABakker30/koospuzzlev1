# Phase 2: SolvePage Implementation Plan

## Strategy: Copy ManualPuzzlePage, Adapt for Solve Mode

### What to Copy (Keep 100%)
- ✅ All manual solving logic (pieces, fits, orientations)
- ✅ Gold Orientation Service integration
- ✅ Fit computation and preview
- ✅ Piece placement system
- ✅ Draw mode (double-click to draw 4 cells)
- ✅ Undo/Redo stacks
- ✅ Placement modes (unlimited, one-of-each, single)
- ✅ SceneCanvas integration
- ✅ Keyboard shortcuts
- ✅ Completion detection
- ✅ All interaction handlers (ghost, cell, piece, background)
- ✅ Drawing cells logic
- ✅ FCC adjacency checking
- ✅ Piece identification from drawn cells

### What to Remove
- ❌ BrowseContractShapesModal (no browse button)
- ❌ "Back to Shape" button
- ❌ ActiveState integration (not needed)
- ❌ Auto-load from activeState
- ❌ "Save state on home" logic

### What to Add
- ➕ usePuzzleLoader hook (load by ID from Supabase)
- ➕ URL param parsing (useParams)
- ➕ SolveStats component (timer + moves)
- ➕ Auto-solve button (placeholder for Sprint 3)
- ➕ Simpler header (puzzle name, creator)
- ➕ Save solution to Supabase with puzzle_id reference

### What to Modify
- 🔄 Replace ManualPuzzleTopBar with simpler SolveHeader
- 🔄 Auto-load puzzle from URL on mount (not from browse)
- 🔄 Save solution to `solutions` table instead of `contracts_solutions`
- 🔄 Track solving time (start timer on first move)
- 🔄 Track moves (count piece placements)

## File Structure

```
src/pages/solve/
├── SolvePage.tsx              # Main page (adapted from ManualPuzzlePage)
├── components/
│   ├── SolveStats.tsx        # Timer + move counter ✅ DONE
│   └── SolveHeader.tsx       # Simple header with puzzle info
└── hooks/
    ├── usePuzzleLoader.ts    # Load puzzle from DB ✅ DONE
    └── useSolutionSaver.ts   # Save solution to DB (NEW)
```

## Implementation Steps

### Step 1: Copy Base File ✅
- Copy ManualPuzzlePage.tsx → SolvePage.tsx
- Keep ALL logic intact initially

### Step 2: Update Imports
- Add: usePuzzleLoader, useParams, SolveStats
- Remove: BrowseContractShapesModal, ManualPuzzleTopBar

### Step 3: Replace Puzzle Loading
```typescript
// OLD: Browse modal + activeState
const [showBrowseModal, setShowBrowseModal] = useState(false);

// NEW: Load from URL
const { id: puzzleId } = useParams<{ id: string }>();
const { puzzle, loading, error } = usePuzzleLoader(puzzleId);

useEffect(() => {
  if (!puzzle) return;
  // Auto-load puzzle geometry
  handlePuzzleLoaded(puzzle);
}, [puzzle]);
```

### Step 4: Add Timer/Stats
```typescript
const [solveStartTime, setSolveStartTime] = useState<number | null>(null);
const [moveCount, setMoveCount] = useState(0);

// Start timer on first piece placement
const handleConfirmFit = () => {
  if (!solveStartTime) {
    setSolveStartTime(Date.now());
  }
  setMoveCount(prev => prev + 1);
  // ... rest of placement logic
};
```

### Step 5: Simplify Header
```typescript
// Remove ManualPuzzleTopBar
// Add simple header with:
- Puzzle name
- Creator name
- Auto-solve button
- Info button
- Home button
```

### Step 6: Update Solution Saving
```typescript
const saveSolution = async () => {
  const { data, error } = await supabase
    .from('solutions')  // NEW table, not contracts_solutions
    .insert({
      puzzle_id: puzzle.id,  // Reference to puzzle
      solver_name: 'Anonymous', // or from input
      solution_type: 'manual',
      final_geometry: [...placed pieces...],
      actions: [], // TODO: Track for Phase 4
      solve_time_ms: Date.now() - solveStartTime,
      move_count: moveCount
    });
};
```

## Key Differences from ManualPuzzlePage

| Feature | ManualPuzzlePage | SolvePage |
|---------|------------------|-----------|
| **Entry** | Browse shapes modal | Direct URL load |
| **Shape Source** | Supabase storage | Puzzle geometry from DB |
| **State** | ActiveState context | URL params |
| **Header** | Complex topbar | Simple header |
| **Timer** | None | Starts on first move |
| **Moves** | None | Counts placements |
| **Save** | contracts_solutions | solutions table |
| **Challenge** | None | Display creator's message |

## Migration Checklist

- [ ] Copy ManualPuzzlePage.tsx → SolvePage.tsx
- [ ] Update imports (remove browse, add puzzle loader)
- [ ] Replace browse logic with URL-based loading
- [ ] Add timer state and tracking
- [ ] Add move counter
- [ ] Create SolveHeader component
- [ ] Replace ManualPuzzleTopBar with SolveHeader
- [ ] Update solution saving to use `solutions` table
- [ ] Add SolveStats component to canvas
- [ ] Remove activeState logic
- [ ] Test complete solve flow
- [ ] Add auto-solve button placeholder

## Testing Checklist

- [ ] Load puzzle by URL
- [ ] Puzzle geometry displays correctly
- [ ] Can click cells to show ghost pieces
- [ ] Can cycle orientations with R key
- [ ] Can place pieces with Enter
- [ ] Timer starts on first placement
- [ ] Move counter increments
- [ ] Draw mode works (double-click cells)
- [ ] Undo/redo works
- [ ] Completion detection works
- [ ] Solution saves to database
- [ ] Challenge message displays

---

**Next**: Implement Step 1 - Copy and begin modifications
