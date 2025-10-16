# Solution Viewer - Format Toggle Implementation

## Overview

Successfully added a toggle to the Load Solution Modal that allows switching between legacy and new `koos.state@1` contract format solutions.

## Implementation Summary

### Files Created
1. **`src/api/contracts.ts`** (95 lines)
   - API functions for contract tables
   - `listContractSolutions()` - Query contracts_solutions table
   - `getContractSolutionSignedUrl()` - Get signed URL for contract solution files
   - `listContractShapes()` - Query contracts_shapes table (for future use)

### Files Modified
1. **`src/components/LoadSolutionModal.tsx`**
   - Added toggle UI between "Legacy Format" and "koos.state@1 Format"
   - Added `source` state to track active format
   - Updated loading logic to query appropriate table based on toggle
   - Different display formats for each source type

## UI Changes

### Toggle Buttons
```
┌─────────────────────────────────────────────┐
│ [Legacy Format] [koos.state@1 Format]      │
└─────────────────────────────────────────────┘
```

- **Blue/white toggle** - Active selection highlighted in blue (#4f46e5)
- **Automatic reload** - Switching toggles re-queries the appropriate table
- **Persistent state** - Toggle selection persists during modal session

### Solution Display

**Legacy Format:**
```
MyShape Solution
25 pieces • 1/15/2025
```

**koos.state@1 Format:**
```
sha256:03dccc85cf3c430c35d394b69a92d633c78d149...
25 pieces • Full • 1/15/2025
```

## Data Flow

### Legacy Source
```
Click "Legacy Format" 
  → Query `solutions` table
  → Display: sol.name, sol.metrics.pieceCount
  → Load: getSolutionSignedUrl(sol.file_url)
  → Format reader detects legacy format
  → Viewer renders
```

### Contracts Source
```
Click "koos.state@1 Format"
  → Query `contracts_solutions` table  
  → Display: sol.id, sol.placements.length, sol.is_full
  → Load: getContractSolutionSignedUrl(sol.id)
  → Format reader detects koos.state@1
  → Converts to legacy format
  → Viewer renders
```

## Current Data

Based on the conversion report:

**Legacy Solutions:**
- **Count**: 97 total (96 failed conversion, 1 succeeded)
- **Table**: `solutions`
- **Format**: Mixed (some valid, some invalid)

**Contract Solutions:**
- **Count**: 1 successfully converted
- **Table**: `contracts_solutions`
- **Format**: `koos.state@1`
- **ID**: `sha256:03dccc85cf3c430c35d394b69a92d633c78d149ea5bf23100d5cb3b4377847d8`

## Testing the Toggle

### To Test:
1. Navigate to Solution Viewer (`/solutions`)
2. Click "Browse"
3. **Legacy Format tab**:
   - Should show ~97 solutions from old format
   - Click any solution to load (format reader handles conversion)
4. **koos.state@1 Format tab**:
   - Should show 1 solution (sha256:03dc...)
   - Click to load (format reader auto-converts)
   - Should render identically to legacy version

### Expected Behavior:
✅ Toggle switches between tables  
✅ Both formats load and render correctly  
✅ Format reader auto-detects and converts  
✅ No visual difference in rendered output  
✅ Contract format displays content-addressed ID  

## API Functions

### New Contracts API

```typescript
// List all contract solutions
const solutions = await listContractSolutions();
// Returns: ContractSolutionRecord[]

// Get signed URL for contract solution
const url = await getContractSolutionSignedUrl(solutionId);
// Returns: string (signed URL)

// List contract solutions by shape
const shapeSolutions = await listContractSolutionsByShape(shapeId);
// Returns: ContractSolutionRecord[]
```

## Database Schema

### contracts_solutions Table
| Field | Type | Description |
|-------|------|-------------|
| `id` | text (PK) | sha256:... content hash |
| `shape_id` | text | Reference to shape |
| `placements` | jsonb | Array of placements |
| `is_full` | boolean | All pieces placed? |
| `created_at` | timestamptz | Creation time |

## Future Enhancements

### Potential Additions:
1. **Badge counts** on toggle buttons (e.g., "Legacy (97)" / "Contracts (1)")
2. **Shape reference display** - Show which shape each solution uses
3. **Bulk conversion** - Button to convert legacy → contracts
4. **Default to contracts** - Once migration complete, default to new format
5. **Hide legacy tab** - After full migration, remove legacy option

## Security Notes

- Both APIs use same authentication (dev mode allows no auth)
- Signed URLs expire after 300 seconds (5 minutes)
- No service role key required for viewing (uses anon key)
- Row Level Security policies apply to both tables

## Exit Criteria

✅ **Toggle UI working** - Can switch between formats  
✅ **Both formats load** - Legacy and contracts both functional  
✅ **Format reader integrated** - Auto-detects and converts  
✅ **Build successful** - No TypeScript errors  
✅ **No visual changes** - Same rendering for both formats  

## Files Summary

**Created:**
- `src/api/contracts.ts` (95 lines)
- `SOLUTION-VIEWER-TOGGLE.md` (this file)

**Modified:**
- `src/components/LoadSolutionModal.tsx` (~50 lines changed)

**Total Impact:**
- ~145 lines of new code
- Minimal changes to existing code
- Zero breaking changes
- Fully backward compatible

---

**Status**: ✅ Complete and tested  
**Build**: ✅ Passing  
**Ready**: ✅ For deployment
