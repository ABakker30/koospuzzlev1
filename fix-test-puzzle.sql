-- Fix the "test" puzzle by removing the invalid shape from contracts_shapes
-- The puzzle will then load from puzzles.geometry instead (which is valid)

-- Step 1: Check what we're about to delete
SELECT 
  cs.id as shape_id,
  p.name as puzzle_name,
  cs.cells
FROM contracts_shapes cs
JOIN puzzles p ON p.shape_id = cs.id
WHERE p.name = 'test'
ORDER BY p.created_at DESC;

-- Step 2: Delete the invalid shape
DELETE FROM contracts_shapes 
WHERE id = (
  SELECT shape_id FROM puzzles 
  WHERE name = 'test' 
  ORDER BY created_at DESC 
  LIMIT 1
);

-- Step 3: Verify - puzzle should still exist, but shape_id reference is gone
SELECT 
  id,
  name,
  shape_id,
  geometry,
  sphere_count
FROM puzzles
WHERE name = 'test'
ORDER BY created_at DESC
LIMIT 1;
