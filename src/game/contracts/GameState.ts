// src/game/contracts/GameState.ts
// Unified Game State Contract - Phase 1
// This defines the single source of truth for all game modes

import type { IJK } from '../../services/FitFinder';
import type { PuzzleSpec, CellKey } from '../puzzle/PuzzleTypes';
import { cellToKey } from '../puzzle/PuzzleTypes';

// ============================================================================
// IDENTIFIERS
// ============================================================================

export type GameId = string;
export type PlayerId = string;

// ============================================================================
// ENUMS & UNION TYPES
// ============================================================================

export type PlayerType = 'human' | 'ai' | 'remote';

export type TimerMode = 'none' | 'timed';

export type GamePhase = 'setup' | 'in_turn' | 'resolving' | 'ended';

export type TurnActionType = 'place' | 'hint' | 'check' | 'pass';

// ============================================================================
// NARRATION (Phase 2D)
// ============================================================================

/** Narration message level for styling */
export type NarrationLevel = 'info' | 'warn' | 'action' | 'system';

/** Single narration entry */
export interface NarrationEntry {
  id: string;
  at: string; // ISO timestamp
  level: NarrationLevel;
  text: string;
  meta?: {
    playerId?: PlayerId;
    pieceInstanceId?: string;
    scoreDelta?: number;
    reason?: string;
  };
}

// ============================================================================
// SUBPHASE & REPAIR (Phase 2A)
// ============================================================================

/** Subphase within a turn - normal play or repair in progress */
export type GameSubphase = 'normal' | 'repairing';

/** Why repair was triggered */
export type RepairReason = 'check' | 'hint' | 'endgame';

// ============================================================================
// END GAME (Phase 2C)
// ============================================================================

/** Why the game ended */
export type EndReason = 'completed' | 'stalled' | 'timeout';

/** Final game state when ended */
export interface GameEndState {
  endedAt: string; // ISO timestamp
  reason: EndReason;
  /** Player IDs of winner(s) - supports ties */
  winnerPlayerIds: PlayerId[];
  /** Final scores sorted by score descending */
  finalScores: { playerId: PlayerId; playerName: string; score: number }[];
  /** Turn number when game ended */
  turnNumberAtEnd: number;
}

/**
 * Compute winner(s) from player list
 * Highest score wins; ties are supported (multiple winners)
 */
export function computeWinners(players: PlayerState[]): PlayerId[] {
  if (players.length === 0) return [];
  
  const maxScore = Math.max(...players.map(p => p.score));
  return players
    .filter(p => p.score === maxScore)
    .map(p => p.id);
}

/** Individual step in repair procedure */
export type RepairStep =
  | { type: 'REMOVE_PIECE'; pieceUid: string; pieceId: string; placedByPlayerId: PlayerId; scoreDelta: -1 }
  | { type: 'MESSAGE'; text: string }
  | { type: 'DONE'; solvable: true };

/** Repair state tracking */
export interface RepairState {
  reason: RepairReason;
  steps: RepairStep[];
  index: number;
  /** The player or system that triggered the repair */
  triggeredBy: PlayerId | 'system';
}

// ============================================================================
// RULE TOGGLES
// ============================================================================

export interface RuleToggles {
  /** If true, a wasted check (puzzle already solvable) transfers to opponent instead of being consumed */
  checkTransferOnWaste: boolean;
}

// ============================================================================
// PLAYER STATE
// ============================================================================

export interface PlayerState {
  id: PlayerId;
  name: string;
  type: PlayerType;
  score: number;
  hintsRemaining: number;
  checksRemaining: number;
  /** null when TimerMode is 'none' */
  clockSecondsRemaining: number | null;
  /** Player color for UI (hex or CSS color) */
  color: string;
  /** Optional avatar URL */
  avatarUrl?: string;
}

// ============================================================================
// GAME SETTINGS
// ============================================================================

