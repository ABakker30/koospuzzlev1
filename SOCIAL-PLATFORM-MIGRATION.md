# Social Puzzle Platform Migration

## Strategic Vision

Transform from multi-page toolkit to focused social puzzle platform with two primary modes:

- **Create Mode**: Design puzzles (starts with single sphere, no browsing)
- **Solve Mode**: Manual assembly with tracked actions
- **Gallery**: Discovery layer connecting creators and solvers
- **Content Generation**: Tracked actions → automatic movies for both creation and solving

## Core Principles

- **URL-Driven**: `/create`, `/solve/[id]`, `/gallery` — no file browsing
- **Social Loop**: Create → Share → Discover → Solve → Share solution
- **Content Platform**: The process (creation/solving) IS the product
- **Always Shippable**: Keep app working throughout migration
- **Clean Migration**: Cleanup after new system proves out

## Migration Phases

### Phase 1: New Create Mode (Parallel Track) 🎯 START HERE

Create `/create` route alongside existing pages

- New simplified UI (no browse, starts with single sphere)
- Reuse existing 3D canvas, effects, presets
- Action tracking infrastructure (add/remove/undo logging)
- Save flow with metadata form (name, creator, public/private)
- Saves to NEW Supabase table structure
- **Old pages still work unchanged**

### Phase 2: New Solve Mode (Parallel Track)

Create `/solve/[id]` route for manual solving

- Loads puzzle from new DB structure
- Simplified solve UI (no creation tools)
- Action tracking for moves + timing
- Auto-saves solution on completion
- **Old solution viewer still accessible**

### Phase 3: Basic Gallery

Create `/gallery` route

- Lists puzzles from new DB table
- Links go to `/solve/[id]`
- Simple filtering (public/private, search)
- No movies yet (static thumbnails)
- **Proves the content loop works**

### Phase 4: Movie Generation

Add playback rendering to both modes

- Creation movies from tracked actions
- Solution movies from tracked moves
- Preview before save
- Store as effect sequences or video

### Phase 5: Cleanup & Migration

- Export existing shapes to puzzle format
- Bulk import as "gallery seed content"
- Remove old routes (`/shape`, `/studio`, `/solutions`)
- Remove browse/upload UI components
- Simplify navigation to Create/Gallery only

### Phase 6: Polish & Social Features

- Landing animation for create mode
- User profiles/attribution
- Ratings, difficulty tags
- Trending/featured puzzles

## Data Strategy

- **No need to preserve existing DB records** (still in dev)
- **Preserve existing shape files** for later import as puzzles
- New Supabase schema for puzzles, solutions, and metadata
- Each puzzle/solution stores tracked actions for movie generation

## Benefits of Incremental Approach

- **Always Shippable**: Each phase produces working features
- **Low Risk**: Old system remains until new one proves out
- **Fast Validation**: Test the content loop (Phase 3) before investing in movies (Phase 4)
- **Data Safety**: Existing shapes preserved as files for later import

## Status

- **Current Phase**: Planning → Phase 1
- **Last Updated**: January 29, 2025
