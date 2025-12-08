-- Migration: Add created_by column to solutions table
-- This enables proper user tracking for movie creation permissions

-- Add created_by column
ALTER TABLE solutions 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_solutions_created_by ON solutions(created_by);

-- Backfill existing solutions (set to NULL or a default user if needed)
-- UPDATE solutions SET created_by = NULL WHERE created_by IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN solutions.created_by IS 'User who created this solution (for permissions and movie creation)';

-- Verify the change
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'solutions' 
  AND column_name IN ('created_by', 'puzzle_id', 'solver_name');
