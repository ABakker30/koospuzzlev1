# Clean SolvePage Implementation Spec

## File Structure (~400 lines total)

### Imports & Types (Lines 1-30)
```typescript
- React hooks
- useParams for URL
- usePuzzleLoader
- SolveStats component
- ViewPiecesModal from ManualPuzzle
- Gold orientation services
- Fit finder
- Supabase client
```

### State (Lines 31-80)
```typescript
// Puzzle
- cells, view, loaded
- puzzle (from hook)

// Solving
- solveStartTime, moveCount, isStarted
- placedPieces Map<uid, PlacedPiece>
- selectedUid
- isComplete

// Ghost/Preview
- anchor, fits, fitIndex
- currentFit (derived)

// Piece selection
- pieces[], activePiece
- mode (unlimited/oneOfEach/single)
- placedCountByPieceId

// Drawing
- drawingCells[]

// Undo/Redo
- undoStack, redoStack

// UI
- showViewPieces, showInfo
- hidePlacedPieces
- notification
```

### Core Functions from ManualPuzzlePage (Lines 81-350)
**Keep these exactly as-is:**
1. `deletePiece(uid)` - Remove piece
2. `clearGhost()` - Clear preview
3. `handleConfirmFit()` - Place piece + START TIMER
4. `handleDeleteSelected()` - Delete selected
5. `handleUndo()` - Undo last action
6. `handleRedo()` - Redo action
7. `areFCCAdjacent()` - Check adjacency
8. `handleDrawCell()` - Add to drawing
9. `identifyAndPlacePiece()` - Match drawn + START TIMER
10. `normalizeCells()` - Normalize to origin
11. `cellsMatch()` - Compare cell sets
12. `handleCellClick()` - Click empty cell
13. `handleInteraction()` - Behavior table

### New/Modified Functions (Lines 351-400)
1. **handleSaveSolution()** - Save to `solutions` table with `puzzle_id`
2. **Auto-load puzzle** - useEffect on puzzle data
3. **Keyboard shortcuts** - From ManualPuzzlePage

### Render (Lines 401-450)
```tsx
<div className="content-studio-page">
  {/* Simple Header */}
  <div style={{...topbar}}>
    <button onClick={() => navigate('/')}>⌂ Home</button>
    <h1>{puzzle?.name || 'Loading...'}</h1>
    <button onClick={() => setShowViewPieces(true)}>Pieces</button>
    <button onClick={() => setShowInfo(true)}>?</button>
  </div>

  {/* Main Viewport */}
  <div style={{flex: 1}}>
    <SceneCanvas 
      cells={cells}
      view={view}
      visibility={visibility}
      anchor={anchor}
      previewOffsets={currentFit?.cells}
      placedPieces={Array.from(placed.values())}
      selectedPieceUid={selectedUid}
      onSelectPiece={setSelectedUid}
      drawingCells={drawingCells}
      hidePlacedPieces={hidePlacedPieces}
      onInteraction={handleInteraction}
      {...other props}
    />
    
    {/* HUD */}
    <SolveStats 
      moveCount={moveCount}
      solveTime={solveStartTime ? Date.now() - solveStartTime : 0}
      isComplete={isComplete}
      challengeMessage={puzzle?.challenge_message}
    />
    
    {/* Piece counter */}
    <div className="hud-chip">
      Pieces: {placed.size} / {Math.floor(cells.length / 4)}
    </div>
    
    {/* Drawing indicator */}
    {drawingCells.length > 0 && <div>Drawing...</div>}
    
    {/* Completion */}
    {isComplete && <div>🎉 Complete!</div>}
  </div>

  {/* Modals */}
  <ViewPiecesModal ... />
  <InfoModal ... />
</div>
```

## Key Differences from ManualPuzzlePage

| Feature | ManualPuzzle | SolvePage |
|---------|-------------|-----------|
| **Entry** | Browse modal | Auto-load from URL |
| **Header** | ManualPuzzleTopBar | Simple header |
| **Loading** | ActiveState | usePuzzleLoader |
| **Save** | contracts_solutions | solutions table |
| **Stats** | None | SolveStats overlay |
| **Auto-solve** | None | Button (Sprint 3) |

## Implementation Steps

1. ✅ Copy essential state from ManualPuzzlePage
2. ✅ Copy all core solving functions (unchanged)
3. ✅ Add timer tracking to handleConfirmFit
4. ✅ Add timer tracking to identifyAndPlacePiece
5. ✅ Replace solution saving logic
6. ✅ Create simple header (not ManualPuzzleTopBar)
7. ✅ Add SolveStats overlay
8. ✅ Remove browse modal
9. ✅ Auto-load from puzzle prop
10. ✅ Test solve flow

## Files to Reference
- `src/pages/ManualPuzzle/ManualPuzzlePage.tsx` - Copy solving logic from here
- `src/pages/solve/hooks/usePuzzleLoader.ts` - Puzzle loading
- `src/pages/solve/components/SolveStats.tsx` - Stats display
