# Manual Raycasting Fix - Final Steps

## ✅ COMPLETED:
1. Added `visibleCellsRef` at line 106
2. Caching array at line 553: `visibleCellsRef.current = visibleCells;`

## ⚠️ REMAINING: Replace 2 Click Handlers

### LOCATION 1: Lines ~1643-1664 (Manual Puzzle click handler)

**FIND THIS CODE:**
```typescript
          const instanceId = intersections[0].instanceId;
          if (instanceId !== undefined && instanceId < cells.length) {
            // Build occupiedSet to find the actual unoccupied cell
            const occupiedSet = new Set<string>();
            for (const piece of placedPieces) {
              for (const cell of piece.cells) {
                occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
              }
            }
            
            // Filter to visible cells
            const visibleCells = cells.filter(cell => {
              const key = `${cell.i},${cell.j},${cell.k}`;
              return !occupiedSet.has(key);
            });
            
            if (instanceId < visibleCells.length) {
              const clickedCell = visibleCells[instanceId];
              onClickCell(clickedCell);
              console.log('Clicked container cell:', clickedCell);
            }
          }
```

**REPLACE WITH:**
```typescript
          const instanceId = intersections[0].instanceId;
          if (instanceId !== undefined && instanceId < visibleCellsRef.current.length) {
            const clickedCell = visibleCellsRef.current[instanceId];
            onClickCell(clickedCell);
            console.log('✅ Raycasting fix:', clickedCell, 'idx:', instanceId);
          }
```

---

### LOCATION 2: Lines ~1775-1795 (Drawing mode click handler)

**FIND THIS CODE:**
```typescript
            if (instanceId !== undefined && instanceId < cells.length) {
              // Build occupiedSet to find the actual unoccupied cell
              const occupiedSet = new Set<string>();
              for (const piece of placedPieces) {
                for (const cell of piece.cells) {
                  occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
                }
              }
              // IMPORTANT: Also exclude drawing cells so instanceId matches current mesh
              for (const cell of drawingCells) {
                occupiedSet.add(`${cell.i},${cell.j},${cell.k}`);
              }
              
              // Filter to visible cells (matches how mesh was built)
              const visibleCells = cells.filter(cell => {
                const key = `${cell.i},${cell.j},${cell.k}`;
                return !occupiedSet.has(key);
              });
              
              if (instanceId < visibleCells.length) {
                const clickedCell = visibleCells[instanceId];
```

**REPLACE WITH:**
```typescript
            if (instanceId !== undefined && instanceId < visibleCellsRef.current.length) {
              const clickedCell = visibleCellsRef.current[instanceId];
```

---

## 🎯 What This Fixes:

**ROOT CAUSE:** The mesh is created with one `visibleCells` array, but click handlers rebuild the array from scratch. If pieces were placed/removed between mesh creation and click, the arrays don't match and clicks hit the wrong cell.

**THE FIX:** Use the cached `visibleCellsRef.current` that was saved when the mesh was created. This guarantees the instanceId maps to the correct cell.

## 🧪 Testing:

After making these changes:
1. Load a puzzle
2. Click various empty cells - should set anchor correctly on first click
3. Place some pieces
4. Click again - should still be accurate
5. Use drawing mode (double-click) - should work correctly

Look for console logs: `✅ Raycasting fix: ...` to confirm the fix is active.
