-- Preview: See what puzzle URLs you'll get from existing contracts_shapes
-- This doesn't create anything, just shows what will be created
-- Run this FIRST to see what you have

SELECT 
  ROW_NUMBER() OVER (ORDER BY cs.size, cs.created_at) as number,
  cs.id as shape_id,
  COALESCE(cs.metadata->>'name', cs.file_name, 'Shape ' || substring(cs.id, 8, 8)) as puzzle_name,
  COALESCE(cs.metadata->>'designer', 'Legacy Import') as creator,
  cs.size as sphere_count,
  cs.lattice,
  cs.created_at,
  '(UUID will be generated)' as puzzle_id_placeholder,
  'http://localhost:5173/solve/{uuid}' as url_format
FROM contracts_shapes cs
ORDER BY cs.size, cs.created_at;

-- Count by size
SELECT 
  cs.size,
  cs.lattice,
  COUNT(*) as shape_count
FROM contracts_shapes cs
GROUP BY cs.size, cs.lattice
ORDER BY cs.size;

-- Total count
SELECT COUNT(*) as total_shapes FROM contracts_shapes;
