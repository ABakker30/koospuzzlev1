# Remaining Removal Steps

## Status
- ✅ Block 1: Imports removed (16 lines)
- ✅ Block 2: State variables removed (62 lines)
- ✅ Block 3: Movie loading useEffect removed (180 lines)
- ✅ Block 4: Shared link useEffect removed (18 lines)

**Total Removed So Far: 276 lines**
**Remaining: ~1,000 lines to remove**

---

## NEXT: Remove Remaining Large Blocks

Due to compilation errors accumulating, the most efficient approach is to:

1. Identify line numbers of all remaining blocks
2. Remove them in one batch (bottom-to-top to preserve line numbers)
3. Clean up scattered references
4. Fix compilation errors

---

## Action Plan

**Option A: Continue Incremental** (slow, many intermediate errors)
- Remove each block one by one
- Fix errors after each removal
- Time: ~30-45 minutes

**Option B: Batch Removal** (fast, fix all errors at end)
- Read entire file
- Identify all blocks to remove
- Create one mega-edit removing all at once
- Fix remaining errors
- Time: ~10-15 minutes

**Option C: Manual Review** (safest)
- User reviews file
- User manually deletes blocks
- I help fix remaining errors
- Time: ~20 minutes

---

## Recommendation

**Go with Option B** - Batch removal from bottom to top:

1. Find all remaining useEffect blocks with movie/effect references
2. Find all handler functions (handle*)
3. Find all JSX modal components
4. Remove all in one edit (working bottom-to-top)
5. Clean up scattered movie references in existing logic
6. Fix TypeScript errors

This will get us to a working state faster.

**Proceed with Option B?**
