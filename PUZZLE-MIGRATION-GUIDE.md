# Puzzle Migration Guide

## Quick Start: Get a Test Puzzle URL

### Option 1: Quick SQL Insert (Fastest - 2 minutes)

**Step 1:** Open Supabase SQL Editor
- Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql

**Step 2:** Run the migration script
```sql
-- Copy and paste from: migrate-shapes-to-puzzles.sql
-- This creates 2 test puzzles (8 cells and 27 cells)
```

**Step 3:** Get the URL
The script will output URLs like:
```
http://localhost:5173/solve/550e8400-e29b-41d4-a716-446655440000
```

Copy one and test!

---

### Option 2: Import All Shapes (Comprehensive - 5 minutes)

**Prerequisites:**
```bash
npm install tsx
```

**Step 1:** Run the import script
```bash
npx tsx scripts/import-shapes-to-puzzles.ts
```

This will:
- ✅ Scan `public/data/*.json` for shape files
- ✅ Import each to `puzzles` table
- ✅ Output URLs for each puzzle
- ✅ Skip duplicates

**Step 2:** Query all puzzle URLs
```sql
SELECT 
  id,
  name,
  sphere_count,
  'http://localhost:5173/solve/' || id::text as url
FROM puzzles
ORDER BY sphere_count;
```

---

### Option 3: Manual Insert (Custom)

```sql
INSERT INTO puzzles (name, creator_name, geometry, actions, sphere_count)
VALUES (
  'My Test Puzzle',
  'Me',
  '[{"i":0,"j":0,"k":0}, {"i":1,"j":0,"k":0}]'::jsonb,
  '[]'::jsonb,
  2
)
RETURNING id, 'http://localhost:5173/solve/' || id::text as url;
```

---

## Finding Good Test Puzzles

### By Size
```sql
-- Small puzzles (good for quick testing)
SELECT id, name, sphere_count 
FROM puzzles 
WHERE sphere_count BETWEEN 8 AND 20
ORDER BY sphere_count;

-- Medium puzzles (good for solver testing)
SELECT id, name, sphere_count 
FROM puzzles 
WHERE sphere_count BETWEEN 20 AND 60
ORDER BY sphere_count;

-- Large puzzles (stress test)
SELECT id, name, sphere_count 
FROM puzzles 
WHERE sphere_count > 60
ORDER BY sphere_count;
```

### Random Puzzle
```sql
SELECT 
  id,
  name,
  sphere_count,
  'http://localhost:5173/solve/' || id::text as url
FROM puzzles
WHERE sphere_count BETWEEN 20 AND 40
ORDER BY RANDOM()
LIMIT 1;
```

---

## Recommended: Quick Test Setup

**1. Run this ONE SQL command in Supabase:**

```sql
-- Insert a perfect 27-cell cube (easy for auto-solver)
INSERT INTO puzzles (name, creator_name, geometry, actions, sphere_count)
VALUES (
  'Test Cube 3x3x3',
  'System',
  '[
    {"i":0,"j":0,"k":0}, {"i":1,"j":0,"k":0}, {"i":2,"j":0,"k":0},
    {"i":0,"j":1,"k":0}, {"i":1,"j":1,"k":0}, {"i":2,"j":1,"k":0},
    {"i":0,"j":2,"k":0}, {"i":1,"j":2,"k":0}, {"i":2,"j":2,"k":0},
    {"i":0,"j":0,"k":1}, {"i":1,"j":0,"k":1}, {"i":2,"j":0,"k":1},
    {"i":0,"j":1,"k":1}, {"i":1,"j":1,"k":1}, {"i":2,"j":1,"k":1},
    {"i":0,"j":2,"k":1}, {"i":1,"j":2,"k":1}, {"i":2,"j":2,"k":1},
    {"i":0,"j":0,"k":2}, {"i":1,"j":0,"k":2}, {"i":2,"j":0,"k":2},
    {"i":0,"j":1,"k":2}, {"i":1,"j":1,"k":2}, {"i":2,"j":1,"k":2},
    {"i":0,"j":2,"k":2}, {"i":1,"j":2,"k":2}, {"i":2,"j":2,"k":2}
  ]'::jsonb,
  '[]'::jsonb,
  27
)
RETURNING 
  id,
  name,
  sphere_count,
  'http://localhost:5173/solve/' || id::text as url;
```

**2. Copy the URL from the output**

**3. Test!**
- Manual solve
- Auto-solve
- Reveal slider
- Explosion slider
- Save solution

---

## Troubleshooting

### "No puzzle found"
- Check the puzzle ID in URL matches database
- Verify `puzzles` table exists
- Check Supabase connection in .env

### "Failed to load puzzle"
- Check browser console for errors
- Verify geometry is valid JSONB array
- Each cell must have i, j, k properties

### Auto-solve not working
- Check browser console for piece database loading
- Verify puzzle has solvable geometry
- Try smaller puzzle first (8-27 cells)

---

## Next Steps

After testing with migrated puzzles:
1. **Clean up** - Delete test puzzles if needed
2. **Create real puzzles** - Use Create Mode to make actual puzzles
3. **Gallery** - Build Phase 3 to browse all puzzles
4. **Migrate legacy** - Import all existing shapes if desired
