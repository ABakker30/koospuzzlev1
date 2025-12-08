-- Backfill created_by for existing solutions
-- This links old solutions to their creators based on timing and puzzle ownership

-- Option 1: If you know your user ID, update all your solutions
-- Replace 'YOUR_USER_ID_HERE' with your actual UUID from auth.users
-- UPDATE solutions 
-- SET created_by = 'YOUR_USER_ID_HERE'
-- WHERE created_by IS NULL;

-- Option 2: Show solutions that need updating
SELECT 
  id,
  puzzle_id,
  solution_type,
  solver_name,
  created_by,
  created_at
FROM solutions
WHERE created_by IS NULL
ORDER BY created_at DESC;

-- Option 3: Update based on puzzle creator (if puzzle has creator info)
-- UPDATE solutions s
-- SET created_by = p.created_by
-- FROM puzzles p
-- WHERE s.puzzle_id = p.id
--   AND s.created_by IS NULL
--   AND p.created_by IS NOT NULL;

-- After updating, verify:
-- SELECT COUNT(*) as null_created_by_count FROM solutions WHERE created_by IS NULL;
-- SELECT COUNT(*) as has_created_by_count FROM solutions WHERE created_by IS NOT NULL;
