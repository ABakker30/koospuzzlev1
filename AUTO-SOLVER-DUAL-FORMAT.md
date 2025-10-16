# Auto Solver - Dual-Format Support Implementation

## Overview

Successfully implemented dual-format support for the Auto Solver: reads both legacy shapes and koos.shape@1 shapes as input, always outputs koos.state@1 solutions.

## Implementation Summary

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Auto Solver Page                    │
│  ┌──────────────────────────────────────────────┐   │
│  │         LoadShapeModal (Dual Format)         │   │
│  │  [Legacy Format] [koos.shape@1 Format]      │   │
│  └──────────────────────────────────────────────┘   │
│                         │                            │
│                         ├─────────┬──────────┐       │
│                         ▼         ▼          ▼       │
│              ┌──────────────┐ ┌──────┐ ┌─────────┐  │
│              │ Format Reader│ │Legacy│ │Contract│  │
│              │  (Auto-detect)│ │ API │ │  API   │  │
│              └──────────────┘ └──────┘ └─────────┘  │
│                         │                            │
│                         ▼                            │
│              ┌──────────────────┐                    │
│              │   Detect Format  │                    │
│              │ & Compute Ref    │                    │
│              └──────────────────┘                    │
│                         │                            │
│                         ▼                            │
│              ┌──────────────────┐                    │
│              │  Engine 2 Solver │                    │
│              │  (Unchanged)     │                    │
│              └──────────────────┘                    │
│                         │                            │
│                         ▼                            │
│              ┌──────────────────┐                    │
│              │ Solution Writer  │                    │
│              │  (koos.state@1)  │                    │
│              └──────────────────┘                    │
└─────────────────────────────────────────────────────┘
```

### Files Created

1. **`src/services/solutionCanonical.ts`** (148 lines)
   - `canonicalizePlacements()` - Sort and dedupe placements
   - `canonicalizeSolution()` - Canonical solution format
   - `computeSolutionId()` - Content-addressed ID (SHA-256)
   - `createKoosSolution()` - Create complete koos.state@1
   - `verifySolutionId()` - Verify ID matches content

2. **`src/services/solutionCanonical.test.ts`** (202 lines)
   - 14 comprehensive unit tests
   - All tests passing ✅

3. **`AUTO-SOLVER-DUAL-FORMAT.md`** (this file)
   - Complete documentation

### Files Modified

1. **`src/pages/AutoSolverPage.tsx`** (~50 lines changed)
   - Added format detection on shape load
   - Track `shapeRef` and `loadedShapeFile`
   - Compute shapeRef for legacy shapes
   - Convert save to koos.state@1 format

2. **`src/api/contracts.ts`** (~40 lines added)
   - `uploadContractSolution()` - Upload to storage + database
   - Writes to `solutions/<id>.solution.json`
   - Upserts to `contracts_solutions` table

## Format Specifications

### Input Formats (Both Supported)

#### koos.shape@1 (New)
```json
{
  "schema": "koos.shape",
  "version": 1,
  "id": "sha256:...",
  "lattice": "fcc",
  "cells": [[i, j, k], ...]
}
```

#### Legacy Shape
```json
{
  "schema": "ab.container.v2",
  "name": "My Shape",
  "cid": "...",
  "cells": [[i, j, k], ...],
  "meta": { ... }
}
```

### Output Format (Always koos.state@1)

```json
{
  "schema": "koos.state",
  "version": 1,
  "id": "sha256:...",
  "shapeRef": "sha256:...",
  "placements": [
    {
      "pieceId": "A",
      "anchorIJK": [i, j, k],
      "orientationIndex": 0
    }
  ]
}
```

## Canonicalization Rules

Per `/public/data/contracts/id-hashing.md`:

### Placement Canonicalization
1. **Upper-case pieceId** (A, B, C, ...)
2. **Remove duplicates** (same pieceId + anchorIJK + orientationIndex)
3. **Sort lexicographically**:
   - First by `pieceId` (alphabetical)
   - Then by `anchorIJK` (i, then j, then k)
   - Finally by `orientationIndex` (numerical)

### Solution ID Computation
1. Canonicalize placements
2. Serialize to JSON with alphabetical keys:
   ```json
   {
     "placements": [...],
     "schema": "koos.state",
     "shapeRef": "sha256:...",
     "version": 1
   }
   ```
3. Compute SHA-256 hash of UTF-8 bytes
4. Prefix with `sha256:`

### Example

```typescript
// Input placements (any order, mixed case)
const placements = [
  { pieceId: 'b', anchorIJK: [1, 0, 0], orientationIndex: 0 },
  { pieceId: 'a', anchorIJK: [0, 0, 0], orientationIndex: 1 }
];

