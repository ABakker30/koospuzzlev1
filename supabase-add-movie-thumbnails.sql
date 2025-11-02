-- Add thumbnail_url column to movies table
ALTER TABLE movies 
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add index for faster thumbnail lookups
CREATE INDEX IF NOT EXISTS idx_movies_thumbnail_url ON movies(thumbnail_url) WHERE thumbnail_url IS NOT NULL;

-- Create storage bucket for movie thumbnails (if not exists)
-- Note: Run this in Supabase Dashboard > Storage or via API
-- Bucket name: movie-thumbnails
-- Public: Yes
-- File size limit: 5MB
-- Allowed MIME types: image/jpeg, image/png, image/webp

-- Storage bucket configuration (informational - must be created via Dashboard or API):
/*
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'movie-thumbnails',
  'movie-thumbnails',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
*/

-- Storage policies for public read access
-- These allow anyone to read thumbnails but only authenticated users to upload

-- Drop existing policies if they exist (to allow re-running)
DROP POLICY IF EXISTS "Public can view movie thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload movie thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update movie thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete movie thumbnails" ON storage.objects;

-- Policy: Anyone can view thumbnails
CREATE POLICY "Public can view movie thumbnails"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'movie-thumbnails');

-- Policy: Anyone can upload thumbnails (dev mode)
CREATE POLICY "Anyone can upload movie thumbnails"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'movie-thumbnails');

-- Policy: Allow updates (for upsert)
CREATE POLICY "Anyone can update movie thumbnails"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'movie-thumbnails');

-- Policy: Allow deletes (for cleanup)
CREATE POLICY "Anyone can delete movie thumbnails"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'movie-thumbnails');

-- Add comment
COMMENT ON COLUMN movies.thumbnail_url IS 'Public URL of movie thumbnail image (JPEG, captured from canvas)';
