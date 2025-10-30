-- Migrate existing shapes to puzzles table for testing
-- Run this in Supabase SQL Editor

-- Example: Insert a simple test puzzle (8-cell cube)
INSERT INTO puzzles (name, creator_name, description, challenge_message, visibility, geometry, actions, sphere_count)
VALUES (
  'Test Cube 8',
  'System',
  'Simple 8-cell cube for testing',
  'Can you solve this basic cube?',
  'public',
  '[
    {"i":0,"j":0,"k":0},
    {"i":1,"j":0,"k":0},
    {"i":0,"j":1,"k":0},
    {"i":1,"j":1,"k":0},
    {"i":0,"j":0,"k":1},
    {"i":1,"j":0,"k":1},
    {"i":0,"j":1,"k":1},
    {"i":1,"j":1,"k":1}
  ]'::jsonb,
  '[]'::jsonb,
  8
);

-- Larger test puzzle (27-cell cube)
INSERT INTO puzzles (name, creator_name, description, challenge_message, visibility, geometry, actions, sphere_count)
VALUES (
  'Test Cube 27',
  'System',
  '27-cell 3x3x3 cube for testing',
  'A classic 3x3x3 cube puzzle!',
  'public',
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
);

-- Query to get puzzle URLs
SELECT 
  id,
  name,
  sphere_count,
  'http://localhost:5173/solve/' || id::text as url
FROM puzzles
ORDER BY sphere_count;

-- If you want to see what you just inserted:
SELECT 
  id,
  name,
  creator_name,
  sphere_count,
  visibility,
  created_at
FROM puzzles
ORDER BY created_at DESC;
