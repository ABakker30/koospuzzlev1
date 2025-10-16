-- Add metadata column to contracts_solutions table
-- This allows storing user-friendly names and other info

-- Add metadata column (safely handles if it already exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contracts_solutions' 
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE contracts_solutions ADD COLUMN metadata jsonb;
  END IF;
END $$;

-- Create index for fast name lookups
CREATE INDEX IF NOT EXISTS contracts_solutions_metadata_idx 
  ON contracts_solutions USING gin(metadata);

-- Verification
SELECT 
  column_name, 
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'contracts_solutions' 
  AND column_name = 'metadata';
