-- Complete script to set up puzzles and get all URLs
-- Run this in Supabase SQL Editor

-- Step 1: Ensure tables exist (run migration first if needed)
-- If tables don't exist, run supabase-puzzles-migration.sql first

-- Step 2: Import ALL contracts_shapes as puzzles (if not already done)
INSERT INTO puzzles (shape_id, name, creator_name, description, visibility, actions)
SELECT 
  cs.id as shape_id,
  COALESCE(cs.metadata->>'name', cs.file_name, 'Shape ' || substring(cs.id, 8, 8)) as name,
  COALESCE(cs.metadata->>'designer', 'Legacy Import') as creator_name,
  COALESCE(cs.metadata->>'description', 'Imported from contracts_shapes') as description,
  'public' as visibility,
  '[]'::jsonb as actions
FROM contracts_shapes cs
WHERE NOT EXISTS (
  -- Don't create duplicates
  SELECT 1 FROM puzzles p WHERE p.shape_id = cs.id
)
ORDER BY cs.size, cs.created_at;

-- Step 3: Get ALL puzzle URLs with shape info
SELECT 
  p.id as puzzle_id,
  p.name,
  p.creator_name,
  cs.size as sphere_count,
  cs.lattice,
  p.created_at,
  'http://localhost:5173/solve/' || p.id::text as url
FROM puzzles p
JOIN contracts_shapes cs ON p.shape_id = cs.id
ORDER BY cs.size, p.name;

-- Alternative: Just get URLs in simple format
-- SELECT 'http://localhost:5173/solve/' || id::text as url FROM puzzles ORDER BY created_at;
