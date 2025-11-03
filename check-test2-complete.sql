-- Comprehensive check for "test 2" puzzle

-- Step 1: Check puzzles table
SELECT 
  'PUZZLES TABLE' as source,
  id,
  name,
  shape_id,
  geometry,
  sphere_count
FROM puzzles
WHERE name = 'test 2'
ORDER BY created_at DESC
LIMIT 1;

-- Step 2: Check if shape exists in contracts_shapes
SELECT
  'CONTRACTS_SHAPES TABLE' as source,
  id,
  cells,
  pg_typeof(cells) as cells_type,
  pg_typeof(cells->0) as first_cell_type
FROM contracts_shapes
WHERE id = (SELECT shape_id FROM puzzles WHERE name = 'test 2' ORDER BY created_at DESC LIMIT 1);

-- Step 3: Test what the loader will see
SELECT
  p.id,
  p.name,
  p.shape_id,
  p.geometry as puzzle_geometry,
  cs.cells as shape_cells,
  CASE 
    WHEN cs.cells IS NOT NULL THEN 'Will use contracts_shapes'
    WHEN p.geometry IS NOT NULL THEN 'Will use puzzles.geometry'
    ELSE 'NO GEOMETRY FOUND!'
  END as loader_will_use
FROM puzzles p
LEFT JOIN contracts_shapes cs ON cs.id = p.shape_id
WHERE p.name = 'test 2'
ORDER BY p.created_at DESC
LIMIT 1;
