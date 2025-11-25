# SolvePage.tsx Cleanup Instructions for ChatGPT

## OBJECTIVE
Remove all movie mode functionality from `SolvePage.tsx` (3,754 lines). Keep only manual and automated solving modes.

---

## FILE TO CLEAN
**File:** `src/pages/solve/SolvePage.tsx`
**Current size:** 3,754 lines
**Target size:** ~2,400 lines (35% reduction)

---

## WHAT TO REMOVE

### 1. IMPORTS (Lines 14, 19-35)
Remove these imports:
```typescript
import { getMovieById, incrementMovieViews, type MovieRecord } from '../../api/movies';

// Movie Mode - Effects System
import { buildEffectContext, type EffectContext } from '../../studio/EffectContext';
import { TransportBar } from '../../studio/TransportBar';
import { TurnTableModal } from '../../effects/turntable/TurnTableModal';
import { RevealModal } from '../../effects/reveal/RevealModal';
import { GravityModal } from '../../effects/gravity/GravityModal';
import { GravityEffect } from '../../effects/gravity/GravityEffect';
import { TurnTableEffect } from '../../effects/turntable/TurnTableEffect';
import { RevealEffect } from '../../effects/reveal/RevealEffect';
import { CreditsModal, type CreditsData } from '../../components/CreditsModal';
import { ChallengeOverlay } from '../../components/ChallengeOverlay';

import type { TurnTableConfig } from '../../effects/turntable/presets';
import type { RevealConfig } from '../../effects/reveal/presets';
import type { GravityEffectConfig } from '../../effects/gravity/types';
import * as THREE from 'three';
```

### 2. TYPE CHANGE (Line 62)
Change:
```typescript
type SolveMode = 'manual' | 'automated' | 'movie';
```
To:
```typescript
type SolveMode = 'manual' | 'automated';
```

### 3. STATE VARIABLES (Lines 58-209)
Remove ALL movie-related state:
- `loadedMovie`, `setLoadedMovie`
- `isLoadingMovie`, `setIsLoadingMovie`
- `showMoviePlayer`, `setShowMoviePlayer`
- `realSceneObjects`, `setRealSceneObjects`
- `effectContext`, `setEffectContext`
- `showEffectsDropdown`, `setShowEffectsDropdown`
- `activeEffectId`, `setActiveEffectId`
- `activeEffectInstance`, `setActiveEffectInstance`
- `thumbnailBlob`, `setThumbnailBlob`
- `showTurnTableModal`, `setShowTurnTableModal`
- `showRevealModal`, `setShowRevealModal`
- `showGravityModal`, `setShowGravityModal`
- `hideContainerCellsDuringMovie`, `setHideContainerCellsDuringMovie`
- `showCreditsModal`, `setShowCreditsModal`
- `recordedBlob`, `setRecordedBlob`
- `showChallengeModal`, `setShowChallengeModal`
- `galleryMovieCompleted`, `setGalleryMovieCompleted`
- `showSuccessModal`, `setShowSuccessModal`
- `savedMovieData`, `setSavedMovieData`
- `showChallengeOverlay`, `setShowChallengeOverlay`
- `hasChallenge`, `setHasChallenge`
- `currentChallengeRef`
- `turntableRotation`, `setTurntableRotation`
- `originalPlacedRef`
- `showSharedWelcome`, `setShowSharedWelcome`
- `isSharedLink`, `setIsSharedLink`

Keep only: `currentSolutionId`, `setCurrentSolutionId`

### 4. USEFFECTS TO REMOVE
**Lines 471-670:** Movie loading from URL parameter
**Lines 1551-1574:** Effect context building
**Lines 1576-1600:** Auto-activate effect
**Lines 2044-2109:** Effect tick loop
**Lines 2110-2169:** Auto-save for movie mode
**Lines 2171-2197:** Save original state
**Lines 2199-2272:** onComplete callbacks

### 5. HANDLER FUNCTIONS TO REMOVE (Lines 1603-2043)
- `handleActivateEffect`
- `handleClearEffect`
- `handleEffectSelect`
- `handleTurnTableSave`
- `handleRevealSave`
- `handleGravitySave`
- `handleRecordingComplete`
- `uploadMovieThumbnailBlob`
- `handleCreditsSubmit`
- `handleDownloadVideo`

### 6. UI SECTIONS TO REMOVE
**Lines 2620-2995:** Movie mode UI (effects dropdown, mode selector with movie option)
**Lines 2862-2866:** TransportBar component (first instance)
**Lines 2996-3000:** TransportBar component (second instance)

### 7. JSX MODALS TO REMOVE
**Lines 3465-3497:** Effect modals
```tsx
<TurnTableModal ... />
<RevealModal ... />
<GravityModal ... />
<CreditsModal ... />
```

**Lines 3496-3584:** First ChallengeOverlay block
**Lines 3635-3751:** Second ChallengeOverlay block

---

## WHAT TO KEEP

### ✅ KEEP ALL OF THESE:
- Manual solve mode functionality
- Automated solve mode (Engine 2)
- Reveal slider (lines ~121-123, used for visualization)
- Explosion slider (lines ~125-126, used for visualization)
- All auto-solve logic and handlers
- `EngineSettingsModal`
- `SettingsModal`
- `InfoModal`
- `SolveStats` component
- All piece placement logic
- Undo/redo functionality
- Keyboard shortcuts
- Solution saving logic
- `currentSolutionId` state

### ✅ FIX REFERENCES:
In `visiblePlacedPieces` useMemo (around line 400), remove movie-specific conditions:
- Remove: `if (loadedMovie && solveMode === 'movie')`
- Remove: `if (loadedMovie && solveMode === 'manual')`
- Keep: manual and automated logic

Remove any `solveMode === 'movie'` checks throughout

---

## EXPECTED RESULT

**Final file should:**
- Be ~2,400 lines (down from 3,754)
- Have NO TypeScript errors for removed code
- Keep full manual solving functionality
- Keep full automated solving functionality
- Remove ALL movie/effect/gallery functionality

**Test criteria:**
- File compiles without errors
- Manual mode works (place pieces, undo/redo, save solution)
- Automated mode works (Engine 2 solver)
- No references to removed movie variables

---

## RETURN FORMAT

Please return the complete cleaned `SolvePage.tsx` file, ready to replace the original.

---

## NOTES

- This is a React TypeScript component
- Uses React hooks (useState, useEffect, useRef, etc.)
- Uses Supabase for database operations
- Movie functionality is moving to dedicated `/movies/*` pages
- SolvePage should focus only on puzzle solving
