-- Add DELETE policy for movies table
-- DEV MODE: Anyone can delete movies (for development/testing)

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Anyone can delete movies during dev" ON movies;

-- Create new DELETE policy
CREATE POLICY "Anyone can delete movies during dev"
  ON movies FOR DELETE
  USING (true);

-- Note: In production, this should be restricted to:
-- USING (auth.uid() = created_by OR auth.role() = 'admin')
