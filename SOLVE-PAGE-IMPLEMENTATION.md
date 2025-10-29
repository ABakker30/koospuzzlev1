# SolvePage - Clean Implementation Guide

## Current Status
✅ State variables defined (lines 1-96)
✅ Puzzle loading effect (lines 106-161)
✅ Loading/error states (lines 171-222)
✅ Basic render structure (lines 224-389)

❌ Missing: Core solving logic (should be lines 163-170 region)

## Functions Needed from ManualPuzzlePage

### 1. Init & Effects (~50 lines)
```typescript
// Init orientation service
useEffect(() => {
  // Load GoldOrientationService
  // Set pieces list
}, []);

// Check completion
useEffect(() => {
  // Count occupied cells
  // Set isComplete if all cells filled
}, [placed, cells]);

// Keyboard shortcuts
useEffect(() => {
  // R/Shift+R: Cycle fits
  // Enter: Confirm placement
  // Delete: Remove selected
  // Ctrl+Z: Undo
  // Ctrl+Shift+Z: Redo
  // Esc: Cancel preview
}, [loaded, anchor, fits, selectedUid, undoStack, redoStack]);
```

### 2. Core Helpers (~80 lines)
```typescript
const clearGhost = () => { ... }
const deletePiece = (uid: string) => { ... }
const showNotification = (msg: string) => { ... }
const areFCCAdjacent = (c1: IJK, c2: IJK): boolean => { ... }
const normalizeCells = (cells: IJK[]): IJK[] => { ... }
const cellsMatch = (c1: IJK[], c2: IJK[]): boolean => { ... }
```

### 3. Placement Logic (~120 lines)
```typescript
const handleConfirmFit = () => {
  // Check mode constraints
  // START TIMER if first placement
  // setMoveCount(prev => prev + 1)
  // Create PlacedPiece
  // Update placed, undoStack, placedCountByPieceId
  // clearGhost()
}

const handleCellClick = (cell: IJK, isDrawAction = false) => {
  // Handle drawing mode
  // Check if occupied
  // Set anchor
  // Compute fits
}

const handleDrawCell = (cell: IJK) => {
  // Add to drawingCells
  // Check FCC adjacency
  // If 4 cells, identify and place
}

const identifyAndPlacePiece = async (drawnCells: IJK[]) => {
  // Load orientations
  // Find matching piece
  // Check mode constraints
  // START TIMER if first placement
  // Place piece
}
```

### 4. Undo/Redo (~80 lines)
```typescript
const handleUndo = () => { ... }
const handleRedo = () => { ... }
const handleDeleteSelected = () => { ... }
```

### 5. Interaction Handler (~50 lines)
```typescript
const handleInteraction = (
  target: 'ghost' | 'cell' | 'piece' | 'background',
  type: 'single' | 'double' | 'long',
  data?: any
) => {
  // Ghost: rotate or place
  // Cell: move ghost or start drawing
  // Piece: select or delete
  // Background: clear
}
```

### 6. Solution Saving (~30 lines)
```typescript
const handleSaveSolution = async () => {
  // Convert placed pieces to geometry
  // Insert into solutions table
  // Include puzzle_id, solve_time_ms, move_count
}
```

## Render Updates Needed

### Current Issues
- Line 312: `previewOffsets` doesn't exist → should be `currentFit?.cells ?? null`
- Line 313: `placedPieces` doesn't exist → should be `Array.from(placed.values())`
- Line 314: `selectedPieceUid` → should be `selectedUid`
- Line 315: `onSelectPiece` → should be `setSelectedUid`
- Line 323: `drawingCells` → should use state variable
- Line 326: `onInteraction` → should call `handleInteraction`

### Add Modals
```tsx
<ViewPiecesModal
  open={showViewPieces}
  onClose={() => setShowViewPieces(false)}
  onSelect={(pieceId) => {
    setActivePiece(pieceId);
    orientationController.current?.setPiece(pieceId);
    setFits([]);
    setAnchor(null);
    setShowViewPieces(false);
  }}
  piecesAll={pieces}
  mode={mode}
  placedCountByPieceId={placedCountByPieceId}
  lastViewedPiece={lastViewedPiece}
/>
```

### Add HUD Elements
```tsx
{/* Piece counter */}
<div className="hud-chip">
  Pieces: {placed.size} / {Math.floor(cells.length / 4)}
</div>

{/* Drawing indicator */}
{drawingCells.length > 0 && (
  <div className="hud-notification">
    🎨 Drawing {drawingCells.length}/4 cells
  </div>
)}

{/* Notification */}
{notification && (
  <div className="hud-notification">
    {notification}
  </div>
)}

{/* Completion */}
{isComplete && (
  <div className="hud-completion">
    🎉 Puzzle Complete!
    <button onClick={handleSaveSolution}>Save Solution</button>
  </div>
)}
```

## Implementation Order

1. ✅ Add init effects (orientation service, completion check, keyboard)
2. ✅ Add core helpers
3. ✅ Add placement logic (confirmFit, cellClick, drawCell, identifyPiece)
4. ✅ Add undo/redo logic
5. ✅ Add interaction handler
6. ✅ Add solution saving
7. ✅ Update render (fix SceneCanvas props)
8. ✅ Add modals and HUD elements
9. ✅ Test complete flow

## Total Lines
- Current: ~389 lines
- With logic: ~650 lines (still much cleaner than 1700!)

## Next Step
Copy the functions from ManualPuzzlePage lines 180-900 and adapt them for SolvePage.
