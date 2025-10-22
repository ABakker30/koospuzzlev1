-- Add metadata fields to contracts_solutions table
-- Run this in your Supabase SQL Editor

-- Add new columns for user-editable metadata
ALTER TABLE contracts_solutions 
ADD COLUMN IF NOT EXISTS user_name text,
ADD COLUMN IF NOT EXISTS file_name text,
ADD COLUMN IF NOT EXISTS description text;

-- Update existing records to have a default file_name
UPDATE contracts_solutions
SET file_name = COALESCE(file_name, 'Solution_' || (SELECT COUNT(*) FROM jsonb_array_elements(placements)) || 'pieces')
WHERE file_name IS NULL;

-- Add index for faster searches by file_name
CREATE INDEX IF NOT EXISTS contracts_solutions_file_name_idx ON contracts_solutions(file_name);

-- SUCCESS!
-- contracts_solutions now has user-editable metadata fields:
--   - user_name: Creator/owner name
--   - file_name: User-friendly file name
--   - description: About the solution
