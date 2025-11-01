# Gesture Detector Integration Guide

## Overview

Replace the 4 conflicting touch handlers with a single gesture detector.

## Current State (BEFORE)

**Problem:** 4 separate useEffect blocks, each with their own touch handlers:

```typescript
// Effect 1: Remove mode (line ~1398)
useEffect(() => {
  const onTouchStart = ...
  const onTouchEnd = ...
  renderer.domElement.addEventListener('touchend', onTouchEnd);
}, [editMode, mode]);

// Effect 2: Manual puzzle (line ~1920)  
useEffect(() => {
  const onTouchStart = ...
  const onTouchEnd = ...
  renderer.domElement.addEventListener('touchend', onTouchEnd);
}, [onClickCell, onSelectPiece]);

// Effect 3: Interaction handler (line ~2410)
useEffect(() => {
  const onTouchStart = ...
  const onTouchEnd = ...
  renderer.domElement.addEventListener('touchend', onTouchEnd);
}, [onInteraction]);

// Effect 4: Delete handler (line ~2625)
useEffect(() => {
  const onTouchStart = ...
  const onTouchEnd = ...
  renderer.domElement.addEventListener('touchend', onTouchEnd);
}, [onDeleteSelectedPiece]);
```

**Result:** Race conditions, duplicate actions, gesture conflicts

---

## New Architecture (AFTER)

**Solution:** Single gesture detector + dispatcher

```typescript
// SceneCanvas.tsx

import { useGestureDetector, GestureEvent } from '../hooks/useGestureDetector';
import { detectGestureTarget, getActionFromGesture } from '../utils/gestureTargets';

function SceneCanvas(props: SceneCanvasProps) {
  // ... existing refs ...
  
  // SINGLE gesture handler
  const handleGesture = useCallback((gesture: GestureEvent) => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    
    if (!renderer || !camera) return;
    
    // Detect what was tapped
    const result = detectGestureTarget(
      gesture.clientX,
      gesture.clientY,
      camera,
      renderer.domElement,
      {
        previewMesh: previewMeshRef.current,
        placedMeshes: placedMeshesRef.current,
        containerMesh: meshRef.current,
        drawingMesh: drawingMeshRef.current,
      },
      {
        selectedPieceUid,
        hidePlacedPieces,
        cells,
      }
    );
    
    // Dispatch action based on gesture type + target
    const action = getActionFromGesture(gesture.type, result.target);
    console.log('🎯 Gesture:', gesture.type, '→ Target:', result.target, '→ Action:', action);
    
    // Execute action
    switch (action) {
      case 'select-piece':
        if (onSelectPiece && result.data?.pieceUid) {
          onSelectPiece(result.data.pieceUid);
        }
        break;
        
      case 'place-piece':
        if (onPlacePiece) {
          onPlacePiece();
          // Clear selection after placement
          onSelectPiece?.(null);
        }
        break;
        
      case 'delete-piece':
        if (onDeleteSelectedPiece) {
          onDeleteSelectedPiece();
        }
        break;
        
      case 'set-anchor':
        if (onClickCell && result.data?.cell) {
          onClickCell(result.data.cell);
        }
        break;
        
      case 'draw-cell':
        if (onDrawCell && result.data?.cell) {
          onDrawCell(result.data.cell);
        }
        break;
        
      case 'deselect':
        if (onSelectPiece) {
          onSelectPiece(null);
        }
        break;
    }
  }, [
    onSelectPiece,
    onPlacePiece,
    onDeleteSelectedPiece,
    onClickCell,
    onDrawCell,
    selectedPieceUid,
    hidePlacedPieces,
    cells,
  ]);
  
  // Attach gesture detector
  useGestureDetector(
    rendererRef.current?.domElement,
    handleGesture,
    {
      doubleTapWindow: 300,
      longPressDelay: 600,
      moveThreshold: 15,
      enableDesktop: true,
    }
  );
  
  // ... rest of component ...
  // DELETE all 4 old touch handler effects!
}
```

---

## Benefits

### ✅ Single Source of Truth
- One place tracks gesture state
- No conflicting timers
- No race conditions

### ✅ Clear Separation
- **Detection:** "What gesture happened?"
- **Target:** "What was tapped?"
- **Action:** "What to do?"

### ✅ OrbitControls Compatible
- Movement > threshold = drag (ignored)
- Stationary = gesture (dispatched)
- No interference with camera controls

### ✅ Easy to Debug
- Single console log per gesture
- Clear action mapping
- Predictable behavior

---

## Migration Steps

### Phase 1: Add Detector (Parallel)
1. ✅ Create `useGestureDetector.ts`
2. ✅ Create `gestureTargets.ts`
3. Add `handleGesture` to SceneCanvas
4. Add `useGestureDetector` hook
5. Test both systems running (shouldn't conflict due to stopImmediatePropagation)

### Phase 2: Remove Old Handlers
1. Comment out Effect 1 (Remove mode)
2. Comment out Effect 2 (Manual puzzle)
3. Comment out Effect 3 (Interaction)
4. Comment out Effect 4 (Delete)
5. Test all functionality works

### Phase 3: Cleanup
1. Delete commented effects
2. Delete old refs (`gestureCompletedRef`, local timers)
3. Delete old constants (DOUBLE_CLICK_DELAY, etc.)
4. Update prop interfaces if needed

---

## Testing Checklist

### Manual Puzzle Mode
- [ ] Tap empty cell → Sets anchor
- [ ] Tap placed piece → Selects piece
- [ ] Double-tap ghost → Places piece + clears ghost
- [ ] Long-press ghost → Places piece + clears ghost
- [ ] Double-tap selected → Deletes piece
- [ ] Long-press selected → Deletes piece
- [ ] Drag → Camera rotates (OrbitControls)

### Edit Mode
- [ ] Long-press empty → Draws cell
- [ ] Tap cell → Selects for remove
- [ ] Long-press selected → Deletes cell

### General
- [ ] No duplicate actions
- [ ] No ghost lingering after placement
- [ ] No accidental placement after delete
- [ ] Works on mobile
- [ ] Works on desktop

---

## Rollback Plan

If issues arise:
1. Comment out `useGestureDetector` hook
2. Uncomment old effects
3. Keep new files for future attempt
4. Document what broke

---

## Current Status

- ✅ Files created
- ✅ Architecture designed
- ⏳ Integration pending
- ⏳ Testing pending
- ⏳ Old handlers removal pending
