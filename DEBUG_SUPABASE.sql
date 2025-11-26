-- Run these queries in Supabase SQL Editor to debug the table access issue

-- Check if puzzles table exists
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'puzzles';

-- Check RLS policies on puzzles table
SELECT * FROM pg_policies WHERE tablename = 'puzzles';

-- Try to select from puzzles as anon user
SET ROLE anon;
SELECT COUNT(*) FROM puzzles;
RESET ROLE;

-- Check if there are any puzzles
SELECT COUNT(*) FROM puzzles;

-- Check grants
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name='puzzles';