// Canonical placements (upper-case, sorted)
const canonical = [
  { pieceId: 'A', anchorIJK: [0, 0, 0], orientationIndex: 1 },
  { pieceId: 'B', anchorIJK: [1, 0, 0], orientationIndex: 0 }
];

// Compute SHA-256 hash
const id = "sha256:7b3f8c...";
```

## User Workflows

### Loading Shapes

#### Legacy Shape
1. Click "Browse"
2. Select "Legacy Format" tab
3. Browse from legacy `shapes` table
4. Click "Load"
5. Auto Solver detects legacy format
6. Computes shapeRef from cells
7. Stores shapeRef for later use

#### koos.shape@1 Shape
1. Click "Browse"
2. Select "koos.shape@1 Format" tab
3. Browse from `contracts_shapes` table
4. Click "Load"
5. Auto Solver detects new format
6. Extracts shapeRef from file.cid
7. Stores shapeRef for later use

### Solving & Saving

1. Load any shape (legacy or new)
2. Click "Run" to start solver
3. Wait for solution
4. Click "Save" when solution found
5. Enter solution name
6. **Auto Solver always saves in koos.state@1 format**:
   - Converts placements to canonical format
   - Computes content-addressed ID
   - Uploads to `solutions/<id>.solution.json`
   - Records in `contracts_solutions` table

## Data Flow

### Load Flow (Legacy Shape)

```
User loads legacy shape
    ↓
Format reader detects schema: "ab.container.v2"
    ↓
Extract cells from file
    ↓
Create koos.shape@1 from cells (canonicalize)
    ↓
Compute shapeRef = SHA-256(canonical shape)
    ↓
Store shapeRef for solution save
    ↓
Solver uses cells array (format-agnostic)
```

### Load Flow (New Shape)

```
User loads koos.shape@1 shape
    ↓
Format reader detects schema: "koos.shape"
    ↓
Extract shapeRef from file.cid (already content-addressed)
    ↓
Store shapeRef for solution save
    ↓
Solver uses cells array (format-agnostic)
```

### Save Flow (Always koos.state@1)

```
Solver finds solution
    ↓
User clicks Save
    ↓
Convert engine placements:
  { pieceId, ori, t } → { pieceId, anchorIJK, orientationIndex }
    ↓
Canonicalize placements:
  - Upper-case pieceId
  - Deduplicate
  - Sort by pieceId → anchorIJK → orientationIndex
    ↓
Create koos.state@1:
  {
    schema: "koos.state",
    version: 1,
    shapeRef: <from load>,
    placements: <canonical>
  }
    ↓
Compute ID = SHA-256(canonical JSON)
    ↓
Upload to Supabase:
  - File: solutions/<id>.solution.json
  - Database: contracts_solutions table
    ↓
Success!
```

## Testing

### Unit Tests (14/14 passing)

```bash
npm run test -- solutionCanonical.test.ts
```

**Coverage:**
- ✅ Placement canonicalization (upper-case, dedupe, sort)
- ✅ Solution canonicalization (preserve shapeRef, canonical placements)
- ✅ ID computation (SHA-256)
- ✅ Determinism (same input → same ID)
- ✅ Order independence (sorted before hash)
- ✅ Solution creation (complete koos.state@1 with ID)
- ✅ ID verification (correct vs incorrect)

### Test Results

```
✓ Solution Canonicalization (14 tests) 23ms
  ✓ canonicalizePlacements
    ✓ should upper-case pieceId (1ms)
    ✓ should remove duplicates (1ms)
    ✓ should sort by pieceId first (13ms)
    ✓ should sort by anchorIJK after pieceId (0ms)
    ✓ should sort by orientationIndex last (0ms)
  ✓ canonicalizeSolution
    ✓ should preserve shapeRef (0ms)
    ✓ should canonicalize placements (0ms)
  ✓ computeSolutionId
    ✓ should compute a sha256 hash (2ms)
    ✓ should be deterministic (1ms)
    ✓ should be order-independent (1ms)
  ✓ createKoosSolution
    ✓ should create solution with computed ID (1ms)
    ✓ should canonicalize placements (0ms)
  ✓ verifySolutionId
    ✓ should verify correct ID (0ms)
    ✓ should reject incorrect ID (1ms)
