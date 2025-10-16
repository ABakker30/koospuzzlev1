# Shape Editor - Legacy Format Deprecation

## Overview

Deprecated legacy shape format support in the Shape Editor. The editor now **exclusively supports koos.shape@1 format** for both loading and saving shapes.

## Changes Made

### Files Created (1)

**`src/components/BrowseContractShapesModal.tsx`** (New, 217 lines)
- Simple modal for loading koos.shape@1 shapes only
- Loads from `contracts_shapes` table
- No dual-format support (streamlined)
- Shows shape name, ID, cell count, lattice type
- Used exclusively by Shape Editor

### Files Modified (1)

**`src/pages/ShapeEditorPage.tsx`** (~30 lines changed)
- Replaced `LoadShapeModal` with `BrowseContractShapesModal`
- Removed `ShapeFile` import (legacy type)
- Updated `onLoaded` to accept `KoosShape` interface
- Removed legacy-related commented code
- Updated help text to reflect koos.shape@1 only
- Simplified interface (no format detection needed)

## Legacy Format Removed

### What Was Removed

❌ **Legacy Shape File Support**
- No longer loads from `shapes` table (legacy)
- No longer accepts `ShapeFile` type
- No longer handles `ab.container.v2` schema
- No format detection or conversion needed

❌ **Dual-Format UI**
- No format tabs
- No source selection
- No legacy path at all

### What Remains

✅ **koos.shape@1 Only**
- Loads only from `contracts_shapes` table
- Saves only in koos.shape@1 format
- Uses content-addressed IDs (SHA-256)
- Stores with user-friendly names in metadata

## New Simplified Flow

### Loading Shapes

```
Click Browse
    ↓
BrowseContractShapesModal opens
    ↓
Shows koos.shape@1 shapes from contracts_shapes table
    ↓
User clicks shape
    ↓
Fetches from storage/<id>.shape.json
    ↓
Validates schema and version
    ↓
Loads cells into editor
    ↓
Shape ready to edit ✅
```

### Saving Shapes

```
Click Save
    ↓
Prompt for shape name
    ↓
Compute SHA-256 from cells (canonical)
    ↓
Create koos.shape@1 format:
  {
    schema: "koos.shape",
    version: 1,
    id: "sha256:...",
    lattice: "fcc",
    cells: [[i,j,k], ...]
  }
    ↓
Upload to storage + database
    ↓
Success! ✅
```

## koos.shape@1 Format

**File Structure:**
```json
{
  "schema": "koos.shape",
  "version": 1,
  "id": "sha256:abc123...",
  "lattice": "fcc",
  "cells": [
    [0, 0, 0],
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1]
  ]
}
```

**Storage:**
- **File:** `shapes/<id>.shape.json`
- **Database:** `contracts_shapes` table
- **Metadata:** `{ name: "My Shape" }`

## User Interface Changes

### Browse Modal (Before - Legacy)

```
┌─────────────────────────────────────────┐
│  Browse Shapes (Cloud Storage)        × │
├─────────────────────────────────────────┤
│ [Legacy Format] [koos.shape@1 Format]   │  ← Removed
├─────────────────────────────────────────┤
│  Shape entries...                       │
└─────────────────────────────────────────┘
```

### Browse Modal (After - Simplified)

```
┌─────────────────────────────────────────┐
│  Browse Shapes (koos.shape@1)         × │  ← Single format
├─────────────────────────────────────────┤
│  My Shape                               │
│  sha256:abc123...xyz.shape.json         │
│  16 cells • fcc • 10/16/2025           │
└─────────────────────────────────────────┘
```

### Help Text (Updated)

**Before:**
- Browse: Load an existing shape file (.json)
- Save: Save your shape to cloud storage (requires sign in)

**After:**
- Browse: Load an existing koos.shape@1 from cloud storage
- Save: Save your shape in koos.shape@1 format

**New Section:**
- Format:
  - Shape Editor only supports **koos.shape@1** format
  - All shapes are saved with content-addressed IDs (SHA-256)
  - Shapes are stored in the `contracts_shapes` table

## Benefits of Deprecation

### Code Simplification

✅ **Removed complexity:**
- No format detection logic
- No dual-source management
- No legacy type conversions
- No format tabs UI