export interface GameSettings {
  maxPlayers: number; // cap at 5
  timerMode: TimerMode;
  startingPlayerIndex: number;
  ruleToggles: RuleToggles;
  /** Timer duration per player in seconds (only used when timerMode = 'timed') */
  timerSecondsPerPlayer: number;
}

// ============================================================================
// PLACED PIECE (board state representation)
// ============================================================================

export interface GamePlacedPiece {
  uid: string;
  pieceId: string;
  orientationId: string;
  cells: IJK[];
  placedAt: number;
  placedBy: PlayerId;
  source: 'user' | 'hint' | 'ai';
}

// ============================================================================
// INVENTORY STATE
// ============================================================================

/** pieceId -> count available (99 = unlimited) */
export type InventoryState = Record<string, number>;

// ============================================================================
// LAST ACTION RECORD
// ============================================================================

export interface LastAction {
  type: TurnActionType;
  by: PlayerId;
  at: string; // ISO timestamp
  payload?: Record<string, unknown>;
}

// ============================================================================
// GAME STATE (SINGLE SOURCE OF TRUTH)
// ============================================================================

export interface GameState {
  id: GameId;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  
  phase: GamePhase;
  /** Subphase for repair tracking (Phase 2A) */
  subphase: GameSubphase;
  settings: GameSettings;
  players: PlayerState[];
  
  activePlayerIndex: number;
  turnNumber: number;
  
  lastAction?: LastAction;
  /** Short narration message for UI (e.g., "Puzzle not solvable, removing pieces...") */
  uiMessage?: string;
  
  /** Repair state when subphase === 'repairing' (Phase 2A) */
  repair?: RepairState;
  
  /** Pending hint context during resolve/repair (Phase 2B) */
  pendingHint?: {
    playerId: PlayerId;
    anchor: IJK;
  };
  
  /** End game state when phase === 'ended' (Phase 2C) */
  endState?: GameEndState;
  
  // ---- Stall tracking (Phase 2C-2) ----
  /** True if a piece was successfully placed this turn (manual or hint) */
  turnPlacementFlag: boolean;
  /** Count of consecutive turns with no placement (across all players) */
  roundNoPlacementCount: number;
  
  // ---- Narration (Phase 2D) ----
  /** Narration log entries */
  narration: NarrationEntry[];
  /** Max narration entries to keep */
  narrationMax: number;
  
  /** Reference to current puzzle (legacy, use puzzleSpec) */
  puzzleRef: {
    id: string;
    name: string;
  };
  
  /** Puzzle specification with target cells for completion check (Phase 3A-2) */
  puzzleSpec: PuzzleSpec;
  
  /** Board state: Map of uid -> placed piece */
  boardState: Map<string, GamePlacedPiece>;
  
  /** Inventory: pieceId -> available count */
  inventoryState: InventoryState;
  
  /** Placed count by piece ID (for inventory tracking) */
  placedCountByPieceId: Record<string, number>;
  
  /** Future event log cursor (stub for Phase 3) */
  eventCursor?: number;
}

// ============================================================================
// GAME SETUP INPUT (from Setup Modal)
// ============================================================================

export interface PlayerSetupInput {
  name: string;
  type: PlayerType;
  hints: number;
  checks: number;
  timerSeconds: number; // only used if timerMode = 'timed'
  color: string;
}

