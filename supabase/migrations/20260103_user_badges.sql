-- Migration: Create user_badges table for storing earned badges
-- Run this in Supabase SQL Editor

-- Create user_badges table
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

-- Create index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);

-- Enable RLS
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read badges (public display)
CREATE POLICY "Badges are publicly readable" ON user_badges
  FOR SELECT USING (true);

-- Grant new explorer badge to all existing users
INSERT INTO user_badges (user_id, badge_id)
SELECT id, 'new_explorer' FROM users
ON CONFLICT (user_id, badge_id) DO NOTHING;

-- Grant solver badges based on solution counts
-- Note: puzzles table doesn't have created_by, so puzzle_maker badges need schema update
WITH solve_counts AS (
  SELECT created_by, COUNT(*) as cnt
  FROM solutions
  WHERE created_by IS NOT NULL AND solution_type = 'manual'
  GROUP BY created_by
)
INSERT INTO user_badges (user_id, badge_id)
SELECT created_by,
  CASE 
    WHEN cnt >= 50 THEN 'solver_3'
    WHEN cnt >= 10 THEN 'solver_2'
    ELSE 'solver_1'
  END
FROM solve_counts
WHERE cnt >= 1
ON CONFLICT (user_id, badge_id) DO NOTHING;

-- Verify badges were created
SELECT u.username, ub.badge_id, ub.earned_at
FROM user_badges ub
JOIN users u ON ub.user_id = u.id
ORDER BY u.username, ub.badge_id;
