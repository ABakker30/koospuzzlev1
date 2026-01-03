-- Migration: Update solver_name from email to username
-- This fixes existing solutions that stored email addresses instead of usernames

-- Update solutions where solver_name looks like an email and we can find the matching user
UPDATE solutions s
SET solver_name = u.username
FROM users u
WHERE s.created_by = u.id
  AND s.solver_name LIKE '%@%'
  AND u.username IS NOT NULL
  AND u.username != '';

-- Log how many were updated (for verification in Supabase dashboard)
-- SELECT COUNT(*) FROM solutions WHERE solver_name NOT LIKE '%@%';
