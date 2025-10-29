-- Social Puzzle Platform Schema
-- Phase 1: Create Mode database structure

-- Drop existing tables if they exist (clean slate for dev)
DROP TABLE IF EXISTS solutions CASCADE;
DROP TABLE IF EXISTS puzzles CASCADE;

-- Puzzles table: stores created puzzles with geometry and metadata
CREATE TABLE puzzles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Metadata
  name TEXT NOT NULL,
  creator_name TEXT NOT NULL,
  description TEXT,
  challenge_message TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  
  -- Geometry data (IJK coordinates for each sphere)
  geometry JSONB NOT NULL,
  -- Example: [{"i":0,"j":0,"k":0}, {"i":1,"j":0,"k":0}, ...]
  
  -- Creation action history for movie generation
  actions JSONB NOT NULL,
  -- Example: [
  --   {"type":"ADD_SPHERE","position":{"i":0,"j":0,"k":0},"timestamp":0},
  --   {"type":"ADD_SPHERE","position":{"i":1,"j":0,"k":0},"timestamp":1234},
  --   {"type":"REMOVE_SPHERE","id":1,"timestamp":2456},
  --   {"type":"UNDO","timestamp":3000}
  -- ]
  
  -- Environment/visual preset configuration
  preset_config JSONB,
  -- Stores effect settings, lighting, materials
  
  -- Stats
  sphere_count INTEGER NOT NULL,
  creation_time_ms INTEGER, -- Total time spent creating
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Solutions table: stores manual and auto-solved solutions
CREATE TABLE solutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  
  -- Metadata
  solver_name TEXT NOT NULL,
  solution_type TEXT NOT NULL DEFAULT 'manual' CHECK (solution_type IN ('manual', 'auto')),
  
  -- Solution data
  final_geometry JSONB NOT NULL,
  -- Final placement of all pieces
  
  -- Action history for movie generation
  actions JSONB NOT NULL,
  -- Example: [
  --   {"type":"PLACE_SPHERE","sphereId":0,"position":{"i":0,"j":0,"k":0},"timestamp":0},
  --   {"type":"MOVE_SPHERE","sphereId":0,"from":{"i":0,"j":0,"k":0},"to":{"i":1,"j":0,"k":0},"timestamp":1500},
  --   ...
  -- ]
  
  -- Stats
  solve_time_ms INTEGER,
  move_count INTEGER,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_puzzles_visibility ON puzzles(visibility);
CREATE INDEX idx_puzzles_created_at ON puzzles(created_at DESC);
CREATE INDEX idx_puzzles_creator ON puzzles(creator_name);
CREATE INDEX idx_solutions_puzzle_id ON solutions(puzzle_id);
CREATE INDEX idx_solutions_created_at ON solutions(created_at DESC);

-- Row Level Security (RLS) policies
ALTER TABLE puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE solutions ENABLE ROW LEVEL SECURITY;

-- Public puzzles are readable by everyone
CREATE POLICY "Public puzzles are viewable by everyone"
  ON puzzles FOR SELECT
  USING (visibility = 'public');

-- Private puzzles are only viewable by creator (for now, no auth, so always show)
-- TODO: Add proper auth-based policies later
CREATE POLICY "All puzzles readable during dev"
  ON puzzles FOR SELECT
  USING (true);

-- Anyone can insert puzzles (no auth yet)
CREATE POLICY "Anyone can create puzzles"
  ON puzzles FOR INSERT
  WITH CHECK (true);

-- Anyone can view solutions
CREATE POLICY "Solutions are viewable by everyone"
  ON solutions FOR SELECT
  USING (true);

-- Anyone can insert solutions
CREATE POLICY "Anyone can create solutions"
  ON solutions FOR INSERT
  WITH CHECK (true);

-- Update trigger to maintain updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_puzzles_updated_at
  BEFORE UPDATE ON puzzles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE puzzles IS 'User-created puzzles with geometry, action history, and metadata';
COMMENT ON TABLE solutions IS 'Solutions to puzzles (manual or auto-solved) with action history';
COMMENT ON COLUMN puzzles.geometry IS 'Array of sphere positions in IJK coordinates';
COMMENT ON COLUMN puzzles.actions IS 'Chronological list of creation actions for movie generation';
COMMENT ON COLUMN solutions.actions IS 'Chronological list of solving actions for movie generation';
