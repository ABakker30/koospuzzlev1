-- Add metadata column to contracts_shapes table
-- This allows storing user-friendly names and other info with content-addressed shapes

-- Add metadata column (safely handles if it already exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contracts_shapes' 
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE contracts_shapes ADD COLUMN metadata jsonb;
  END IF;
END $$;

-- Create index for fast name lookups
CREATE INDEX IF NOT EXISTS contracts_shapes_metadata_idx 
  ON contracts_shapes USING gin(metadata);

-- Verification
SELECT 
  column_name, 
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'contracts_shapes' 
  AND column_name = 'metadata';
