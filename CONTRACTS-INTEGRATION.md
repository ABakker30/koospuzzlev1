# Contracts Integration - Two-Table Architecture

## ✅ Architecture: Canonical Shapes + Playable Puzzles

### The Problem
Need URL-based puzzles while preserving canonical shape uniqueness from contracts system.

### The Solution
**Two-table design:**

```
contracts_shapes (canonical storage)
    ↓ (shape_id reference)
puzzles (playable instances)
    ↓ (puzzle_id reference)
solutions (solve attempts)
```

---

## Tables

### `contracts_shapes` (Existing - No Changes)
**Purpose:** Canonical shape storage with content addressing
**ID:** `sha256:<hash>` - Ensures same geometry = same ID

```sql
- id: TEXT PRIMARY KEY (sha256 hash)
- cells: JSONB [[i,j,k], ...]
- size: INTEGER (sphere count)
- lattice: TEXT ('fcc', 'bcc', etc.)
```

**Key Feature:** Same shape in different orientations → Same ID

---

### `puzzles` (New - Updated Schema)
**Purpose:** Playable puzzle instances with metadata
**ID:** UUID - Clean shareable URLs

```sql
- id: UUID (for /solve/:id URLs)
- shape_id: TEXT → contracts_shapes.id
- name: TEXT
- creator_name: TEXT
- description: TEXT
- challenge_message: TEXT
- visibility: 'public' | 'private'
- actions: JSONB (creation history)
- preset_config: JSONB (visual effects)
- creation_time_ms: INTEGER
- created_at: TIMESTAMPTZ
```

**Note:** Geometry stored in `contracts_shapes.cells`, accessed via `shape_id`

---

### `solutions` (Existing - No Changes)
**Purpose:** Track solve attempts

```sql
- id: UUID
- puzzle_id: UUID → puzzles.id
- solver_name: TEXT
- solution_type: 'manual' | 'auto'
- final_geometry: JSONB
- actions: JSONB
- solve_time_ms: INTEGER
- move_count: INTEGER
```

---

## How It Works

### Creating a Puzzle
1. **Canonicalize** the shape → Get/create `contracts_shapes` entry
2. **Create puzzle** → Reference the shape_id
3. **Result:** Clean URL, canonical uniqueness preserved

```sql
-- Step 1: Ensure shape exists in contracts_shapes
-- (happens automatically via contracts system)

-- Step 2: Create puzzle referencing the shape
INSERT INTO puzzles (shape_id, name, creator_name, ...)
VALUES ('sha256:abc123...', 'My Puzzle', 'Alice', ...)
RETURNING id; -- UUID for URL
```

### Loading a Puzzle
```typescript
// Query joins puzzles with contracts_shapes
const { data } = await supabase
  .from('puzzles')
  .select(`
    *,
    contracts_shapes!inner (cells, size)
  `)
  .eq('id', puzzleId)
  .single();

// Convert cells: [[i,j,k],...] → [{i,j,k},...]
const geometry = data.contracts_shapes.cells.map(
  ([i,j,k]) => ({i, j, k})
);
```

---

## Benefits

✅ **Clean URLs:** `/solve/550e8400-e29b-41d4-a716-446655440000`
✅ **Canonical Uniqueness:** Same shape always has same shape_id
✅ **No Duplication:** Geometry stored once in contracts_shapes
✅ **Flexible Metadata:** Multiple puzzles can reference same shape
✅ **Backward Compatible:** Contracts system unchanged

---

## Examples

### Multiple Puzzles, Same Shape
```sql
-- Same canonical shape
shape_id: 'sha256:abc123...'

-- Different puzzles with different metadata
Puzzle A: "Beginner's Cube" by Alice
Puzzle B: "Speed Challenge" by Bob
Puzzle C: "Daily Puzzle #42" by System

-- All reference the same contracts_shapes entry
```

### Query All Puzzles for a Shape
```sql
SELECT 
  p.id,
  p.name,
  p.creator_name
FROM puzzles p
WHERE p.shape_id = 'sha256:abc123...'
ORDER BY p.created_at DESC;
```

---

## Migration Path

### 1. Run Schema Migration
```bash
# In Supabase SQL Editor
# Run: supabase-puzzles-migration.sql
```

### 2. Import Existing Shapes as Puzzles
```bash
# In Supabase SQL Editor
# Run: import-from-contracts.sql
# This creates puzzle entries for existing contracts_shapes
```

### 3. Test with URLs
```sql
-- Get test URLs
SELECT 
  p.id,
  p.name,
  cs.size,
  'http://localhost:5173/solve/' || p.id::text as url
FROM puzzles p
JOIN contracts_shapes cs ON p.shape_id = cs.id
ORDER BY cs.size
LIMIT 10;
```

---

## Files Updated

### Schema
- ✅ `supabase-puzzles-migration.sql` - Two-table schema

### Loader
- ✅ `src/pages/solve/hooks/usePuzzleLoader.ts` - Join query

### Scripts
- ✅ `import-from-contracts.sql` - Import helper

---

## Testing

```sql
-- 1. Check contracts_shapes exist
SELECT id, size, lattice 
FROM contracts_shapes 
WHERE size BETWEEN 20 AND 40
LIMIT 5;

-- 2. Import as puzzles
INSERT INTO puzzles (shape_id, name, creator_name, visibility, actions)
SELECT 
  id,
  'Test Puzzle ' || size,
  'System',
  'public',
  '[]'::jsonb
FROM contracts_shapes
WHERE size = 27
LIMIT 1
RETURNING id, 'http://localhost:5173/solve/' || id::text as url;

-- 3. Load in browser
-- Copy URL from above and test!
```

---

## Summary

**Architecture:**
- **contracts_shapes** = Canonical truth (content-addressed)
- **puzzles** = Playable instances (UUID URLs)
- **solutions** = Solve tracking

**Key Insight:**
- Geometry lives in `contracts_shapes`
- Metadata lives in `puzzles`
- URLs reference `puzzles.id` (UUID)
- Uniqueness via `puzzles.shape_id` → `contracts_shapes.id`

**Result:**
- ✅ Clean shareable URLs
- ✅ Canonical shape uniqueness
- ✅ No data duplication
- ✅ Contracts system preserved
- ✅ Ready for social features (gallery, ratings, etc.)
