// src/game/persistence/GameRepo.ts
// Persistence for game mode solutions

import type { GameState, GameId, GamePlacedPiece } from '../contracts/GameState';
import { supabase } from '../../lib/supabase';

// ============================================================================
// SAVE GAME SOLUTION (when puzzle is completed in play mode)
// ============================================================================

export interface SaveGameSolutionResult {
  success: boolean;
  solutionId?: string;
  error?: string;
}

/**
 * Save a completed game solution to the database
 * Works for both logged-in and anonymous users
 */
export async function saveGameSolution(gameState: GameState): Promise<SaveGameSolutionResult> {
  console.log('💾 [GameRepo] Saving game solution...');
  
  try {
    // Get current user session (may be null for anonymous)
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;
    
    // Get solver name
    let solverName = 'Anonymous';
    if (session?.user) {
      try {
        const { data: userData } = await supabase
          .from('users')
          .select('username')
          .eq('id', session.user.id)
          .single();
        solverName = userData?.username || session.user.email || 'Anonymous';
      } catch {
        solverName = session.user.email || 'Anonymous';
      }
    }
    
    // Build final geometry from all placed pieces
    const placedPieces = Array.from(gameState.boardState.values());
    const finalGeometry = placedPieces.flatMap(piece => piece.cells);
    
    // Calculate game duration
    const startTime = new Date(gameState.createdAt).getTime();
    const endTime = gameState.endState?.endedAt 
      ? new Date(gameState.endState.endedAt).getTime() 
      : Date.now();
    const durationMs = endTime - startTime;
    
    // Count hints used (pieces placed via hint)
    const hintsUsed = placedPieces.filter(p => p.source === 'hint').length;
    
    // Get active player score
    const playerScore = gameState.players[0]?.score ?? 0;
    
    // Build solution data
    const solutionData: Record<string, unknown> = {
      puzzle_id: gameState.puzzleRef.id,
      created_by: userId, // null for anonymous
      solver_name: solverName,
      solution_type: 'manual', // Game mode is manual solving
      final_geometry: finalGeometry,
      placed_pieces: placedPieces.map(p => ({
        pieceId: p.pieceId,
        orientationId: p.orientationId,
        cells: p.cells,
        source: p.source,
      })),
      // Statistics
      total_moves: placedPieces.length,
      hints_used: hintsUsed,
      duration_ms: durationMs,
      solve_time_ms: durationMs,
      move_count: placedPieces.length,
      // Game-specific metadata
      notes: `Solved in Play Mode. Score: ${playerScore}`,
    };
    
    const { data, error } = await supabase
      .from('solutions')
      .insert([solutionData])
      .select()
      .single();
    
    if (error) {
      console.error('❌ [GameRepo] Failed to save solution:', error);
      return { success: false, error: error.message };
    }
    
    console.log('✅ [GameRepo] Solution saved:', data.id);
    return { success: true, solutionId: data.id };
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('❌ [GameRepo] Save error:', err);
    return { success: false, error: errorMsg };
  }
}

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
