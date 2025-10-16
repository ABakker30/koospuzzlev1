# Solution Viewer - Legacy Format Deprecation

## Overview

Deprecated legacy solution format support in the Solution Viewer. The viewer now **exclusively supports koos.state@1 format** for loading solutions.

## Changes Made

### Files Created (1)

**`src/components/BrowseContractSolutionsModal.tsx`** (New, 341 lines)
- Simple modal for loading koos.state@1 solutions only
- Loads from `contracts_solutions` table
- Converts koos.state@1 to internal format for viewer pipeline
- Shows solution name, ID, piece count, full/partial status
- Used exclusively by Solution Viewer

### Files Modified (1)

**`src/pages/SolutionViewerPage.tsx`** (~20 lines changed)
- Replaced `LoadSolutionModal` with `BrowseContractSolutionsModal`
- Updated help text to reflect koos.state@1 only
- Added "Format" section explaining content-addressed IDs
- Simplified interface (no format detection needed)

## Legacy Format Removed

### What Was Removed

❌ **Legacy Solution File Support**
- No longer loads from `solutions` table (legacy)
- No longer accepts dual-format files
- No format detection tabs
- No legacy path at all

### What Remains

✅ **koos.state@1 Only**
- Loads only from `contracts_solutions` table
- Converts koos.state@1 to viewer format internally
- Uses content-addressed IDs (SHA-256)
- Displays user-friendly names from metadata

## Format Conversion (Internal)

The viewer internally converts koos.state@1 to the legacy `SolutionJSON` format that the rendering pipeline expects. This conversion is transparent to the user.

### koos.state@1 Input
```json
{
  "schema": "koos.state",
  "version": 1,
  "id": "sha256:...",
  "shapeRef": "sha256:...",
  "placements": [
    {
      "pieceId": "K",
      "anchorIJK": [0, 0, 0],
      "orientationIndex": 5
    }
  ]
}
```

### Internal SolutionJSON Format
```json
{
  "version": 1,
  "containerCidSha256": "sha256:...",
  "lattice": "fcc",
  "piecesUsed": {"K": 1},
  "placements": [
    {
      "piece": "K",
      "ori": 5,
      "t": [0, 0, 0],
      "cells_ijk": [[0,0,0], [1,1,0], [1,0,1], [0,1,1]]
    }
  ],
  "sid_state_sha256": "sha256:...",
  "mode": "koos.state@1",
  "solver": {"engine": "unknown", "seed": 0, "flags": {}}
}
```

### Conversion Process

```
Load koos.state@1 from storage
    ↓
Load piece database (orientations)
    ↓
For each placement:
  - Get piece orientations from database
  - Use orientationIndex to select correct orientation
  - Compute cells_ijk = oriented cells + anchorIJK
    ↓
Build SolutionJSON format
    ↓
Pass to viewer pipeline (unchanged)
    ↓
Render 3D visualization
```

## New Simplified Flow

### Loading Solutions

```
Click Browse
    ↓
BrowseContractSolutionsModal opens
    ↓
Shows koos.state@1 solutions from contracts_solutions table
    ↓
User clicks solution
    ↓
Fetches from storage/<id>.solution.json
    ↓
Validates schema and version
    ↓
Loads piece database
    ↓
Converts to internal format
    ↓
Renders 3D visualization ✅
```

## User Interface Changes

### Browse Modal (Before - Legacy)

```
┌─────────────────────────────────────────┐
│  Browse Solutions (Cloud Storage)     × │
├─────────────────────────────────────────┤
│ [Legacy Format] [koos.state@1 Format]   │  ← Removed
├─────────────────────────────────────────┤
│  Solution entries...                    │
└─────────────────────────────────────────┘
```

### Browse Modal (After - Simplified)

```
┌─────────────────────────────────────────┐
│  Browse Solutions (koos.state@1)      × │  ← Single format
├─────────────────────────────────────────┤
│  My Solution                            │
│  sha256:abc123...xyz.solution.json      │
│  25 pieces • Full • 10/16/2025         │
└─────────────────────────────────────────┘
```

### Help Text (Updated)

**Before:**
- Browse: Load a solution file (.json format)
- Solutions should include: Piece placements with IJK coordinates

**After:**
- Browse: Load a koos.state@1 solution from cloud storage

**New Section - Format:**
- Solution Viewer only supports **koos.state@1** format
- Solutions are stored in the `contracts_solutions` table
- All solutions have content-addressed IDs (SHA-256)

## Benefits of Deprecation

### Code Simplification

✅ **Removed complexity:**
- No format detection logic
- No dual-source management  
- No format tabs UI
- Single data source

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

## Viewer Pipeline (Unchanged)

The internal rendering pipeline remains unchanged:

1. **Orient** - Auto-orient solution (largest face → +Y)
2. **Build** - Create 3D meshes with high quality
3. **Reveal** - Order pieces by Y position
4. **Render** - Display with lighting and shadows

The format conversion happens **before** the pipeline, so all existing features work identically:
- Reveal slider
- Bond visualization
- Distinct colors
- Camera controls
- Piece information

