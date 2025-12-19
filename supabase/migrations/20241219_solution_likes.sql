-- Create solution_likes table for tracking user likes on solutions
CREATE TABLE IF NOT EXISTS solution_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id TEXT NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(solution_id, user_id)
);

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_solution_likes_solution_id ON solution_likes(solution_id);
CREATE INDEX IF NOT EXISTS idx_solution_likes_user_id ON solution_likes(user_id);

-- Add like_count and cell_count columns to solutions table if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'solutions' AND column_name = 'like_count') THEN
    ALTER TABLE solutions ADD COLUMN like_count INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'solutions' AND column_name = 'cell_count') THEN
    ALTER TABLE solutions ADD COLUMN cell_count INTEGER;
  END IF;
END $$;

-- RPC function to increment solution likes
CREATE OR REPLACE FUNCTION increment_solution_likes(solution_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE solutions
  SET like_count = COALESCE(like_count, 0) + 1
  WHERE id = solution_id;
END;
$$;

-- RPC function to decrement solution likes
CREATE OR REPLACE FUNCTION decrement_solution_likes(solution_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE solutions
  SET like_count = GREATEST(COALESCE(like_count, 0) - 1, 0)
  WHERE id = solution_id;
END;
$$;

-- Enable RLS on solution_likes
ALTER TABLE solution_likes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own likes
CREATE POLICY solution_likes_insert_policy ON solution_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own likes
CREATE POLICY solution_likes_delete_policy ON solution_likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: Everyone can view likes
CREATE POLICY solution_likes_select_policy ON solution_likes
  FOR SELECT
  USING (true);