```

## Contract Compliance

### ID Hashing ✅

Per `/public/data/contracts/id-hashing.md`:

1. ✅ **UTF-8 encoding** - JSON.stringify uses UTF-8
2. ✅ **Stable key order** - Alphabetical at every level
3. ✅ **Integers as integers** - No trailing decimals
4. ✅ **No duplicates** - Deduped before hashing
5. ✅ **Sort placements** - Lexicographic by pieceId → anchorIJK → orientationIndex
6. ✅ **SHA-256 hash** - Web Crypto API
7. ✅ **Prefix `sha256:`** - Applied to hex output

### Contract Schema ✅

Per `/public/data/contracts/solution.json`:

```typescript
{
  schema: 'koos.state',    // ✅ Correct
  version: 1,              // ✅ Correct
  id: 'sha256:...',       // ✅ Content-addressed
  shapeRef: 'sha256:...',  // ✅ References shape ID
  placements: [            // ✅ Canonical array
    {
      pieceId: 'A',               // ✅ Upper-case
      anchorIJK: [i,j,k],         // ✅ Integer triple
      orientationIndex: n         // ✅ Integer
    }
  ]
}
```

## Storage Layout

### Supabase Storage Buckets

**`solutions/` bucket:**
- koos.state@1: `{solutionId}.solution.json`

### Database Tables

**`contracts_solutions` table:**
```sql
id (PK), shape_id, placements, is_full, created_at
```

## ShapeRef Computation

### For Legacy Shapes

When a legacy shape is loaded:
1. Extract cells from file
2. Create koos.shape@1 format:
   ```typescript
   {
     schema: 'koos.shape',
     version: 1,
     lattice: 'fcc',
     cells: <canonicalized cells>
   }
   ```
3. Canonicalize cells (sort, dedupe)
4. Compute SHA-256 hash
5. shapeRef = `sha256:<hash>`

### For koos.shape@1 Shapes

When a koos.shape@1 shape is loaded:
1. ShapeRef is already in file.cid
2. Use it directly (already content-addressed)

## Exit Criteria

✅ **Can load legacy shapes**
- Format detected correctly
- ShapeRef computed from cells
- Solver runs normally

✅ **Can load koos.shape@1 shapes**
- Format detected correctly
- ShapeRef extracted from file
- Solver runs normally

✅ **Always outputs koos.state@1**
- Content-addressed ID computed
- Uploaded to `solutions/<id>.solution.json`
- Record in `contracts_solutions` table

✅ **Deterministic IDs**
- Same input cells → same shapeRef
- Same placements → same solution ID
- Order-independent (canonical sorting)

✅ **No regressions**
- Solver engine unchanged
- UI unchanged
- Existing functionality preserved

## Key Features

- **Format-agnostic solver**: Engine doesn't care about input format
- **Content-addressed outputs**: All solutions have deterministic IDs
- **Automatic conversion**: Legacy shapes auto-converted to shapeRef
- **Clean separation**: Input format vs output format decoupled
- **Comprehensive tests**: 14 unit tests, all passing
- **Contract compliant**: Follows id-hashing.md spec exactly

## Build Status

✅ **Build successful**
- No TypeScript errors
- All imports resolved
- Bundle size: ~1.14 MB (gzipped: 314 KB)

## Future Enhancements

1. **Batch solver**: Run multiple solutions with different seeds
2. **Solution comparison**: Compare IDs to detect duplicates
3. **Shape library**: Auto-create shape from cells if not in database
4. **Solution viewer integration**: Direct link from save to viewer
5. **Export options**: Download local koos.state@1 files

##
