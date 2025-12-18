-- Create storage bucket for solution thumbnails
-- This bucket stores thumbnail images captured when users complete puzzles

-- Create the bucket (public so thumbnails can be accessed in gallery)
INSERT INTO storage.buckets (id, name, public)
VALUES ('solution-thumbnails', 'solution-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own solution thumbnails
CREATE POLICY "Users can upload solution thumbnails"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'solution-thumbnails' 
  AND (storage.foldername(name))[1] = 'thumbnails'
);

-- Allow public read access to all thumbnails (for gallery display)
CREATE POLICY "Public read access to solution thumbnails"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'solution-thumbnails');

-- Allow users to delete their own thumbnails
CREATE POLICY "Users can delete their own thumbnails"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'solution-thumbnails'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
