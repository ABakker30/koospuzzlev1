-- Backfill missing solve_time_ms and move_count from existing columns
-- Run this to fix the 0 values in puzzle stats

-- Update solutions where solve_time_ms is NULL but duration_ms exists
UPDATE solutions
SET solve_time_ms = duration_ms
WHERE solve_time_ms IS NULL 
  AND duration_ms IS NOT NULL;

-- Update solutions where move_count is NULL but total_moves exists
UPDATE solutions
SET move_count = total_moves
WHERE move_count IS NULL 
  AND total_moves IS NOT NULL;

-- Set solution_type for manual solutions that don't have it
UPDATE solutions
SET solution_type = 'manual'
WHERE solution_type IS NULL
  AND created_by IS NOT NULL;

-- Set solution_type for auto solutions
UPDATE solutions
SET solution_type = 'auto'
WHERE solution_type IS NULL
  AND (solver_name LIKE '%Engine%' OR solver_name LIKE '%Auto%');

-- Refresh the puzzle_stats aggregates
-- First, reset to 0
UPDATE puzzle_stats
SET 
  manual_solutions_count = 0,
  manual_solve_time_ms_total = 0,
  manual_move_count_total = 0,
  solutions_total = 0;

-- Recalculate from solutions
UPDATE puzzle_stats ps
SET
  manual_solutions_count = x.manual_solutions_count,
  manual_solve_time_ms_total = x.manual_solve_time_ms_total,
  manual_move_count_total = x.manual_move_count_total,
  solutions_total = x.solutions_total,
  updated_at = now()
FROM (
  SELECT
    puzzle_id,
    sum(case when solution_type='manual' then 1 else 0 end)::bigint as manual_solutions_count,
    sum(case when solution_type='manual' then coalesce(solve_time_ms,0) else 0 end)::bigint as manual_solve_time_ms_total,
    sum(case when solution_type='manual' then coalesce(move_count,0) else 0 end)::bigint as manual_move_count_total,
    count(*)::bigint as solutions_total
  FROM solutions
  GROUP BY puzzle_id
) x
WHERE ps.puzzle_id = x.puzzle_id;

-- Report what was updated
SELECT 
  COUNT(*) as solutions_updated,
  COUNT(CASE WHEN solve_time_ms IS NOT NULL AND solve_time_ms > 0 THEN 1 END) as with_time,
  COUNT(CASE WHEN move_count IS NOT NULL AND move_count > 0 THEN 1 END) as with_moves
FROM solutions;
