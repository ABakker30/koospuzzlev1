// src/game/pvp/types.ts
// PvP Multiplayer Types

import type { IJK } from '../../types/shape';

// ============================================================================
// GAME SESSION
// ============================================================================

export type PvPGameStatus = 'waiting' | 'active' | 'completed' | 'abandoned' | 'expired';
export type PvPEndReason = 'completed' | 'timeout' | 'resign' | 'disconnect' | 'stalled';
export type PvPMoveType = 'place' | 'hint' | 'check' | 'resign' | 'timeout';

export interface PvPGameSession {
  id: string;
  puzzle_id: string;
  puzzle_name: string | null;

  // Players
  player1_id: string;
  player2_id: string | null;
  player1_name: string;
  player2_name: string | null;
  player1_avatar_url: string | null;
  player2_avatar_url: string | null;

  // Game state
  status: PvPGameStatus;
  current_turn: 1 | 2;
  first_player: 1 | 2;

  // Scores
  player1_score: number;
  player2_score: number;

  // Timer
  timer_seconds: number;
  player1_time_remaining_ms: number;
  player2_time_remaining_ms: number;
  turn_started_at: string | null;

  // Board state
  board_state: PvPPlacedPiece[];
  inventory_state: Record<string, number>;
  placed_count: Record<string, number>;

  // Simulated
  is_simulated: boolean;
  simulated_opponent_user_id: string | null;

  // End state
  winner: 1 | 2 | null;
  end_reason: PvPEndReason | null;

  // Invite
  invite_code: string | null;
  invite_expires_at: string | null;

  // Heartbeat
  player1_last_heartbeat: string | null;
  player2_last_heartbeat: string | null;

  // Timestamps
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string;
}

// ============================================================================
// PLACED PIECE (stored in board_state JSONB)
// ============================================================================

export interface PvPPlacedPiece {
  uid: string;
  pieceId: string;
  orientationId: string;
  cells: IJK[];
  placedAt: number;
  placedBy: 1 | 2; // Player number
  source: 'manual' | 'hint';
}

// ============================================================================
// GAME MOVE
// ============================================================================

export interface PvPGameMove {
  id: string;
  session_id: string;
  player_number: 1 | 2;
  player_id: string;
  move_number: number;

  move_type: PvPMoveType;
  piece_id: string | null;
  orientation_id: string | null;
  cells: IJK[] | null;

  score_delta: number;
  board_state_after: PvPPlacedPiece[];

  time_spent_ms: number | null;
  player_time_remaining_ms: number | null;

  created_at: string;
}

// ============================================================================
// PLAYER STATS
// ============================================================================

export interface PlayerStats {
  user_id: string;
  games_played: number;
  games_won: number;
  games_lost: number;
  games_drawn: number;
  games_abandoned: number;
  total_score: number;
  highest_score: number;
  avg_time_per_move_ms: number | null;
  updated_at: string;
}

// ============================================================================
// RANDOM OPPONENT
// ============================================================================

export interface RandomOpponent {
  id: string;
  username: string;
  avatar_url: string | null;
}

// ============================================================================
// CREATE SESSION INPUT
// ============================================================================

export interface CreatePvPSessionInput {
  puzzleId: string;
  puzzleName: string;
  timerSeconds: number;
  inventoryState: Record<string, number>;
  isSimulated: boolean;
}

// ============================================================================
// SUBMIT MOVE INPUT
// ============================================================================

export interface SubmitMoveInput {
  sessionId: string;
  playerNumber: 1 | 2;
  moveType: PvPMoveType;
  pieceId?: string;
  orientationId?: string;
  cells?: IJK[];
  scoreDelta: number;
  boardStateAfter: PvPPlacedPiece[];
  timeSpentMs: number;
  playerTimeRemainingMs: number;
}
