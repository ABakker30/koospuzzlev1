-- Task 7: Optional - Extend solutions with minimal auto metadata
-- This makes solutions self-describing without requiring joins to solver_runs

ALTER TABLE solutions
  ADD COLUMN IF NOT EXISTS auto_mode TEXT,
  ADD COLUMN IF NOT EXISTS auto_seed INTEGER,
  ADD COLUMN IF NOT EXISTS auto_nodes INTEGER,
  ADD COLUMN IF NOT EXISTS auto_time_to_solution_ms INTEGER;

COMMENT ON COLUMN solutions.auto_mode IS 'Solver mode for auto solutions: exhaustive, balanced, fast (null for manual)';
COMMENT ON COLUMN solutions.auto_seed IS 'RNG seed used for auto solutions (null for manual)';
COMMENT ON COLUMN solutions.auto_nodes IS 'Nodes explored to find auto solution (null for manual)';
COMMENT ON COLUMN solutions.auto_time_to_solution_ms IS 'Time to find auto solution in milliseconds (null for manual)';

-- Note: These fields should only be populated when solution_type = 'auto'
-- Existing manual solutions remain unaffected (columns are nullable)
