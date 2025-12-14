-- Anonymous Auto-Solve Telemetry Migration
-- Tasks 1-3: Create solver_runs table with RLS policies

-- Task 1: Create solver_runs table (core telemetry)
CREATE TABLE solver_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  solution_id UUID REFERENCES solutions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Anonymous identity
  anon_session_id TEXT,

  -- Client / engine
  app_version TEXT,
  engine_name TEXT NOT NULL DEFAULT 'engine2',
  engine_version TEXT,

  -- Mode + settings snapshot
  mode TEXT NOT NULL CHECK (mode IN ('exhaustive','balanced','fast','progressive')),
  seed INTEGER,
  timeout_ms INTEGER,
  tail_enable BOOLEAN,
  tail_size INTEGER,
  shuffle_strategy TEXT,
  restart_interval_nodes INTEGER,
  restart_interval_seconds INTEGER,
  randomize_ties BOOLEAN,
  tt_enable BOOLEAN,
  tt_bytes INTEGER,

  -- Outcome
  success BOOLEAN NOT NULL,
  stop_reason TEXT NOT NULL CHECK (stop_reason IN ('complete','timeout','limit','canceled','error')),
  solutions_found INTEGER NOT NULL DEFAULT 0,

  -- Metrics
  elapsed_ms INTEGER,
  time_to_solution_ms INTEGER,
  nodes_total INTEGER,
  nodes_to_solution INTEGER,
  best_placed INTEGER,
  total_pieces_target INTEGER,

  -- Behavioral signals (optional)
  tail_triggered BOOLEAN,
  restart_count INTEGER,

  -- Debug
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task 1: Add indexes
CREATE INDEX idx_solver_runs_puzzle_created ON solver_runs(puzzle_id, created_at DESC);
CREATE INDEX idx_solver_runs_user_created ON solver_runs(user_id, created_at DESC);
CREATE INDEX idx_solver_runs_anon_created ON solver_runs(anon_session_id, created_at DESC);
CREATE INDEX idx_solver_runs_mode ON solver_runs(mode);
CREATE INDEX idx_solver_runs_success ON solver_runs(success);

-- Task 2 & 3: Enable RLS
ALTER TABLE solver_runs ENABLE ROW LEVEL SECURITY;

-- Task 2: Allow authenticated inserts
CREATE POLICY "solver_runs_insert_authenticated"
ON solver_runs
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
);

-- Task 3: Add format constraint for anonymous session IDs
ALTER TABLE solver_runs
  ADD CONSTRAINT anon_session_uuid_format
  CHECK (
    anon_session_id IS NULL
    OR anon_session_id ~* '^[0-9a-f-]{36}$'
  );

-- Task 3: Allow anonymous inserts using anon_session_id
CREATE POLICY "solver_runs_insert_anonymous"
ON solver_runs
FOR INSERT
WITH CHECK (
  auth.uid() IS NULL
  AND user_id IS NULL
  AND anon_session_id IS NOT NULL
  AND length(anon_session_id) >= 20
);

-- Comments for documentation
COMMENT ON TABLE solver_runs IS 'Anonymous and authenticated auto-solve telemetry (one row per attempt)';
COMMENT ON COLUMN solver_runs.anon_session_id IS 'Stable anonymous session UUID (for non-authenticated users)';
COMMENT ON COLUMN solver_runs.mode IS 'Solver mode: exhaustive, balanced, fast, progressive';
COMMENT ON COLUMN solver_runs.stop_reason IS 'Why solver stopped: complete, timeout, limit, canceled, error';
COMMENT ON COLUMN solver_runs.nodes_total IS 'Total nodes explored during run';
COMMENT ON COLUMN solver_runs.nodes_to_solution IS 'Nodes explored when solution found (null if no solution)';
