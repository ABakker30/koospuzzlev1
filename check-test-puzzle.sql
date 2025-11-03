-- Check for the newly created "test" puzzle
SELECT 
  id,
  name,
  creator_name,
  shape_id,
  geometry,
  sphere_count,
  created_at,
  visibility
FROM puzzles
WHERE name = 'test'
ORDER BY created_at DESC
LIMIT 5;

-- Also check the contracts_shapes table for the shape
SELECT 
  cs.id as shape_id,
  cs.lattice,
  cs.cells,
  cs.size,
  p.name as puzzle_name
FROM contracts_shapes cs
LEFT JOIN puzzles p ON p.shape_id = cs.id
WHERE p.name = 'test'
LIMIT 5;
