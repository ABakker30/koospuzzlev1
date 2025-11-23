# Blueprint v2 Architectural Restructure Plan

## Overview
Major architectural overhaul following the Blueprint v2 specification to transform the monolithic SolvePage into focused, single-purpose pages.

## Current State (Pre-Restructure)
- **Tag:** `pre-restructure-v2`
- **Branch:** `main`
- **SolvePage:** 3,754 lines (monolithic)
- **Architecture:** 
  - Single SolvePage handles Manual/Auto/Movie modes
  - Separate `koos.shape` and `koos.state` contracts
  - Movies table with stored solution data
  - Mixed concerns throughout

## Target State (Blueprint v2)
- **8+ focused pages** (one purpose each)
- **Unified contracts** (shape + solution in single record)
- **Movie architecture:** Solution + URL params (no video storage)
- **Clean separation:** No cross-page coupling

## Architectural Ground Rules
1. **Single Responsibility** - Each page handles exactly one purpose
2. **No Cross-Page Coupling** - Duplication preferred over coupling
3. **Every Movie Effect Gets Its Own Page** - Prevents page bloat
4. **Canonicalization Is Sacred** - Hash calculations isolated from metadata
5. **Avoid Premature Optimization** - Human-readable code prioritized

## Implementation Phases

### Phase 1: Movie Pages Extraction (Week 1)
**Goal:** Extract all movie effects from SolvePage into separate pages
**Impact:** Reduces SolvePage by ~800 lines

Tasks:
- [ ] Create `src/pages/movies/` folder structure
- [ ] Extract `TurntableMoviePage.tsx` (~300 lines)
- [ ] Extract `GravityMoviePage.tsx` (~300 lines)
- [ ] Extract `ExplosionMoviePage.tsx` (~300 lines)
- [ ] Extract `SolveRevealMoviePage.tsx` (~300 lines)
- [ ] Update routing in `App.tsx`
- [ ] Remove movie mode code from SolvePage
- [ ] Test each movie page independently

**Exit Criteria:**
- All 4 movie pages work standalone
- SolvePage no longer has movie mode code
- Each movie page loads solution and renders effect

### Phase 2: Solution Viewer (Week 2)
**Goal:** Create clean, read-only solution visualization page
**Impact:** ~400 lines, standalone solution viewing

Tasks:
- [ ] Create `src/pages/solution/SolutionViewerPage.tsx`
- [ ] Load solution by hash/ID
- [ ] Display with reveal/explosion sliders
- [ ] No solving logic, no piece selection
- [ ] Update gallery to link to solution viewer
- [ ] Test navigation from gallery

**Exit Criteria:**
- Solution viewer displays any solution correctly
- Reveal slider works (1...N pieces)
- Explosion slider works
- No solving functionality present

### Phase 3: Manual/Auto Split (Week 3)
**Goal:** Split SolvePage into ManualSolvePage and AutomatedSolvePage
**Impact:** Eliminates original 3,754-line SolvePage

Tasks:
- [ ] Create `ManualSolvePage.tsx` (~1,500 lines)
  - Piece selection UI
  - Click-to-place interaction
  - Undo/redo stacks
  - Timer and move counter
- [ ] Create `AutomatedSolvePage.tsx` (~1,200 lines)
  - Engine settings modal
  - Progress monitoring
  - Solution animation
  - Auto-save logic
- [ ] Update routing
- [ ] Delete original `SolvePage.tsx`
- [ ] Test both pages independently

**Exit Criteria:**
- Manual solve page works for user-driven solving
- Automated solve page runs solver and displays results
- No shared code between the two pages
- Original SolvePage deleted

### Phase 4: Unified Contracts (Week 4-5)
**Goal:** Replace dual contracts with unified record format
**Impact:** Foundation for all future features

Tasks:
- [ ] Design unified contract schema
- [ ] Update contract types in `public/data/contracts/`
- [ ] Modify `scripts/contracts/canonicalize.ts`
- [ ] Write migration script for existing data
- [ ] Update all pages to use unified format
- [ ] Migrate database schema
- [ ] Test hash calculations
- [ ] Verify metadata exclusion from hashes

**Exit Criteria:**
- All contracts use unified format
- Shape hash = hash(cells only)
- Solution hash = hash(cells + placements)
- Metadata properly excluded from hashes
- All existing data migrated

### Phase 5: Infrastructure & Polish (Week 6)
**Goal:** Add supporting features and final touches

Tasks:
- [ ] Localization framework
- [ ] Dev/User/Beta mode switching
- [ ] Organizational tagging (country, school, etc.)
- [ ] Purchase page
- [ ] Auth pages (login/register)
- [ ] Update gallery with movie tab
- [ ] Testing suite
- [ ] Documentation

**Exit Criteria:**
- All pages fully functional
- Localization working
- Mode switching implemented
- Testing coverage adequate

## Rollback Plan
If restructure fails or needs to be aborted:
```bash
git checkout main
git reset --hard pre-restructure-v2
```

## Page Structure (Target)
```
src/pages/
├── create/          CreatePage.tsx (keep existing)
├── solve/
│   ├── ManualSolvePage.tsx (new)
│   └── AutomatedSolvePage.tsx (new)
├── solution/        SolutionViewerPage.tsx (new)
├── movies/
│   ├── TurntableMoviePage.tsx (new)
│   ├── GravityMoviePage.tsx (new)
│   ├── ExplosionMoviePage.tsx (new)
│   └── SolveRevealMoviePage.tsx (new)
├── gallery/         GalleryPage.tsx (update)
├── purchase/        PurchasePage.tsx (new)
└── auth/
    ├── LoginPage.tsx (new)
    └── RegisterPage.tsx (new)
```

## Success Metrics
- SolvePage eliminated (was 3,754 lines)
- Each page < 500 lines (except Manual/Auto solve ~1,200-1,500)
- No cross-page coupling
- All tests passing
- Performance maintained or improved
- Code maintainability significantly improved

## Risk Mitigation
1. **Work in branch** - All work stays in `restructure/blueprint-v2`
2. **Incremental commits** - Tag after each phase
3. **Parallel main** - Main branch remains stable for hotfixes
4. **Testing** - Test each phase before moving to next
5. **Documentation** - Track progress in RESTRUCTURE-LOG.md

## Timeline
- Phase 1: Week 1 (Movie pages)
- Phase 2: Week 2 (Solution viewer)
- Phase 3: Week 3 (Manual/Auto split)
- Phase 4: Week 4-5 (Unified contracts)
- Phase 5: Week 6 (Infrastructure)

**Total: ~6 weeks**
