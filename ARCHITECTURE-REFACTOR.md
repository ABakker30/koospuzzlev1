# Architecture Refactor: One Canvas Per Page

## Overview

This document tracks the major architecture refactoring to separate canvas concerns across pages.

**Goal:** Each page gets its own dedicated canvas component with single responsibility.

**Status:** Phase 3 of 4 Complete ✅

---

## Architecture Pattern

### Before Refactoring
- **SceneCanvas.tsx** (2080 lines): Monolithic component serving both Shape Editor AND Manual Puzzle
- Conditional logic: `if (editMode)` checks everywhere
- Multiple touch handlers causing conflicts
- Complex state management with unclear boundaries

### After Refactoring (Target)
```
src/
├── components/
│   ├── ShapeEditorCanvas.tsx      ✅ Phase 3 Complete (445 lines)
│   ├── ManualPuzzleCanvas.tsx     🔜 Phase 4 (to be extracted)
│   ├── AutoSolverCanvas.tsx       ✅ Phase 2 Complete (211 lines)
│   └── StudioCanvas.tsx           ✅ Already exists (570 lines)
├── pages/
│   ├── solution-viewer/
│   │   └── components/
│   │       └── SolutionViewerCanvas.tsx  ✅ Phase 1 Complete (193 lines)
```

**Pattern Established:**
- Canvas = Three.js setup + rendering + interactions
- Page = Business logic + UI + state management
- Clean interface via props or forwardRef/useImperativeHandle

---

## Completed Phases

### ✅ Phase 1: SolutionViewerCanvas (Complete)
**File:** `src/pages/solution-viewer/components/SolutionViewerCanvas.tsx`
**Lines:** 193
**Extracted From:** `SolutionViewerPage.tsx` (605 → 449 lines, saved ~156 lines)

**Features:**
- Three.js initialization (scene, camera, renderer, controls)
- Black background with glossy material lighting
- Render-on-demand (no animation loop for performance)
- Shadow plane with optimized settings
- Enhanced lighting for glossy spheres
- Exposes: `fitToObject()`, `triggerRender()`, scene/camera/renderer refs

**Commit:** `8233690` - "refactor: Phase 1 - Extract SolutionViewerCanvas"

---

### ✅ Phase 2: AutoSolverCanvas (Complete)
**File:** `src/components/AutoSolverCanvas.tsx`
**Lines:** 211
**Extracted From:** `AutoSolverPage.tsx` (1158 → 992 lines, saved ~166 lines)

**Features:**
- Three.js initialization (scene, camera, renderer, controls)
- Black background matching Solution Viewer style
- Render-on-demand WITH animation loop (for solver visualization)
- Shadow plane with shadow mapping
- Enhanced lighting (4 directional lights + ambient)
- Bounding box validation for fitToObject
- Exposes: `fitToObject()`, `triggerRender()`, scene/camera/renderer refs

**Differences from SolutionViewer:**
- Uses animation loop (solver needs continuous rendering)
- More defensive bounding box checks
- Slightly different lighting setup

**Commit:** `35a9e88` - "refactor: Phase 2 - Extract AutoSolverCanvas"

---

### ✅ Phase 3: ShapeEditorCanvas (Complete)
**File:** `src/components/ShapeEditorCanvas.tsx`
**Lines:** 445
**Extracted From:** `SceneCanvas.tsx` (Shape Editor portion)
**Page:** `ShapeEditorPage.tsx`

