-- Check the 4 test puzzle and its geometry
SELECT 
  p.id,
  p.name,
  p.shape_id,
  p.creator_name,
  p.created_at,
  cs.cells,
  cs.size
FROM puzzles p
LEFT JOIN contracts_shapes cs ON p.shape_id = cs.id
WHERE p.name LIKE '%4%test%'
ORDER BY p.created_at DESC
LIMIT 1;
