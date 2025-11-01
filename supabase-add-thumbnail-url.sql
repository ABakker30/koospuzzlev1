-- Add thumbnail_url column to puzzles table
ALTER TABLE puzzles 
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add comment
COMMENT ON COLUMN puzzles.thumbnail_url IS 'URL to puzzle thumbnail image in Supabase Storage';
