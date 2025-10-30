-- Import existing contracts_shapes as puzzles for testing
-- This preserves canonical shape IDs while creating playable puzzles

-- Example 1: Import a specific shape by ID
INSERT INTO puzzles (shape_id, name, creator_name, description, challenge_message, visibility, actions)
VALUES (
  'sha256:YOUR_SHAPE_ID_HERE',
  'Test Puzzle',
  'System',
  'Imported from contracts',
  'Can you solve this?',
  'public',
  '[]'::jsonb
)
RETURNING 
  id as puzzle_id,
  'http://localhost:5173/solve/' || id::text as puzzle_url,
  shape_id;

-- Example 2: Import multiple shapes (20-40 cells) as puzzles
INSERT INTO puzzles (shape_id, name, creator_name, description, visibility, actions, creation_time_ms)
SELECT 
  cs.id as shape_id,
  COALESCE(cs.metadata->>'name', 'Shape ' || substring(cs.id, 8, 8)) as name,
  COALESCE(cs.metadata->>'designer', 'Legacy Import') as creator_name,
  'Imported from contracts_shapes' as description,
  'public' as visibility,
  '[]'::jsonb as actions,
  NULL as creation_time_ms
FROM contracts_shapes cs
WHERE cs.size BETWEEN 20 AND 40
  AND cs.lattice = 'fcc'
  AND NOT EXISTS (
    -- Don't create duplicate puzzles for the same shape
    SELECT 1 FROM puzzles p WHERE p.shape_id = cs.id
  )
ORDER BY cs.size
LIMIT 10
RETURNING 
  id,
  name,
  shape_id,
  'http://localhost:5173/solve/' || id::text as url;

-- Example 3: Query to see all puzzles with their shape info
SELECT 
  p.id as puzzle_id,
  p.name,
  p.creator_name,
  cs.size as sphere_count,
  cs.lattice,
  'http://localhost:5173/solve/' || p.id::text as url
FROM puzzles p
JOIN contracts_shapes cs ON p.shape_id = cs.id
ORDER BY cs.size;

-- Example 4: Find if a shape already has puzzles
SELECT 
  cs.id as shape_id,
  cs.size,
  COUNT(p.id) as puzzle_count,
  array_agg(p.name) as puzzle_names
FROM contracts_shapes cs
LEFT JOIN puzzles p ON cs.shape_id = p.shape_id
WHERE cs.size BETWEEN 20 AND 40
GROUP BY cs.id, cs.size
ORDER BY cs.size;
