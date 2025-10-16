-- Supabase Dev Mode Fix
-- This allows saving shapes/solutions without authentication
-- Run this in your Supabase SQL Editor

-- Option 1: Make user_id nullable and remove NOT NULL constraint
-- This is the simplest solution for dev mode

-- Drop existing foreign key constraints
ALTER TABLE shapes DROP CONSTRAINT IF EXISTS shapes_user_id_fkey;
ALTER TABLE solutions DROP CONSTRAINT IF EXISTS solutions_user_id_fkey;

-- Make user_id nullable
ALTER TABLE shapes ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE solutions ALTER COLUMN user_id DROP NOT NULL;

-- Re-add foreign key constraints WITHOUT the NOT NULL requirement
-- Now it allows NULL user_id OR valid user_id from auth.users
ALTER TABLE shapes 
  ADD CONSTRAINT shapes_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;

ALTER TABLE solutions 
  ADD CONSTRAINT solutions_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;

-- Update RLS policies to allow NULL user_id (dev mode)
-- Shapes: Allow operations with NULL user_id OR matching user_id
DROP POLICY IF EXISTS "Dev: Allow all shapes operations" ON shapes;
CREATE POLICY "Dev: Allow all shapes operations"
  ON shapes FOR ALL
  USING (user_id IS NULL OR user_id = auth.uid() OR true)
  WITH CHECK (user_id IS NULL OR user_id = auth.uid() OR true);

-- Solutions: Allow operations with NULL user_id OR matching user_id
DROP POLICY IF EXISTS "Dev: Allow all solutions operations" ON solutions;
CREATE POLICY "Dev: Allow all solutions operations"
  ON solutions FOR ALL
  USING (user_id IS NULL OR user_id = auth.uid() OR true)
  WITH CHECK (user_id IS NULL OR user_id = auth.uid() OR true);

-- Verification queries
SELECT 'Shapes table constraints:' as info;
SELECT conname, contype, confupdtype, confdeltype 
FROM pg_constraint 
WHERE conrelid = 'shapes'::regclass;

SELECT 'Solutions table constraints:' as info;
SELECT conname, contype, confupdtype, confdeltype 
FROM pg_constraint 
WHERE conrelid = 'solutions'::regclass;
