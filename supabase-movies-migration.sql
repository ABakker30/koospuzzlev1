-- Movies Table Migration
-- Stores movie metadata for shared puzzle solution animations
-- NOTE: Does NOT store video files - only configuration to replay effects

-- Drop existing table if it exists (dev mode)
DROP TABLE IF EXISTS movies CASCADE;

-- Movies table: stores movie metadata and effect configurations
CREATE TABLE movies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  solution_id UUID NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
  -- solution_id is required - movies must reference a saved solution
  
  -- Movie metadata
  title TEXT NOT NULL,
  description TEXT,
  challenge_text TEXT NOT NULL DEFAULT 'Can you solve this puzzle? Try to beat my solution!',
  creator_name TEXT NOT NULL DEFAULT 'Anonymous',
  thumbnail_url TEXT, -- URL to thumbnail image in Supabase storage
  
  -- Effect configuration (to replay the movie)
  effect_type TEXT NOT NULL CHECK (effect_type IN ('turntable', 'gravity', 'reveal')),
  effect_config JSONB NOT NULL,
  -- Stores effect settings like:
  -- Turntable: {durationSec, rotations, easingFunc}
  -- Gravity: {gravityPreset, durationSec, resetOnComplete}
  -- Reveal: {revealPattern, durationSec, delayBetween}
  
  -- Credits configuration
  credits_config JSONB,
  -- {showPuzzleName: bool, showEffectType: bool, ...}
  
  -- Stats (recorded video metadata - NOT the video file itself)
  duration_sec FLOAT,
  file_size_bytes INTEGER,
  
  -- Solve stats (optional - from solution if available)
  solve_time_ms INTEGER,
  move_count INTEGER,
  pieces_placed INTEGER,
  puzzle_mode TEXT, -- 'One of Each', 'Unlimited', 'Single Piece'
  
  -- Social features
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_movies_puzzle_id ON movies(puzzle_id);
CREATE INDEX idx_movies_solution_id ON movies(solution_id);
CREATE INDEX idx_movies_effect_type ON movies(effect_type);
CREATE INDEX idx_movies_created_at ON movies(created_at DESC);
CREATE INDEX idx_movies_view_count ON movies(view_count DESC);
CREATE INDEX idx_movies_like_count ON movies(like_count DESC);
CREATE INDEX idx_movies_public ON movies(is_public) WHERE is_public = true;

-- Row Level Security (RLS)
ALTER TABLE movies ENABLE ROW LEVEL SECURITY;

-- Public movies are viewable by everyone
CREATE POLICY "Public movies are viewable by everyone"
  ON movies FOR SELECT
  USING (is_public = true);

-- All movies are viewable during dev (no auth yet)
CREATE POLICY "All movies readable during dev"
  ON movies FOR SELECT
  USING (true);

-- Anyone can create movies (no auth yet)
CREATE POLICY "Anyone can create movies"
  ON movies FOR INSERT
  WITH CHECK (true);

-- Anyone can update view/like counts (no auth yet)
CREATE POLICY "Anyone can update movie stats"
  ON movies FOR UPDATE
  USING (true);

-- Create or replace function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update trigger to maintain updated_at timestamp
CREATE TRIGGER update_movies_updated_at
  BEFORE UPDATE ON movies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE movies IS 'Movie metadata and effect configurations for shared puzzle solutions';
COMMENT ON COLUMN movies.effect_type IS 'Type of effect used: turntable, gravity, or reveal';
COMMENT ON COLUMN movies.effect_config IS 'JSONB configuration for replaying the effect';
COMMENT ON COLUMN movies.challenge_text IS 'Challenge message shown at end of movie playback';
COMMENT ON COLUMN movies.file_size_bytes IS 'Size of recorded video file (not stored in DB)';
COMMENT ON COLUMN movies.duration_sec IS 'Duration of the effect animation in seconds';

-- RPC function to increment view count
CREATE OR REPLACE FUNCTION increment_movie_views(movie_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE movies
  SET view_count = view_count + 1
  WHERE id = movie_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function to toggle like on a movie
CREATE OR REPLACE FUNCTION toggle_movie_like(movie_id UUID)
RETURNS integer AS $$
DECLARE
  current_likes integer;
BEGIN
  -- For now just increment (will add user tracking later with auth)
  UPDATE movies
  SET like_count = like_count + 1
  WHERE id = movie_id
  RETURNING like_count INTO current_likes;
  
  RETURN current_likes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sample data for testing
-- INSERT INTO movies (puzzle_id, solution_id, title, challenge_text, creator_name, effect_type, effect_config, duration_sec)
-- VALUES (
--   'some-puzzle-uuid',
--   'some-solution-uuid',
--   'Amazing Turntable',
--   'Can you solve this in under 5 minutes?',
--   'Puzzle Master',
--   'turntable',
--   '{"durationSec": 20, "rotations": 2, "easingFunc": "easeInOutCubic"}',
--   20.0
-- );
