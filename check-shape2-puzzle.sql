-- Check the "Shape 2" puzzle format

-- Step 1: Check the puzzle itself
SELECT 
  id,
  name,
  shape_id,
  geometry,
  sphere_count,
  created_at
FROM puzzles
WHERE name = 'Shape 2'
ORDER BY created_at DESC
LIMIT 1;

-- Step 2: Check the contracts_shapes format (if it exists)
SELECT 
  cs.id as shape_id,
  cs.lattice,
  cs.cells,
  cs.size,
  p.name as puzzle_name
FROM contracts_shapes cs
LEFT JOIN puzzles p ON p.shape_id = cs.id
WHERE p.name = 'Shape 2'
ORDER BY p.created_at DESC
LIMIT 1;

-- Step 3: Check the format of the first cell in contracts_shapes
-- This will show if it's an array [i,j,k] or object {i,j,k}
SELECT 
  cs.id,
  cs.cells->0 as first_cell,
  pg_typeof(cs.cells->0) as first_cell_type
FROM contracts_shapes cs
LEFT JOIN puzzles p ON p.shape_id = cs.id
WHERE p.name = 'Shape 2'
LIMIT 1;