**Features:**
- Three.js initialization with dark background (#1e1e1e)
- **Add Mode:**
  - Green neighbor spheres show available FCC positions
  - 12-neighbor connectivity (FCC lattice)
  - Hover highlight on neighbors
  - Click to add cell
- **Remove Mode:**
  - Red hover highlight on existing cells
  - Click to remove cell
- Instanced mesh rendering for performance
- Container settings: opacity, color, roughness
- Camera auto-fit on first load
- Exposes save function and orbit target to page

**API:**
```typescript
interface ShapeEditorCanvasProps {
  cells: IJK[];
  view: ViewTransforms | null;
  mode: "add" | "remove";
  onCellsChange: (cells: IJK[]) => void;
  onSave?: () => void;
  containerOpacity?: number;
  containerColor?: string;
  containerRoughness?: number;
}
```

**Key Improvements:**
- Removed `editMode` prop (always editing in this canvas)
- No Manual Puzzle logic mixed in
- Clean separation of add/remove mode handlers
- No touch handler conflicts

**Commit:** `d0ff433` - "refactor: Phase 3 - Extract ShapeEditorCanvas"

---

## Remaining Work

### 🔜 Phase 4: ManualPuzzleCanvas (To Be Extracted)
**Target File:** `src/components/ManualPuzzleCanvas.tsx`
**Extract From:** `SceneCanvas.tsx` (Manual Puzzle portion, ~700-800 lines)
**Page:** `src/pages/ManualPuzzle/ManualPuzzlePage.tsx`

**Features to Extract:**
1. **Ghost Preview Rendering**
   - `previewOffsets` prop
   - Semi-transparent preview of piece placement
   - Rotation visualization

2. **Drawing Mode** (4-cell tetrahedral pieces)
   - `drawingCells` prop
   - Yellow cell rendering
   - FCC adjacency validation
   - Single click to cancel

3. **Placed Pieces Rendering**
   - Distinct colors for each piece (25+ color palette)
   - Bond rendering between cells within pieces
   - Selection highlighting
   - Hide/show toggle

4. **Interaction Handlers** (COMPLEX - source of touch conflicts!)
   - Anchor setting (`onClickCell`)
   - Ghost rotation (`onCycleOrientation`)
   - Ghost placement (`onPlacePiece` - double-tap/long-press)
   - Piece selection (`onSelectPiece`)
   - Piece deletion (`onDeleteSelectedPiece`)
   - Drawing mode cell addition

5. **Mobile + Desktop Support**
   - Unified touch/click handler
   - Double-tap detection
   - Long-press detection
   - Swipe vs tap differentiation
   - **CRITICAL:** Avoid multiple handler conflicts!

**API (Proposed):**
```typescript
interface ManualPuzzleCanvasProps {
  cells: IJK[];
  view: ViewTransforms | null;
  visibility: { container: boolean; neighborSpheres: boolean };
  anchor: IJK | null;
  previewOffsets: IJK[] | null;
  placedPieces: PlacedPiece[];
  selectedPieceUid: string | null;
  drawingCells: IJK[];
  hidePlacedPieces: boolean;
  
  onClickCell: (ijk: IJK, isDrawing?: boolean) => void;
  onCycleOrientation: () => void;
  onPlacePiece: () => void;
  onSelectPiece: (uid: string) => void;
  onDeleteSelectedPiece: () => void;
  onDrawCell: (ijk: IJK) => void;
  
  containerOpacity?: number;
  containerColor?: string;
  containerRoughness?: number;
  puzzleMode: 'draw' | 'build';
}
```

**Challenges:**
- Most complex interaction model
- Touch handler conflicts (we were debugging this!)
- Multiple rendering layers (container, ghost, drawing, placed pieces)
- State coordination between canvas and page
- Mobile + desktop parity

**Estimated Effort:** 1-2 hours of careful extraction and testing

---

### 🗑️ Phase 5: Delete SceneCanvas.tsx (Final Cleanup)
**After Phase 4 is complete:**

1. Verify ManualPuzzleCanvas works correctly
2. Verify ShapeEditorCanvas works correctly
3. Search for any remaining SceneCanvas imports
4. **Delete** `src/components/SceneCanvas.tsx` (2080 lines → 0!)
5. Celebrate 🎉

---

## Benefits Achieved (So Far)

### ✅ Code Organization
- **Before:** 2080-line SceneCanvas + pages with embedded Three.js
- **After:** 4 focused canvases (193 + 211 + 445 + 570 lines) + clean pages
- **Reduction:** Eliminated ~300+ lines of redundant Three.js setup code

### ✅ Maintainability
- Each canvas has ONE purpose
- No `if (editMode)` conditional logic
- Changes to Shape Editor don't affect Manual Puzzle
- Clear separation of concerns

### ✅ Testing
- Can test each canvas independently
- Easier to write unit tests for isolated components
- No risk of cross-contamination between modes

### ✅ Performance
- Each page only loads its canvas code
- No unused handlers or logic
- Smaller bundle splits possible

### ✅ Developer Experience
- Clear "one page, one canvas" rule
- Easy to understand component boundaries
- New features go in the right canvas
- Less cognitive load

---

## Testing Checklist (Before Phase 4)

Before proceeding to Phase 4, verify the extracted canvases work:

### SolutionViewerCanvas
- [ ] Load a solution file
- [ ] Verify reveal slider works
- [ ] Verify camera controls (rotate, zoom, pan)
- [ ] Verify pieces render correctly
- [ ] Verify colors are distinct for 25+ pieces

### AutoSolverCanvas
- [ ] Load a shape file
- [ ] Start solver
- [ ] Verify solution rendering appears
- [ ] Verify camera auto-fits
- [ ] Verify piece reveal animation works

### ShapeEditorCanvas
- [ ] Load a shape file
- [ ] Add mode: verify green neighbors appear
- [ ] Add mode: click to add cells
- [ ] Remove mode: verify red hover highlight
- [ ] Remove mode: click to remove cells
- [ ] Verify undo works
- [ ] Verify save works

---

## Next Steps (Phase 4 Preparation)

### Before Starting Phase 4:
1. **Test Current Extractions** - Verify phases 1-3 work correctly
2. **Document Touch Handler Issues** - Review our earlier debugging session
3. **Create Test Plan** - Specific scenarios to test after extraction
4. **Consider Touch Handler Architecture** - Decide on unified vs separate handlers

### Phase 4 Strategy:
1. **Study Current Implementation** - Read all Manual Puzzle handlers in SceneCanvas
2. **Create Canvas Component** - Start with Three.js setup (reuse pattern)
3. **Extract Rendering Logic** - Ghost, drawing cells, placed pieces
4. **Extract Touch Handlers** - ONE unified handler (avoid conflicts!)
5. **Update ManualPuzzlePage** - Use new canvas
6. **Test Thoroughly** - All interaction modes on mobile + desktop
7. **Fix Touch Conflicts** - This is where we'll solve the original issue!

### Success Criteria for Phase 4:
- ✅ All Manual Puzzle features work
- ✅ No double-actions (ghost rotation after anchor setting)
- ✅ No multiple handler conflicts
- ✅ Mobile and desktop parity
- ✅ Drawing mode works correctly
- ✅ Piece placement works correctly
- ✅ Piece selection/deletion works correctly

---

## Architecture Principles (Established)

These patterns have been proven successful across phases 1-3:

### 1. Canvas Responsibilities
- Three.js initialization (scene, camera, renderer, controls)
- Lighting setup
- Mesh rendering and updates
- Interaction handlers (mouse, touch)
- Camera utilities (fit to object)

### 2. Page Responsibilities
- Business logic and state management
- Data loading and processing
- UI controls and buttons
- Modal dialogs
- State persistence

### 3. Communication Pattern
**Option A: Props & Callbacks** (used in ShapeEditorCanvas)
```typescript
<ShapeEditorCanvas
  cells={cells}
  view={view}
  mode={mode}
  onCellsChange={handleCellsChange}
/>
```

**Option B: Ref Handle** (used in SolutionViewerCanvas, AutoSolverCanvas)
```typescript
const canvasRef = useRef<CanvasHandle>(null);
// Later: canvasRef.current.fitToObject(obj)
<Canvas ref={canvasRef} />
```

**Use Ref Handle when:**
- Canvas needs to expose methods (fitToObject, triggerRender)
- Parent needs direct access to Three.js objects
- Multiple imperative actions needed

**Use Props when:**
- Simple declarative updates
- Clear data flow
- Standard React patterns sufficient

### 4. Render-on-Demand vs Animation Loop
**Render-on-Demand** (SolutionViewer):
```typescript
controls.addEventListener('change', () => renderer.render(scene, camera));
// No animation loop - only render when needed
```

**Animation Loop** (AutoSolver):
```typescript
let needsRender = true;
function animate() {
  requestAnimationFrame(animate);
  if (needsRender) {
    controls.update();
    renderer.render(scene, camera);
    needsRender = false;
  }
}
```

**Use Animation Loop when:**
- Continuous updates needed (solver, effects)
- Animation or state changes
- Performance is acceptable

**Use Render-on-Demand when:**
- Static visualization
- Performance critical
- Minimal state changes

---

## File Structure (Current)

```
src/
├── components/
│   ├── AutoSolverCanvas.tsx           ✅ 211 lines
│   ├── ShapeEditorCanvas.tsx          ✅ 445 lines
│   ├── StudioCanvas.tsx               ✅ 570 lines (pre-existing)
│   └── SceneCanvas.tsx                ⚠️  2080 lines (to be deleted after Phase 4)
│
├── pages/
│   ├── solution-viewer/
│   │   ├── components/
│   │   │   └── SolutionViewerCanvas.tsx  ✅ 193 lines
│   │   ├── pipeline/
│   │   ├── hooks/
│   │   └── types.ts
│   │
│   ├── AutoSolverPage.tsx             ✅ 992 lines (refactored)
│   ├── ShapeEditorPage.tsx            ✅ 500 lines (refactored)
│   ├── SolutionViewerPage.tsx         ✅ 449 lines (refactored)
│   ├── ContentStudioPage.tsx          ✅ Already separate
│   └── ManualPuzzle/
│       └── ManualPuzzlePage.tsx       🔜 1167 lines (to be refactored)
```

---

## Version Tags

- **v19.0.0** - Architecture refactor baseline (before extraction)
- **Phase 1** - SolutionViewerCanvas extracted
- **Phase 2** - AutoSolverCanvas extracted  
- **Phase 3** - ShapeEditorCanvas extracted
- **Phase 4** - (pending) ManualPuzzleCanvas extraction
- **Phase 5** - (pending) SceneCanvas deletion

---

## Contributors

This refactoring establishes clear architectural patterns for the Koos Puzzle application, making it easier to maintain, test, and extend in the future.

---

**Last Updated:** October 17, 2025
**Status:** Phase 3 Complete, Phase 4 Pending
