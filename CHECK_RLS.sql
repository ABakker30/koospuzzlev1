-- Check RLS policies on puzzles table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'puzzles';

-- Check if RLS is enabled on puzzles table
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'puzzles';

-- Try to query puzzles as anonymous user
SET ROLE anon;
SELECT COUNT(*) FROM puzzles;
RESET ROLE;

-- Check table permissions
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name='puzzles' AND grantee IN ('anon', 'authenticated', 'public');
