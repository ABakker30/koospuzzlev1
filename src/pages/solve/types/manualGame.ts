// src/pages/solve/types/manualGame.ts

export type PlayerId = string;

export type TurnActionType =
  | 'place_piece'
  | 'remove_piece'
  | 'hint'
  | 'check_solvability';

export interface Player {
  id: PlayerId;          // e.g. "gold", "silver", "player-3"
  name: string;          // e.g. "You", "Computer", "Player 3"
  color: string;         // CSS color / hex, e.g. "#d4af37" for gold
  isComputer: boolean;
}

export interface ScoreEntry {
  playerId: PlayerId;
  score: number;
}

export interface GameEvent {
  id: string;            // unique event id
  turnIndex: number;     // 0-based turn number
  playerId: PlayerId;
  type: TurnActionType;
  timestamp: number;     // Date.now()
  payload?: Record<string, any>; // later: pieceId, cells, hint result, etc.
}

export interface GameSessionState {
  players: Player[];
  currentPlayerIndex: number;     // whose turn it is
  scores: Record<PlayerId, number>;
  events: GameEvent[];
  isComplete: boolean;
  winnerId?: PlayerId;
}
