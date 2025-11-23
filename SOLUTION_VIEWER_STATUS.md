# Solution Viewer Page - Implementation Status

## What Was Created

**File:** `src/pages/solution/SolutionViewerPage-clean.tsx` (400 lines)

Created by **forking SolvePage.tsx** (3,754 lines) and stripping out:
- ❌ Manual solving (anchor, fits, piece selection, placement)
- ❌ Automated solver (engine, piecesDb, auto-solution)  
- ❌ Movie mode (effects system, recording, transport bar)
- ❌ Undo/redo, drawing mode, timer/move counting
- ❌ All mode switching logic

**What Was Kept:**
- ✅ Puzzle loading via `usePuzzleLoader`
- ✅ View transforms computation (exact same code)
- ✅ Camera positioning & orbit target setup
- ✅ Placed pieces rendering
- ✅ Reveal slider (show pieces 1 by 1)
- ✅ Explosion slider
- ✅ Environment settings modal (⚙️ button)
- ✅ Header with navigation

## Current Status

### ✅ What Works
1. **Route exists:** `/solution/{solutionId}` 
2. **Solution loads:** Fetches from `solutions` table
3. **Puzzle loads:** Uses `usePuzzleLoader` hook
4. **View computes:** ViewTransforms calculates correctly
5. **Pieces render:** SceneCanvas renders 5 placed pieces with bonds
6. **UI displays:** Header, sliders, buttons all present

### ❌ Current Issue

**Pieces render but are not visible**

**Logs show:**
```
✅ Rendered 5 placed pieces with bonds
💥 Explosion applied: factor=0.00 to 5 pieces
📷 Perspective FOV updated to: 16  ← PROBLEM!
```

**Root cause:** Camera settings from localStorage have:
- **FOV: 16** (way too narrow, should be ~50)
- Possibly wrong camera position/target

**Why this happens:**
- Environment settings load from localStorage (from Studio/CreatePage)
- Those settings have camera configured for puzzle creation (zoomed in tight)
- Solution viewer needs different camera defaults for viewing

## Next Steps to Fix

### Option 1: Override Camera Settings (Quick Fix)
In SolutionViewerPage-clean.tsx, force good camera defaults:
```typescript
const envSettings = useMemo(() => {
  const settings = envSettingsState;
  // Override camera for viewing
  settings.camera.projection = 'perspective';
  settings.camera.fov = 50; // Normal FOV
  return settings;
}, [envSettingsState]);
```

### Option 2: Don't Load Camera Settings (Better)
Don't persist camera settings in solution viewer - always use defaults.

### Option 3: Separate Settings Key (Best Long-term)
Use different localStorage key for solution viewer vs create/studio:
- `contentStudio_v2` - for creation
- `solutionViewer_v1` - for viewing

## Architecture Decision Needed

**Question:** Should we continue with this approach (fork & strip), or should we:

1. **Continue fixing:** Add camera override, test, deploy
2. **Refactor further:** Extract common components/hooks from SolvePage
3. **Different approach:** Use SolvePage with query param `?view=solution&id={solutionId}`

The fork approach is working - pieces render correctly. We just need to fix camera initialization.

## Files Modified

1. ✅ Created: `src/pages/solution/SolutionViewerPage-clean.tsx`
2. ✅ Updated: `src/App.tsx` (added route)
3. ✅ Updated: `src/pages/solve/SolvePage.tsx` (challenge modal navigates to solution viewer)

## Testing Checklist

- [ ] Camera shows geometry at correct distance
- [ ] Reveal slider works (shows pieces 1 by 1)
- [ ] Explosion slider works
- [ ] Environment settings button opens modal
- [ ] Try Puzzle button navigates to solve page
- [ ] Back to Gallery button works
- [ ] Lighting/materials look correct
