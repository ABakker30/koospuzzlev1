// src/game/persistence/GameRepo.ts
// Persistence stubs for Phase 1
// Phase 3 will wire these to Supabase

import type { GameState, GameId } from '../contracts/GameState';

/**
 * Save game state to database (stub - no-op for Phase 1)
 */
export async function saveGame(state: GameState): Promise<void> {
  console.log('📦 [STUB] saveGame called:', state.id);
  // Phase 3: Will save to Supabase `games` table
  return Promise.resolve();
}

/**
 * Load game state from database (stub - returns null for Phase 1)
 */
export async function loadGame(id: GameId): Promise<GameState | null> {
  console.log('📦 [STUB] loadGame called:', id);
  // Phase 3: Will query Supabase `games` table
  return Promise.resolve(null);
}

/**
 * Delete game from database (stub - no-op for Phase 1)
 */
export async function deleteGame(id: GameId): Promise<void> {
  console.log('📦 [STUB] deleteGame called:', id);
  // Phase 3: Will delete from Supabase `games` table
  return Promise.resolve();
}

/**
 * List games for a user (stub - returns empty array for Phase 1)
 */
export async function listUserGames(userId: string): Promise<GameState[]> {
  console.log('📦 [STUB] listUserGames called:', userId);
  // Phase 3: Will query Supabase `games` table by user
  return Promise.resolve([]);
}

/**
 * Append game event to event log (stub - no-op for Phase 1)
 * Phase 3: Events will be stored in `game_events` table for replay
 */
export async function appendGameEvent(
  gameId: GameId,
  event: { type: string; payload?: Record<string, unknown> }
): Promise<void> {
  console.log('📦 [STUB] appendGameEvent called:', gameId, event.type);
  // Phase 3: Will append to Supabase `game_events` table
  return Promise.resolve();
}

/**
 * Get game events for replay (stub - returns empty array for Phase 1)
 */
export async function getGameEvents(
  gameId: GameId,
  fromCursor?: number
): Promise<Array<{ type: string; payload?: Record<string, unknown>; cursor: number }>> {
  console.log('📦 [STUB] getGameEvents called:', gameId, 'from:', fromCursor);
  // Phase 3: Will query Supabase `game_events` table
  return Promise.resolve([]);
}
