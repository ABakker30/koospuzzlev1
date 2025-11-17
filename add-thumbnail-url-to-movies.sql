-- Add thumbnail_url column to movies table
-- Run this migration if you already have a movies table without thumbnail_url

ALTER TABLE movies 
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

COMMENT ON COLUMN movies.thumbnail_url IS 'URL to thumbnail image stored in Supabase storage (movie-thumbnails bucket)';
