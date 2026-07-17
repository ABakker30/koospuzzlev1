// src/game/persistence/GameRepo.ts
// Persistence for game mode solutions

import type { GameState, GameId, GamePlacedPiece } from '../contracts/GameState';
import { supabase } from '../../lib/supabase';
import { computeSolutionSignature } from '../../utils/solutionSignature';

// ============================================================================
// SAVE GAME SOLUTION (when puzzle is completed in play mode)
// ============================================================================

export interface SaveGameSolutionResult {
  success: boolean;
  solutionId?: string;
  /** Canonical solution identity — lets callers run the discovery check. */
  signature?: string | null;
  error?: string;
}

export interface SaveGameSolutionOptions {
  thumbnailUrl?: string | null;
}

/**
 * Save a completed game solution to the database
 * Works for both logged-in and anonymous users
 */
export async function saveGameSolution(
  gameState: GameState,
  options: SaveGameSolutionOptions = {}
): Promise<SaveGameSolutionResult> {
  console.log('💾 [GameRepo] Saving game solution...');
  
  try {
    // Get current user session (may be null for anonymous)
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;
    
    // Stored solver_name is only a FALLBACK now — display names are looked up
    // live from users.username (via public_profiles) by created_by. So for
    // logged-in solves it just snapshots the DB username; for anonymous solves
    // (no owner to look up) it uses the locally-chosen name.
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
    } else {
      try {
        solverName = (localStorage.getItem('user_preferences_username') || '').trim() || 'Anonymous';
      } catch {
        solverName = 'Anonymous';
      }
    }
    
    // Build final geometry from all placed pieces
    const placedPieces = Array.from(gameState.boardState.values());
    const finalGeometry = placedPieces.flatMap(piece => piece.cells);
    
    // Honest solve duration: first placement -> solve (not game-creation ->
    // solve, which would include time spent looking at the puzzle before the
    // first move). Every piece carries an absolute placedAt timestamp.
    const endTime = gameState.endState?.endedAt
      ? new Date(gameState.endState.endedAt).getTime()
      : Date.now();
    const firstPlacementAt = placedPieces.length
      ? Math.min(...placedPieces.map(p => p.placedAt))
      : new Date(gameState.createdAt).getTime();
    const durationMs = Math.max(0, endTime - firstPlacementAt);
    
    // Count hints used (pieces placed via hint)
    const hintsUsed = placedPieces.filter(p => p.source === 'hint').length;
    
    // Get active player score
    const playerScore = gameState.players[0]?.score ?? 0;

    // Canonical identity — same pieces on same cells = same solution,
    // regardless of who solved it, in what order, or how fast. Enables
    // distinct-solution counts and "new discovery" detection.
    let signature: string | null = null;
    try {
      signature = await computeSolutionSignature(placedPieces);
    } catch (e) {
      console.warn('[GameRepo] signature computation failed (saving without):', e);
    }

    // Build solution data
    const solutionData: Record<string, unknown> = {
      puzzle_id: gameState.puzzleRef.id,
      created_by: userId, // null for anonymous
      solver_name: solverName,
      solution_type: 'manual', // Game mode is manual solving
      final_geometry: finalGeometry,
      placed_pieces: placedPieces.map(p => ({
        uid: p.uid,
        pieceId: p.pieceId,
        orientationId: p.orientationId,
        cells: p.cells,
        placedAt: p.placedAt,
        reason: p.source === 'ai' ? 'computer' : p.source, // Map 'ai' -> 'computer' for viewer compatibility
      })),
      // Statistics
      total_moves: placedPieces.length,
      hints_used: hintsUsed,
      // Ranked scoring: pieces you placed yourself (X) out of total (N).
      placements_by_you: placedPieces.filter(p => p.source === 'user').length,
      total_pieces: placedPieces.length,
      duration_ms: durationMs,
      solve_time_ms: durationMs,
      move_count: placedPieces.length,
      // Game-specific metadata
      notes: `Solved in Play Mode. Score: ${playerScore}`,
      // Thumbnail for gallery display
      thumbnail_url: options.thumbnailUrl || null,
      // Canonical solution identity (null only if hashing failed)
      signature,
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
    return { success: true, solutionId: data.id, signature };
    
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
