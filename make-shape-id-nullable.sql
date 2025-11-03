-- Make shape_id nullable in puzzles table
-- User-created puzzles don't need shape_id since they use puzzles.geometry directly

ALTER TABLE puzzles ALTER COLUMN shape_id DROP NOT NULL;

-- Verify the change
SELECT 
  column_name, 
  is_nullable, 
  data_type 
FROM information_schema.columns 
WHERE table_name = 'puzzles' 
AND column_name = 'shape_id';