export interface GameSetupInput {
  playerCount: number; // 1..5
  players: PlayerSetupInput[];
  startingPlayer: 'random' | number; // 'random' or explicit index
  timerMode: TimerMode;
  ruleToggles: RuleToggles;
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create initial game state from setup input
 */
export function createInitialGameState(
  setup: GameSetupInput,
  puzzleSpec: PuzzleSpec,
  initialInventory: InventoryState
): GameState {
  const now = new Date().toISOString();
  const gameId = `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Determine starting player
  const startingPlayerIndex = setup.startingPlayer === 'random'
    ? Math.floor(Math.random() * setup.players.length)
    : setup.startingPlayer;
  
  // Build player states from setup
  const players: PlayerState[] = setup.players.map((p, idx) => ({
    id: `player-${idx}`,
    name: p.name,
    type: p.type,
    score: 0,
    hintsRemaining: p.hints,
    checksRemaining: p.checks,
    clockSecondsRemaining: setup.timerMode === 'timed' ? p.timerSeconds : null,
    color: p.color,
  }));
  
  return {
    id: gameId,
    createdAt: now,
    updatedAt: now,
    phase: 'in_turn',
    subphase: 'normal',
    settings: {
      maxPlayers: 5,
      timerMode: setup.timerMode,
      startingPlayerIndex,
      ruleToggles: setup.ruleToggles,
      timerSecondsPerPlayer: setup.players[0]?.timerSeconds ?? 300,
    },
    players,
    activePlayerIndex: startingPlayerIndex,
    turnNumber: 1,
    puzzleRef: { id: puzzleSpec.id, name: puzzleSpec.title },
    puzzleSpec,
    boardState: new Map(),
    inventoryState: { ...initialInventory },
    placedCountByPieceId: {},
    eventCursor: 0,
    // Stall tracking (Phase 2C-2)
    turnPlacementFlag: false,
    roundNoPlacementCount: 0,
    // Narration (Phase 2D)
    narration: [],
    narrationMax: 30,
  };
}

// ============================================================================
// NARRATION HELPER
// ============================================================================

let narrationIdCounter = 0;

/**
 * Push a narration entry to state, trimming to max
 */
export function pushNarration(
  state: GameState,
  entry: Omit<NarrationEntry, 'id' | 'at'>
): GameState {
  const newEntry: NarrationEntry = {
    ...entry,
    id: `n-${++narrationIdCounter}`,
    at: new Date().toISOString(),
  };
  
  const narration = [newEntry, ...state.narration].slice(0, state.narrationMax);
  
  return {
    ...state,
    narration,
  };
}

// ============================================================================
// DEFAULT PRESETS
// ============================================================================

const DEFAULT_PLAYER_COLORS = [
  '#d4af37', // Gold
  '#c0c0c0', // Silver
  '#cd7f32', // Bronze
  '#4a90d9', // Blue
  '#9b59b6', // Purple
];

export function getDefaultPlayerColor(index: number): string {
  return DEFAULT_PLAYER_COLORS[index % DEFAULT_PLAYER_COLORS.length];
}

export function createSoloPreset(): GameSetupInput {
  return {
    playerCount: 1,
    players: [{
      name: 'You',
      type: 'human',
      hints: 3,
      checks: 3,
      timerSeconds: 0,
      color: getDefaultPlayerColor(0),
    }],
    startingPlayer: 0,
    timerMode: 'none',
    ruleToggles: {
      checkTransferOnWaste: false,
    },
  };
}

export function createVsComputerPreset(): GameSetupInput {
  return {
    playerCount: 2,
    players: [
      {
        name: 'You',
        type: 'human',
        hints: 3,
        checks: 3,
        timerSeconds: 300,
        color: getDefaultPlayerColor(0),
      },
      {
        name: 'Computer',
        type: 'ai',
        hints: 3,
        checks: 3,
        timerSeconds: 300,
        color: getDefaultPlayerColor(1),
      },
    ],
    startingPlayer: 0,
    timerMode: 'none',
    ruleToggles: {
      checkTransferOnWaste: true,
    },
  };
}

export function createMultiplayerPreset(playerCount: number): GameSetupInput {
  const players: PlayerSetupInput[] = [];
  
  for (let i = 0; i < playerCount; i++) {
    players.push({
      name: i === 0 ? 'You' : `Player ${i + 1}`,
      type: i === 0 ? 'human' : 'ai',
      hints: 3,
      checks: 3,
      timerSeconds: 300,
      color: getDefaultPlayerColor(i),
    });
  }
  
  return {
    playerCount,
    players,
    startingPlayer: 'random',
    timerMode: 'none',
    ruleToggles: {
      checkTransferOnWaste: true,
    },
  };
}
