-- Step 1: Add thumbnail_url column to puzzles table
ALTER TABLE puzzles 
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

COMMENT ON COLUMN puzzles.thumbnail_url IS 'Public URL to puzzle thumbnail image in Supabase Storage';

-- Step 2: Create RLS policies for puzzle-thumbnails bucket
-- (Run these AFTER creating the bucket in the Supabase Dashboard UI)

-- Allow public read access to thumbnails
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'puzzle-thumbnails' );

-- Allow authenticated users to upload thumbnails
CREATE POLICY "Authenticated users can upload thumbnails"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'puzzle-thumbnails' );

-- Allow authenticated users to update/replace thumbnails
CREATE POLICY "Authenticated users can update thumbnails"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'puzzle-thumbnails' )
WITH CHECK ( bucket_id = 'puzzle-thumbnails' );