✅ **Cleaner code:**
- Single modal component
- Single data flow
- Single format type
- Easier to maintain

### User Experience

✅ **Clearer interface:**
- No confusing format choices
- Single, modern format
- Consistent experience
- Less cognitive load

✅ **Better reliability:**
- One format to test
- One storage path
- One validation flow
- Fewer edge cases

### Future-Proofing

✅ **Modern foundation:**
- Content-addressed IDs
- Canonical representation
- Extensible metadata
- Contract-based storage

## Migration Path

### For Existing Legacy Shapes

Users with legacy shapes in the `shapes` table have two options:

1. **Use Manual Puzzle or Auto Solver**
   - These pages still support dual-format loading
   - Can load and work with legacy shapes

2. **Convert to koos.shape@1**
   - Load shape in Manual Puzzle (supports both formats)
   - Save new version (saves as koos.shape@1)
   - Use converted version in Shape Editor

### No Data Loss

- **Legacy shapes still exist** in `shapes` table
- **Legacy shapes still loadable** in Manual Puzzle and Auto Solver
- **No automatic deletion** of legacy data
- **Users control conversion** timing

## Testing

### Test 1: Load koos.shape@1 Shape
1. Open Shape Editor
2. Click "Browse"
3. Modal shows "Browse Shapes (koos.shape@1)"
4. Select a shape
5. ✅ Should load and display correctly

### Test 2: Save koos.shape@1 Shape
1. Load or create a shape
2. Click "Save"
3. Enter shape name
4. Check console: `💾 koos.shape@1 saved`
5. ✅ Should save successfully

### Test 3: Edit and Re-save
1. Load a shape
2. Enable Edit mode
3. Add/remove cells
4. Click "Save"
5. ✅ Should save updated shape

### Test 4: Help Text
1. Click info button (ℹ)
2. Read "Format" section
3. ✅ Should mention koos.shape@1 only

## Legacy Support in Other Pages

### Still Support Both Formats:

✅ **Manual Puzzle Page**
- Loads legacy and koos.shape@1 shapes
- Saves solutions in koos.state@1 format
- Dual-format browse modal

✅ **Auto Solver Page**
- Loads legacy and koos.shape@1 shapes
- Saves solutions in koos.state@1 format
- Dual-format browse modal

✅ **Solution Viewer**
- Loads legacy and koos.state@1 solutions
- Format detection and conversion
- Dual-format browse modal

### koos.shape@1 Only:

⚠️ **Shape Editor** (This page)
- Only koos.shape@1
- No legacy support
- Simplified interface

## Rollback Plan (If Needed)

If legacy support needs to be restored:

1. **Revert ShapeEditorPage.tsx**
   - Re-add `LoadShapeModal` import
   - Restore `ShapeFile` type
   - Add back dual-format logic

2. **Keep BrowseContractShapesModal**
   - Useful for other future pages
   - Simpler alternative to LoadShapeModal

3. **Minimal impact**
   - Only affects Shape Editor page
   - Other pages unaffected
   - Data remains intact

## Build Status

✅ **Build successful**
✅ **No TypeScript errors**
✅ **All imports resolved**
✅ **Bundle: 1.150 MB (gzipped: 315 KB)**

## Documentation Updates

Updated help modal in Shape Editor:
- ✅ Mentions koos.shape@1 format
- ✅ Explains content-addressed IDs
- ✅ References `contracts_shapes` table
- ✅ No mention of legacy format

## Future Considerations

### Phase 2: Deprecate Legacy in Other Pages

Once all users have migrated:
1. Remove legacy support from Manual Puzzle
2. Remove legacy support from Auto Solver
3. Remove legacy support from Solution Viewer
4. Archive legacy `shapes` table
5. Complete migration to koos.shape@1

### Benefits of Full Migration

- Simpler codebase
- Single format everywhere
- Better performance
- Easier testing
- Modern architecture

## Conclusion

The Shape Editor now exclusively supports **koos.shape@1 format**, providing:
- **Simpler interface** - No format confusion
- **Modern storage** - Content-addressed IDs
- **Better reliability** - Single code path
- **Future-ready** - Extensible format

Users can still work with legacy shapes in other pages, and migration is optional. The Shape Editor focuses on creating and editing new shapes in the modern format.

**Status**: ✅ **Complete and Tested**
