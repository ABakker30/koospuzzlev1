-- Migration: Create PvP game tables for real-time multiplayer
-- Tables: game_sessions, game_moves, player_stats

-- ============================================================================
-- GAME SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id TEXT NOT NULL,
  puzzle_name TEXT,
  
  -- Players
  player1_id UUID NOT NULL REFERENCES public.users(id),
  player2_id UUID REFERENCES public.users(id), -- NULL until opponent joins
  player1_name TEXT NOT NULL,
  player2_name TEXT,
  player1_avatar_url TEXT,
  player2_avatar_url TEXT,
  
  -- Game state
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'abandoned', 'expired')),
  current_turn INTEGER NOT NULL DEFAULT 1, -- 1 or 2 (which player's turn)
  first_player INTEGER NOT NULL DEFAULT 1, -- 1 or 2 (coin flip result)
  
  -- Scores
  player1_score INTEGER NOT NULL DEFAULT 0,
  player2_score INTEGER NOT NULL DEFAULT 0,
  
  -- Timer config (chess-clock style)
  timer_seconds INTEGER NOT NULL DEFAULT 300, -- Total seconds per player
  player1_time_remaining_ms INTEGER NOT NULL DEFAULT 300000, -- Milliseconds remaining
  player2_time_remaining_ms INTEGER NOT NULL DEFAULT 300000,
  turn_started_at TIMESTAMP WITH TIME ZONE, -- When current turn started (for clock calculation)
  
  -- Board state (full JSON snapshot)
  board_state JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of placed pieces
  inventory_state JSONB NOT NULL DEFAULT '{}'::jsonb, -- pieceId -> count remaining
  placed_count JSONB NOT NULL DEFAULT '{}'::jsonb, -- pieceId -> placed count
  
  -- Simulated game flag
  is_simulated BOOLEAN NOT NULL DEFAULT false, -- True if opponent is AI-simulated
  simulated_opponent_user_id UUID, -- The real user whose identity is used for simulation
  
  -- End state
  winner INTEGER, -- 1, 2, or NULL (draw/in-progress)
  end_reason TEXT CHECK (end_reason IN ('completed', 'timeout', 'resign', 'disconnect', 'stalled')),
  
  -- Invite link
  invite_code TEXT UNIQUE, -- Short code for invite links
  invite_expires_at TIMESTAMP WITH TIME ZONE, -- Invite expiry (10 min)
  
  -- Heartbeat / disconnect detection
  player1_last_heartbeat TIMESTAMP WITH TIME ZONE,
  player2_last_heartbeat TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE, -- When game actually started (both players joined)
  ended_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON public.game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_player1 ON public.game_sessions(player1_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_player2 ON public.game_sessions(player2_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_invite_code ON public.game_sessions(invite_code);
CREATE INDEX IF NOT EXISTS idx_game_sessions_created_at ON public.game_sessions(created_at DESC);

-- ============================================================================
-- GAME MOVES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.game_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  player_number INTEGER NOT NULL CHECK (player_number IN (1, 2)),
  player_id UUID NOT NULL,
  move_number INTEGER NOT NULL,
  
  -- Move details
  move_type TEXT NOT NULL CHECK (move_type IN ('place', 'hint', 'resign', 'timeout')),
  piece_id TEXT, -- Which piece was placed
  orientation_id TEXT,
  cells JSONB, -- Array of IJK cells
  
  -- Score change
  score_delta INTEGER NOT NULL DEFAULT 0,
  
  -- Board state after this move (full snapshot for sync)
  board_state_after JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Time tracking
  time_spent_ms INTEGER, -- How long this move took
  player_time_remaining_ms INTEGER, -- Clock remaining after move
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_game_moves_session ON public.game_moves(session_id);
CREATE INDEX IF NOT EXISTS idx_game_moves_session_move ON public.game_moves(session_id, move_number);

-- ============================================================================
-- PLAYER STATS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.player_stats (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  games_lost INTEGER NOT NULL DEFAULT 0,
  games_drawn INTEGER NOT NULL DEFAULT 0,
  games_abandoned INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  highest_score INTEGER NOT NULL DEFAULT 0,
  avg_time_per_move_ms INTEGER,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;

-- Game sessions: players can see their own games, anyone can see waiting games (for joining)
CREATE POLICY "Users can view own games"
  ON public.game_sessions FOR SELECT
  USING (auth.uid() = player1_id OR auth.uid() = player2_id OR status = 'waiting');

CREATE POLICY "Authenticated users can create games"
  ON public.game_sessions FOR INSERT
  WITH CHECK (auth.uid() = player1_id);

CREATE POLICY "Players can update own games"
  ON public.game_sessions FOR UPDATE
  USING (auth.uid() = player1_id OR auth.uid() = player2_id);

-- Game moves: players can see moves in their games
CREATE POLICY "Players can view game moves"
  ON public.game_moves FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.game_sessions gs
      WHERE gs.id = session_id
      AND (gs.player1_id = auth.uid() OR gs.player2_id = auth.uid())
    )
  );

CREATE POLICY "Players can insert moves"
  ON public.game_moves FOR INSERT
  WITH CHECK (auth.uid() = player_id);

-- Player stats: users can see all stats, update own
CREATE POLICY "Anyone can view player stats"
  ON public.player_stats FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own stats"
  ON public.player_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stats"
  ON public.player_stats FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- REALTIME: Enable for game_sessions and game_moves
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_moves;

-- ============================================================================
-- FUNCTION: Get random opponent (for simulated matches)
-- Returns a random registered user (not the requesting user)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_random_opponent(requesting_user_id UUID)
RETURNS TABLE(
  id UUID,
  username TEXT,
  avatar_url TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT u.id, u.username, u.avatar_url
  FROM public.users u
  WHERE u.id != requesting_user_id
  ORDER BY random()
  LIMIT 1;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.game_sessions TO authenticated;
GRANT SELECT, INSERT ON public.game_moves TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.player_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_random_opponent TO authenticated;

-- Allow anon to view waiting games (for invite links)
GRANT SELECT ON public.game_sessions TO anon;

COMMENT ON TABLE public.game_sessions IS 'PvP game sessions for real-time multiplayer';
COMMENT ON TABLE public.game_moves IS 'Individual moves within PvP game sessions';
COMMENT ON TABLE public.player_stats IS 'Aggregated player statistics for PvP games';
