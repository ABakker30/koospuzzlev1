-- Migration: Add leaderboard statistics columns to solutions table
-- This enables speed rankings, efficiency rankings, and personal best tracking

-- 1) Add columns if they don't exist yet
ALTER TABLE solutions
ADD COLUMN IF NOT EXISTS total_moves INTEGER,
ADD COLUMN IF NOT EXISTS undo_count INTEGER,
ADD COLUMN IF NOT EXISTS hints_used INTEGER,
ADD COLUMN IF NOT EXISTS solvability_checks_used INTEGER,
ADD COLUMN IF NOT EXISTS duration_ms BIGINT;

-- 2) Optional: backfill with zeros where NULL (for existing solutions)
UPDATE solutions
SET
  total_moves = COALESCE(total_moves, 0),
  undo_count = COALESCE(undo_count, 0),
  hints_used = COALESCE(hints_used, 0),
  solvability_checks_used = COALESCE(solvability_checks_used, 0)
WHERE
  total_moves IS NULL
  OR undo_count IS NULL
  OR hints_used IS NULL
  OR solvability_checks_used IS NULL;

-- 3) Indexes for leaderboard queries (snappy performance)
CREATE INDEX IF NOT EXISTS idx_solutions_puzzle_duration
  ON solutions (puzzle_id, duration_ms);

CREATE INDEX IF NOT EXISTS idx_solutions_puzzle_efficiency
  ON solutions (puzzle_id, hints_used, undo_count);

CREATE INDEX IF NOT EXISTS idx_solutions_user_puzzle
  ON solutions (user_id, puzzle_id);

-- 4) Add comments for documentation
COMMENT ON COLUMN solutions.total_moves IS 'Total board-changing actions during solve';
COMMENT ON COLUMN solutions.undo_count IS 'Number of deletions + undo button presses';
COMMENT ON COLUMN solutions.hints_used IS 'Number of hints requested';
COMMENT ON COLUMN solutions.solvability_checks_used IS 'Number of solvability checks run';
COMMENT ON COLUMN solutions.duration_ms IS 'Time to complete solve in milliseconds';

-- Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'solutions' 
  AND column_name IN (
    'total_moves', 
    'undo_count', 
    'hints_used', 
    'solvability_checks_used', 
    'duration_ms'
  );
