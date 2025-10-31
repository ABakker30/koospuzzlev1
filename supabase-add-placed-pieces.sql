-- Add placed_pieces column to solutions table
-- This column stores the full piece placement data needed for movie playback

ALTER TABLE solutions
ADD COLUMN IF NOT EXISTS placed_pieces JSONB;

COMMENT ON COLUMN solutions.placed_pieces IS 'Full piece placement data for reconstruction: [{uid, pieceId, orientationId, anchorSphereIndex, cells, placedAt}, ...]';

-- Add notes column if it doesn't exist
ALTER TABLE solutions
ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN solutions.notes IS 'Optional notes about the solution';
