-- Add geometry column to puzzles table
-- Quick fix to match current code expectations

ALTER TABLE puzzles
ADD COLUMN IF NOT EXISTS geometry JSONB;

ALTER TABLE puzzles
ADD COLUMN IF NOT EXISTS sphere_count INTEGER;

COMMENT ON COLUMN puzzles.geometry IS 'Array of sphere positions in IJK coordinates [{i, j, k}, ...]';
COMMENT ON COLUMN puzzles.sphere_count IS 'Number of spheres in the puzzle';
