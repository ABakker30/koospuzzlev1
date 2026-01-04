-- Migration: Create test_users_tracking table for managing generated test data
-- This allows easy identification and cleanup of test users and their related data

-- Create tracking table for test user generation batches
CREATE TABLE IF NOT EXISTS test_generation_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name TEXT NOT NULL,
  user_count INTEGER NOT NULL DEFAULT 0,
  solutions_count INTEGER NOT NULL DEFAULT 0,
  badges_count INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT
);

-- Create tracking table for individual test users
CREATE TABLE IF NOT EXISTS test_users (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES test_generation_batches(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_test_users_batch_id ON test_users(batch_id);
CREATE INDEX IF NOT EXISTS idx_test_users_email ON test_users(email);

-- Add avatar_url column to users table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'avatar_url') THEN
    ALTER TABLE users ADD COLUMN avatar_url TEXT;
  END IF;
END $$;

-- Function to delete a test generation batch and all related data
CREATE OR REPLACE FUNCTION delete_test_batch(batch_uuid UUID)
RETURNS TABLE(
  deleted_users INTEGER,
  deleted_solutions INTEGER,
  deleted_badges INTEGER,
  deleted_likes INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_ids UUID[];
  v_deleted_users INTEGER := 0;
  v_deleted_solutions INTEGER := 0;
  v_deleted_badges INTEGER := 0;
  v_deleted_likes INTEGER := 0;
BEGIN
  -- Get all user IDs in this batch
  SELECT ARRAY_AGG(id) INTO v_user_ids
  FROM test_users
  WHERE batch_id = batch_uuid;
  
  IF v_user_ids IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0, 0;
    RETURN;
  END IF;
  
  -- Count and delete solution_likes
  SELECT COUNT(*) INTO v_deleted_likes
  FROM solution_likes
  WHERE user_id = ANY(v_user_ids);
  
  DELETE FROM solution_likes WHERE user_id = ANY(v_user_ids);
  
  -- Count and delete user_badges
  SELECT COUNT(*) INTO v_deleted_badges
  FROM user_badges
  WHERE user_id = ANY(v_user_ids);
  
  DELETE FROM user_badges WHERE user_id = ANY(v_user_ids);
  
  -- Count and delete solutions (by created_by)
  SELECT COUNT(*) INTO v_deleted_solutions
  FROM solutions
  WHERE created_by = ANY(v_user_ids);
  
  DELETE FROM solutions WHERE created_by = ANY(v_user_ids);
  
  -- Count users to delete
  v_deleted_users := array_length(v_user_ids, 1);
  
  -- Delete from users table (this also deletes from auth.users via cascade)
  DELETE FROM users WHERE id = ANY(v_user_ids);
  
  -- Delete the batch record (cascades to test_users)
  DELETE FROM test_generation_batches WHERE id = batch_uuid;
  
  RETURN QUERY SELECT v_deleted_users, v_deleted_solutions, v_deleted_badges, v_deleted_likes;
END;
$$;

-- Function to list all test batches with summary
CREATE OR REPLACE FUNCTION list_test_batches()
RETURNS TABLE(
  batch_id UUID,
  batch_name TEXT,
  user_count INTEGER,
  solutions_count INTEGER,
  badges_count INTEGER,
  likes_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, batch_name, user_count, solutions_count, badges_count, likes_count, created_at
  FROM test_generation_batches
  ORDER BY created_at DESC;
$$;

-- RLS policies (admin only via service role)
ALTER TABLE test_generation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages test batches"
  ON test_generation_batches FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages test users"
  ON test_users FOR ALL
  USING (auth.role() = 'service_role');

-- Grant permissions
GRANT ALL ON test_generation_batches TO service_role;
GRANT ALL ON test_users TO service_role;

COMMENT ON TABLE test_generation_batches IS 'Tracks batches of generated test users for easy cleanup';
COMMENT ON TABLE test_users IS 'Individual test users linked to generation batches';
COMMENT ON FUNCTION delete_test_batch IS 'Deletes a test batch and all related data (users, solutions, badges, likes)';