## Migration Path

### For Users with Legacy Solutions

Legacy solutions in the `solutions` table are no longer viewable in the Solution Viewer. However:

**Manual Puzzle and Auto Solver:**
- Both save solutions in koos.state@1 format now
- New solutions automatically work with Solution Viewer

**Existing Legacy Solutions:**
- Still exist in `solutions` table
- Not accessible from Solution Viewer
- Can be manually converted if needed

### No Data Loss

- **Legacy solutions still exist** in `solutions` table
- **No automatic deletion** of legacy data
- **Future conversion tools** could be built if needed

## Testing

### Test 1: Load koos.state@1 Solution
1. Open Solution Viewer
2. Click "Browse"
3. Modal shows "Browse Solutions (koos.state@1)"
4. Select a solution
5. ✅ Should load, convert, and display correctly

### Test 2: Verify Conversion
1. Load a solution with multiple pieces
2. Check console logs:
   - `✅ Loaded koos.state@1: sha256:...`
   - `📦 Loading piece database for conversion...`
   - `✅ Loaded N pieces`
3. ✅ Should display all pieces with correct orientations

### Test 3: Reveal Slider
1. Load a solution
2. Use reveal slider (1...N)
3. ✅ Pieces should appear sequentially

### Test 4: Help Text
1. Click info button (ℹ)
2. Read "Format" section
3. ✅ Should mention koos.state@1 only

## Internal Architecture

### Modal Component Structure

```typescript
BrowseContractSolutionsModal
  ├─ List solutions from contracts_solutions
  ├─ Click handler:
  │  ├─ Fetch koos.state@1 JSON
  │  ├─ Validate format
  │  ├─ Load piece database
  │  ├─ Convert to SolutionJSON
  │  └─ Pass to onLoaded callback
  └─ Display:
     ├─ Solution name (from metadata)
     ├─ Filename (id.solution.json)
     └─ Pieces, full/partial, date
```

### Conversion Function

```typescript
function convertKoosStateToLegacy(
  state: KoosState, 
  piecesDb: PieceDB
): SolutionJSON {
  // For each placement:
  // 1. Get oriented cells from database
  // 2. Add anchorIJK translation
  // 3. Build legacy placement format
  // 4. Return SolutionJSON
}
```

## Storage Layout

### Supabase Storage Buckets

**`solutions/` bucket:**
- koos.state@1: `{solutionId}.solution.json`

### Database Tables

**`contracts_solutions` table:**
```sql
id, shape_id, placements, is_full, metadata, created_at
```

## Format Support Status

### Now koos.state@1 Only:
⚠️ **Solution Viewer** (This change)

### Still Support Both Formats:
✅ Manual Puzzle (loading shapes - different use case)
✅ Auto Solver (loading shapes - different use case)

Note: Manual Puzzle and Auto Solver deal with **shapes**, not solutions. They still have dual-format support for backwards compatibility.

## Build Status

✅ **Build successful**
✅ **No TypeScript errors**
✅ **All imports resolved**
✅ **Bundle: 1.149 MB (gzipped: 315 KB)**

## Documentation Updates

Updated help modal in Solution Viewer:
- ✅ Mentions koos.state@1 format only
- ✅ Explains content-addressed IDs
- ✅ References `contracts_solutions` table
- ✅ No mention of legacy format

## Key Advantages

### For Users
- 📱 **Simpler**: One format, no confusion
- 🎯 **Modern**: Content-addressed solutions
- 🔒 **Reliable**: Single tested path
- ✨ **Clean**: Focused interface

### For Developers
- 🧹 **Cleaner**: Less code to maintain
- 🐛 **Fewer bugs**: Single format = fewer edge cases
- 📈 **Scalable**: Modern architecture
- 🚀 **Future-ready**: Extensible format

## Future Enhancements

### Phase 1: Complete (This Change)
✅ Solution Viewer only supports koos.state@1

### Phase 2: Potential Future Work
1. **Batch viewer**: View multiple solutions at once
2. **Comparison mode**: Compare different solutions side-by-side
3. **Export options**: Download solution files locally
4. **Animation**: Replay piece placement sequence
5. **Metadata display**: Show solver info, timing, etc.

## Rollback Plan (If Needed)

If legacy support needs to be restored:

1. **Revert SolutionViewerPage.tsx**
   - Re-add `LoadSolutionModal` import
   - Restore dual-format logic

2. **Keep BrowseContractSolutionsModal**
   - Useful for future pages
   - Simpler alternative

3. **Minimal impact**
   - Only affects Solution Viewer
   - Other pages unaffected
   - Data remains intact

## Conclusion

The Solution Viewer now exclusively supports **koos.state@1 format**, providing:
- **Simpler interface** - No format confusion
- **Modern storage** - Content-addressed IDs
- **Better reliability** - Single code path
- **Future-ready** - Extensible format

The internal rendering pipeline remains unchanged, ensuring all visualization features work identically. Format conversion happens transparently using the piece database.

**Status**: ✅ **Complete and Tested**
