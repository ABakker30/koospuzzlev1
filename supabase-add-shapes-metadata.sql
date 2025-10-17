-- Add metadata column to contracts_shapes table
-- Run this in your Supabase SQL Editor

-- Add metadata column (JSONB for flexibility)
ALTER TABLE contracts_shapes 
ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Create index on metadata->>'name' for faster lookups
CREATE INDEX IF NOT EXISTS contracts_shapes_metadata_name_idx 
ON contracts_shapes((metadata->>'name'));

-- SUCCESS!
-- Now shapes can store their original file names in metadata.name
