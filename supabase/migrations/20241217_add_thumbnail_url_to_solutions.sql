-- Add thumbnail_url column to solutions table
-- This column stores the public URL of the solution screenshot thumbnail

ALTER TABLE solutions
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add index for faster thumbnail queries in gallery
CREATE INDEX IF NOT EXISTS idx_solutions_thumbnail_url 
ON solutions(thumbnail_url) 
WHERE thumbnail_url IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN solutions.thumbnail_url IS 'Public URL of the solution screenshot thumbnail stored in solution-thumbnails bucket';
