# Phase 2 Sprint 3: Auto-Solve Integration Plan

## Goal
Add auto-solve visualization to SolvePage so users can see the algorithm solve the puzzle and compare with their manual solution.

## Current State
✅ Engine 2 solver exists (`src/engines/engine2.ts`)
✅ AutoSolverPage has full implementation
✅ SolvePage has placeholder button
✅ Piece database loader exists
✅ Solution rendering pipeline exists

## Implementation Plan

### 1. Add Auto-Solve State (15 min)
**File:** `src/pages/solve/SolvePage.tsx`

Add state variables:
```typescript
// Auto-solve state
const [isAutoSolving, setIsAutoSolving] = useState(false);
const [autoSolveProgress, setAutoSolveProgress] = useState<{
  depth: number;
  solutions: number;
  status: string;
} | null>(null);
const [autoSolution, setAutoSolution] = useState<PlacedPiece[] | null>(null);
const [piecesDb, setPiecesDb] = useState<PieceDB | null>(null);
const engineHandleRef = useRef<Engine2RunHandle | null>(null);
```

### 2. Load Piece Database on Mount (10 min)
```typescript
useEffect(() => {
  loadAllPieces().then(db => {
    setPiecesDb(db);
    console.log('✅ Loaded pieces database:', db.size);
  });
}, []);
```

### 3. Implement Auto-Solve Function (30 min)
**New function in SolvePage:**

```typescript
const handleAutoSolve = async () => {
  if (!puzzle || !piecesDb) return;
  
  setIsAutoSolving(true);
  setAutoSolution(null);
  
  // Convert puzzle.geometry to container format
  const containerCells: [number, number, number][] = 
    puzzle.geometry.map(cell => [cell.i, cell.j, cell.k]);
  
  // Run engine2
  const handle = await engine2Precompute(
    containerCells,
    piecesDb,
    {
      maxSolutions: 1,
      stopOnFirst: true,
      maxDepth: 25,
      timeout: 30000, // 30 seconds
    },
    {
      onStatus: (status) => {
        setAutoSolveProgress({
          depth: status.depth,
          solutions: status.solutionsFound,
          status: status.phase
        });
      },
      onSolution: (placement) => {
        // Convert to PlacedPiece format
        const pieces = convertPlacementToPieces(placement);
        setAutoSolution(pieces);
      },
      onDone: () => {
        setIsAutoSolving(false);
      }
    }
  );
  
  engineHandleRef.current = handle;
  handle.resume();
};
```

### 4. Add Conversion Helper (15 min)
```typescript
const convertPlacementToPieces = (
  placement: Array<{ pieceId: string; ori: number; t: IJK }>
): PlacedPiece[] => {
  // Load orientation data
  // Convert each placement to PlacedPiece format with cells
  // Similar to AutoSolverPage's renderCurrentStack
};
```

### 5. Update UI - Two Modes (20 min)

**Manual Mode (default):**
- Shows manually placed pieces
- All existing controls active

**Auto-Solve Mode (when showAutoSolve is true):**
- Shows auto-solved pieces overlaid or side-by-side
- Hide manual controls
- Show progress (depth, solutions found)
- "Stop" button to cancel
- "Compare" button to toggle between manual and auto

### 6. Visual Comparison (30 min)

**Option A: Side-by-side**
- Split screen
- Manual solution on left
- Auto solution on right

**Option B: Toggle**
- Button to switch between viewing manual vs auto
- Stats shown for each

**Option C: Overlay with colors**
- Manual pieces in one color scheme
- Auto pieces in another
- Show differences

**Recommendation:** Start with Option B (simplest)

### 7. Update Header Button Logic (10 min)
```typescript
<button
  onClick={() => {
    if (showAutoSolve) {
      // Back to manual
      setShowAutoSolve(false);
    } else {
      // Start auto-solve
      setShowAutoSolve(true);
      if (!autoSolution) {
        handleAutoSolve();
      }
    }
  }}
>
  {showAutoSolve ? '👤 Back to Manual' : '🤖 Auto-Solve'}
</button>
```

### 8. Add Progress Indicator (15 min)
```typescript
{isAutoSolving && autoSolveProgress && (
  <div className="auto-solve-progress">
    <div>Depth: {autoSolveProgress.depth}</div>
    <div>Solutions: {autoSolveProgress.solutions}</div>
    <div>Status: {autoSolveProgress.status}</div>
    <button onClick={() => {
      engineHandleRef.current?.pause();
      setIsAutoSolving(false);
    }}>
      Stop
    </button>
  </div>
)}
```

### 9. Comparison Stats Display (20 min)
```typescript
{autoSolution && (
  <div className="comparison-stats">
    <h3>Solution Comparison</h3>
    <div>
      <strong>Your Solution:</strong>
      <div>Moves: {moveCount}</div>
      <div>Time: {formatTime(solveTimeMs)}</div>
    </div>
    <div>
      <strong>Auto-Solve:</strong>
      <div>Pieces: {autoSolution.length}</div>
      <div>Valid: {checkIfValid(autoSolution)}</div>
    </div>
  </div>
)}
```

### 10. Testing Checklist
- [ ] Auto-solve button starts solving
- [ ] Progress updates show during solve
- [ ] Solution appears when found
- [ ] Can toggle between manual and auto view
- [ ] Can stop auto-solve mid-process
- [ ] Stats comparison shows correctly
- [ ] Both solutions can use reveal slider
- [ ] Both solutions can use explosion slider
- [ ] No conflicts between manual and auto pieces

## Files to Modify

1. **src/pages/solve/SolvePage.tsx** - Main implementation
2. **src/engines/engine2.ts** - Already exists (no changes needed)
3. **src/engines/piecesLoader.ts** - Already exists (no changes needed)

## Estimated Time
**Total: 3-4 hours**

- State setup: 15 min
- Database loading: 10 min
- Auto-solve function: 30 min
- Conversion helper: 15 min
- UI modes: 20 min
- Visual comparison: 30 min
- Button logic: 10 min
- Progress indicator: 15 min
- Stats display: 20 min
- Testing & polish: 60 min

## Success Criteria
✅ User can click "Auto-Solve" button
✅ Algorithm solves puzzle in background
✅ Progress shown during solving
✅ Solution appears when found
✅ User can compare manual vs auto solutions
✅ Clear stats shown for both
✅ Can switch between viewing manual and auto
✅ Reveal/explosion sliders work for both

## Future Enhancements (Phase 4+)
- Animate solution being built step-by-step
- Show solve tree visualization
- Multiple auto-solutions
- "Hint" mode (show next piece)
- Save both manual and auto to compare
- Leaderboard (fastest manual solve)

## Notes
- Keep it simple for MVP
- Focus on comparison value
- Don't break existing manual solve
- Use existing Engine 2 infrastructure
- Reuse rendering from AutoSolverPage where possible
