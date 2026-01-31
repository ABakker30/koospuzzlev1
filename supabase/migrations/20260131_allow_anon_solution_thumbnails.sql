-- Allow anonymous users to upload solution thumbnails
-- This enables game mode solutions to have thumbnails even for non-logged-in users

CREATE POLICY "Anonymous can upload solution thumbnails"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'solution-thumbnails' 
  AND (storage.foldername(name))[1] = 'thumbnails'
);
