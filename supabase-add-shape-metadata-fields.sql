-- Add metadata fields to contracts_shapes table
-- Run this in your Supabase SQL Editor

-- Add new columns for user-editable metadata
ALTER TABLE contracts_shapes 
ADD COLUMN IF NOT EXISTS user_name text,
ADD COLUMN IF NOT EXISTS file_name text,
ADD COLUMN IF NOT EXISTS description text;

-- Update existing records to have a default file_name based on size
UPDATE contracts_shapes
SET file_name = COALESCE(file_name, 'Shape_' || size || 'cells')
WHERE file_name IS NULL;

-- Add index for faster searches by file_name
CREATE INDEX IF NOT EXISTS contracts_shapes_file_name_idx ON contracts_shapes(file_name);

-- SUCCESS!
-- contracts_shapes now has user-editable metadata fields:
--   - user_name: Creator/owner name
--   - file_name: User-friendly file name
--   - description: About the shape
