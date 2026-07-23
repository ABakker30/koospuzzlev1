// src/game/pvp/pvpApi.ts
// PvP API client - Supabase operations for multiplayer game sessions

import { supabase } from '../../lib/supabase';
import type {
  PvPGameSession,
  PvPGameMove,
  PlayerStats,
  RandomOpponent,
  CreatePvPSessionInput,
  SubmitMoveInput,
} from './types';

// ============================================================================
// INVITE CODE GENERATION
// ============================================================================

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars (0/O, 1/I)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Typed rejection for the server-side open-games cap (20260809 trigger:
 * max 5 waiting/active real sessions per creator). Callers branch on
 * `code === 'too_many_games'` to show a friendly message instead of the raw
 * DB failure. Degrades gracefully pre-migration: without the trigger the
 * insert simply succeeds and this error is never thrown.
 */
export class PvPGameCapError extends Error {
  readonly code = 'too_many_games' as const;
  constructor() {
    super('too_many_games');
    this.name = 'PvPGameCapError';
  }
}

/**
 * Create a new PvP game session
 */
export async function createPvPSession(
  input: CreatePvPSessionInput,
  userId: string,
  userName: string,
  userAvatarUrl?: string | null
): Promise<PvPGameSession> {
  const inviteCode = input.isSimulated ? null : generateInviteCode();
  const timerMs = input.timerSeconds * 1000;
  const coinFlip = (Math.random() < 0.5 ? 1 : 2) as 1 | 2;

  const sessionData: any = {
    puzzle_id: input.puzzleId,
    puzzle_name: input.puzzleName,
    player1_id: userId,
    player1_name: userName,
    player1_avatar_url: userAvatarUrl || null,
    status: input.isSimulated ? 'active' : 'waiting',
    current_turn: coinFlip,
    first_player: coinFlip,
    timer_seconds: input.timerSeconds,
    player1_time_remaining_ms: timerMs,
    player2_time_remaining_ms: timerMs,
    board_state: [],
    inventory_state: input.inventoryState,
    placed_count: {},
    hint_limit: input.hintLimit,
    check_limit: input.checkLimit,
    player1_hints_used: 0,
    player2_hints_used: 0,
    player1_checks_used: 0,
    player2_checks_used: 0,
    is_simulated: input.isSimulated,
    invite_code: inviteCode,
    invite_expires_at: inviteCode
      ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() // 48 h expiry — invites are forgiving
      : null,
    player1_last_heartbeat: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('game_sessions')
    .insert(sessionData)
    .select()
    .single();

  if (error) {
    console.error('Failed to create PvP session:', error);
    // The 20260809 cap trigger raises 'too_many_games' (same recognizable-
    // message pattern as the moderation triggers' 'disallowed_content').
    if (String(error.message ?? '').includes('too_many_games')) {
      throw new PvPGameCapError();
    }
    throw new Error(`Failed to create game session: ${error.message}`);
  }

  return data as PvPGameSession;
}

/**
 * Build an in-memory "vs computer" session that runs entirely client-side
 * (no Supabase, no login). The computer is always player 2; the human is
 * always player 1. Used for guest play.
 */
export function createLocalSimulatedSession(
  input: CreatePvPSessionInput,
  player1Id: string,
  player1Name: string,
  randomSeed: number
): PvPGameSession {
  const timerMs = input.timerSeconds * 1000;
  const coinFlip = (randomSeed < 0.5 ? 1 : 2) as 1 | 2;
  const now = new Date().toISOString();

  return {
    id: `local-${Date.now()}-${Math.floor(randomSeed * 1e9)}`,
    puzzle_id: input.puzzleId,
    puzzle_name: input.puzzleName,
    player1_id: player1Id,
    player1_name: player1Name || 'You',
    player1_avatar_url: null,
    player2_id: 'local-computer',
    player2_name: 'Computer',
    player2_avatar_url: null,
    status: 'active',
    current_turn: coinFlip,
    first_player: coinFlip,
    player1_score: 0,
    player2_score: 0,
    timer_seconds: input.timerSeconds,
    player1_time_remaining_ms: timerMs,
    player2_time_remaining_ms: timerMs,
    board_state: [],
    inventory_state: input.inventoryState,
    placed_count: {},
    hint_limit: input.hintLimit,
    check_limit: input.checkLimit,
    player1_hints_used: 0,
    player2_hints_used: 0,
    player1_checks_used: 0,
    player2_checks_used: 0,
    is_simulated: true,
    invite_code: null,
    invite_expires_at: null,
    turn_started_at: now,
    started_at: now,
    created_at: now,
    updated_at: now,
  } as unknown as PvPGameSession;
}

/**
 * Join an existing game session via invite code
 */
export async function joinPvPSession(
  inviteCode: string,
  userId: string,
  userName: string,
  userAvatarUrl?: string | null
): Promise<PvPGameSession | null> {
  // Find the session
  const { data: session, error: findError } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('invite_code', inviteCode.toUpperCase())
    .eq('status', 'waiting')
    .single();

  if (findError || !session) {
    console.error('Game session not found:', findError);
    return null;
  }

  // Check expiry
  if (session.invite_expires_at && new Date(session.invite_expires_at) < new Date()) {
    // Mark as expired
    await supabase
      .from('game_sessions')
      .update({ status: 'expired' })
      .eq('id', session.id);
    return null;
  }

  // Can't join your own game
  if (session.player1_id === userId) {
    return null;
  }

  // Join the session
  const { data: updated, error: updateError } = await supabase
    .from('game_sessions')
    .update({
      player2_id: userId,
      player2_name: userName,
      player2_avatar_url: userAvatarUrl || null,
      status: 'active',
      started_at: new Date().toISOString(),
      turn_started_at: new Date().toISOString(),
      player2_last_heartbeat: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.id)
    .select()
    .single();

  if (updateError) {
    console.error('Failed to join session:', updateError);
    return null;
  }

  return updated as PvPGameSession;
}

/**
 * Set up a simulated opponent for random match
 */
export async function setupSimulatedOpponent(
  sessionId: string,
  opponent: RandomOpponent
): Promise<PvPGameSession | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .update({
      player2_id: opponent.id,
      player2_name: opponent.username,
      player2_avatar_url: opponent.avatar_url,
      simulated_opponent_user_id: opponent.id,
      started_at: new Date().toISOString(),
      turn_started_at: new Date().toISOString(),
      player2_last_heartbeat: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    console.error('Failed to setup simulated opponent:', error);
    return null;
  }

  return data as PvPGameSession;
}

/**
 * Get a random opponent from registered users
 */
export async function getRandomOpponent(userId: string): Promise<RandomOpponent | null> {
  const { data, error } = await supabase.rpc('get_random_opponent', {
    requesting_user_id: userId,
  });

  if (error || !data || data.length === 0) {
    console.error('Failed to get random opponent:', error);
    return null;
  }

  return data[0] as RandomOpponent;
}

/**
 * Get a game session by ID
 */
export async function getPvPSession(sessionId: string): Promise<PvPGameSession | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) {
    console.error('Failed to get session:', error);
    return null;
  }

  return data as PvPGameSession;
}

/**
 * Cancel a session the host no longer wants (waiting room closed, invitee
 * backing out of a pending start). Marks it 'abandoned' so the invite code
 * stops resolving and resume pointers get cleaned up. Best-effort.
 */
export async function cancelPvPSession(sessionId: string): Promise<void> {
  if (sessionId.startsWith('local-')) return;
  const { error } = await supabase
    .from('game_sessions')
    .update({
      status: 'abandoned',
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) {
    console.error('Failed to cancel session:', error);
  }
}

/**
 * Restart the match clocks when a game starts after a pending hold (invitee
 * joined while the host was away). turn_started_at / started_at were stamped
 * at join time — without this reset the chess clock would count the whole
 * away period and instantly expire. Also freshens the host heartbeat so the
 * waiting invitee's presence check flips in the same row update. Returns the
 * patched session, or null on error (callers patch locally as fallback).
 */
export async function restartPvPClock(sessionId: string): Promise<PvPGameSession | null> {
  if (sessionId.startsWith('local-')) return null;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('game_sessions')
    .update({
      turn_started_at: now,
      started_at: now,
      player1_last_heartbeat: now,
      updated_at: now,
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    console.error('Failed to restart session clock:', error);
    return null;
  }
  return data as PvPGameSession;
}

/**
 * Refresh a resuming player's presence on a MID-GAME session without touching
 * the match clocks that belong to the opponent. Unlike restartPvPClock (a
 * pre-first-move full reset) this never rewrites started_at; it freshens the
 * resumer's heartbeat and — only when the turn is the resumer's own —
 * restamps turn_started_at so their away time doesn't burn their clock.
 * Returns the patched session, or null on error (callers patch locally).
 */
export async function resumePvPClock(
  sessionId: string,
  playerNumber: 1 | 2,
  resetTurnClock: boolean
): Promise<PvPGameSession | null> {
  if (sessionId.startsWith('local-')) return null;
  const now = new Date().toISOString();
  const patch: Record<string, string> = {
    [playerNumber === 1 ? 'player1_last_heartbeat' : 'player2_last_heartbeat']: now,
    updated_at: now,
  };
  if (resetTurnClock) patch.turn_started_at = now;

  const { data, error } = await supabase
    .from('game_sessions')
    .update(patch)
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    console.error('Failed to refresh session on resume:', error);
    return null;
  }
  return data as PvPGameSession;
}

/**
 * Fetch the full move history for a session in replay order (move_number asc,
 * created_at + id as tiebreaks). Returns null on any query error so callers
 * can degrade gracefully (mid-game resume treats null as "not resumable").
 */
export async function getSessionMoves(sessionId: string): Promise<PvPGameMove[] | null> {
  if (sessionId.startsWith('local-')) return null;
  const { data, error } = await supabase
    .from('game_moves')
    .select('*')
    .eq('session_id', sessionId)
    .order('move_number', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error('Failed to fetch session moves:', error);
    return null;
  }
  return (data ?? []) as PvPGameMove[];
}

/**
 * Count the moves recorded for a session. Returns null on any query error so
 * callers can degrade gracefully (host resume treats null as "not resumable").
 */
export async function countSessionMoves(sessionId: string): Promise<number | null> {
  const { count, error } = await supabase
    .from('game_moves')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  if (error) {
    console.error('Failed to count session moves:', error);
    return null;
  }
  return count ?? 0;
}

/**
 * Get a game session by invite code
 */
export async function getPvPSessionByInviteCode(code: string): Promise<PvPGameSession | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('invite_code', code.toUpperCase())
    .single();

  if (error) {
    console.error('Failed to get session by invite code:', error);
    return null;
  }

  return data as PvPGameSession;
}

// ============================================================================
// MOVE SUBMISSION
// ============================================================================

/**
 * Submit a move and update session state
 */
export async function submitMove(input: SubmitMoveInput): Promise<PvPGameMove | null> {
  // Local guest game (vs computer) — no backend persistence.
  if (input.sessionId.startsWith('local-')) return null;
  const { data: session } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('id', input.sessionId)
    .single();

  if (!session) return null;

  // Get current move count
  const { count } = await supabase
    .from('game_moves')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', input.sessionId);

  const moveNumber = (count || 0) + 1;

  // Insert the move
  const { data: move, error: moveError } = await supabase
    .from('game_moves')
    .insert({
      session_id: input.sessionId,
      player_number: input.playerNumber,
      player_id: input.playerNumber === 1 ? session.player1_id : session.player2_id,
      move_number: moveNumber,
      move_type: input.moveType,
      piece_id: input.pieceId || null,
      orientation_id: input.orientationId || null,
      cells: input.cells || null,
      score_delta: input.scoreDelta,
      board_state_after: input.boardStateAfter,
      time_spent_ms: input.timeSpentMs,
      player_time_remaining_ms: input.playerTimeRemainingMs,
    })
    .select()
    .single();

  if (moveError) {
    console.error('Failed to submit move:', {
      sessionId: input.sessionId,
      moveNumber,
      moveType: input.moveType,
      playerNumber: input.playerNumber,
      error: moveError,
    });
    return null;
  }

  // Update session state
  const nextTurn = input.playerNumber === 1 ? 2 : 1;
  // Scores: absolute overwrite when provided (moves that remove scored
  // pieces — hint-triggered repair, correct check — recompute both totals
  // from the local engine), incremental delta otherwise (plain places).
  const scoreUpdate = input.absoluteScores
    ? {
        player1_score: input.absoluteScores.player1,
        player2_score: input.absoluteScores.player2,
      }
    : input.playerNumber === 1
      ? { player1_score: session.player1_score + input.scoreDelta }
      : { player2_score: session.player2_score + input.scoreDelta };
  const timeUpdate = input.playerNumber === 1
    ? { player1_time_remaining_ms: input.playerTimeRemainingMs }
    : { player2_time_remaining_ms: input.playerTimeRemainingMs };

  // Hint/check consumption piggybacks on the turn-flip UPDATE so the used-
  // counters survive reloads and stream to the opponent's HUD. Base values
  // come from the session row fetched above (DB truth, not client state).
  const counterUpdate: Record<string, number> = {};
  if (input.consumeHint) {
    const col = input.playerNumber === 1 ? 'player1_hints_used' : 'player2_hints_used';
    counterUpdate[col] = (session[col] ?? 0) + 1;
  }
  if (input.consumeCheck) {
    const col = input.playerNumber === 1 ? 'player1_checks_used' : 'player2_checks_used';
    counterUpdate[col] = (session[col] ?? 0) + 1;
  }

  const { error: sessionError } = await supabase
    .from('game_sessions')
    .update({
      current_turn: nextTurn,
      ...scoreUpdate,
      ...timeUpdate,
      ...counterUpdate,
      board_state: input.boardStateAfter,
      turn_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.sessionId);

  if (sessionError) {
    // The move insert succeeded — the realtime INSERT still reaches the
    // opponent, so return the move; but a stale session row means the turn
    // flip is invisible until the next successful update. Louder handling
    // is a Phase 2 concern.
    console.error('Failed to update session after move:', {
      sessionId: input.sessionId,
      moveNumber,
      moveType: input.moveType,
      error: sessionError,
    });
  }

  return move as PvPGameMove;
}

// ============================================================================
// GAME END
// ============================================================================

/**
 * End a game session
 */
export async function endPvPGame(
  sessionId: string,
  winner: 1 | 2 | null,
  endReason: string,
  finalScores: { player1: number; player2: number }
): Promise<void> {
  if (sessionId.startsWith('local-')) return;
  const { error } = await supabase
    .from('game_sessions')
    .update({
      status: 'completed',
      winner,
      end_reason: endReason,
      player1_score: finalScores.player1,
      player2_score: finalScores.player2,
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) {
    console.error('Failed to end game:', error);
  }
}

/**
 * Resign from a game
 */
export async function resignPvPGame(
  sessionId: string,
  resigningPlayerNumber: 1 | 2
): Promise<void> {
  const winner = resigningPlayerNumber === 1 ? 2 : 1;
  
  // Insert resign move
  const { data: session } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (session) {
    await submitMove({
      sessionId,
      playerNumber: resigningPlayerNumber,
      moveType: 'resign',
      scoreDelta: 0,
      boardStateAfter: session.board_state || [],
      timeSpentMs: 0,
      playerTimeRemainingMs: resigningPlayerNumber === 1
        ? session.player1_time_remaining_ms
        : session.player2_time_remaining_ms,
    });
  }

  await endPvPGame(sessionId, winner as 1 | 2, 'resign', {
    player1: session?.player1_score || 0,
    player2: session?.player2_score || 0,
  });
}

// ============================================================================
// HEARTBEAT / DISCONNECT
// ============================================================================

/**
 * Send heartbeat to indicate player is still connected
 */
export async function sendHeartbeat(
  sessionId: string,
  playerNumber: 1 | 2
): Promise<void> {
  if (sessionId.startsWith('local-')) return;
  const field = playerNumber === 1 ? 'player1_last_heartbeat' : 'player2_last_heartbeat';
  
  await supabase
    .from('game_sessions')
    .update({
      [field]: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

/**
 * Check if opponent has disconnected (no heartbeat in 30 seconds)
 */
export function isOpponentDisconnected(
  session: PvPGameSession,
  myPlayerNumber: 1 | 2
): boolean {
  const opponentHeartbeat = myPlayerNumber === 1
    ? session.player2_last_heartbeat
    : session.player1_last_heartbeat;

  if (!opponentHeartbeat) return false;

  const lastBeat = new Date(opponentHeartbeat).getTime();
  const now = Date.now();
  return (now - lastBeat) > 30000; // 30 seconds
}

// ============================================================================
// PLAYER STATS
// ============================================================================

/**
 * Update player stats after a game
 */
export async function updatePlayerStats(
  userId: string,
  result: 'win' | 'loss' | 'draw' | 'abandoned',
  score: number
): Promise<void> {
  // Get current stats or create new
  const { data: existing } = await supabase
    .from('player_stats')
    .select('*')
    .eq('user_id', userId)
    .single();

  const stats = existing || {
    user_id: userId,
    games_played: 0,
    games_won: 0,
    games_lost: 0,
    games_drawn: 0,
    games_abandoned: 0,
    total_score: 0,
    highest_score: 0,
  };

  const updates: any = {
    user_id: userId,
    games_played: stats.games_played + 1,
    total_score: stats.total_score + score,
    highest_score: Math.max(stats.highest_score, score),
    updated_at: new Date().toISOString(),
  };

  if (result === 'win') updates.games_won = stats.games_won + 1;
  else if (result === 'loss') updates.games_lost = stats.games_lost + 1;
  else if (result === 'draw') updates.games_drawn = stats.games_drawn + 1;
  else if (result === 'abandoned') updates.games_abandoned = stats.games_abandoned + 1;

  await supabase
    .from('player_stats')
    .upsert(updates);
}

/**
 * Get player stats
 */
export async function getPlayerStats(userId: string): Promise<PlayerStats | null> {
  const { data, error } = await supabase
    .from('player_stats')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data as PlayerStats;
}

// ============================================================================
// REALTIME SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to game session updates (for real-time sync).
 *
 * postgres_changes delivers nothing until the channel reaches SUBSCRIBED and
 * has no backfill — an UPDATE that fires while the join handshake is in
 * flight is silently lost (the "I had to refresh to see it was my turn"
 * failure). So on SUBSCRIBED we fetch the row once and hand it to onUpdate:
 * subscribers always start from the current session state, and every later
 * change streams as before.
 */
export function subscribeToSession(
  sessionId: string,
  onUpdate: (session: PvPGameSession) => void
) {
  // Local guest game — no realtime channel.
  if (sessionId.startsWith('local-')) return () => {};
  let removed = false;
  const channel = supabase
    .channel(`game-session-${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_sessions',
        filter: `id=eq.${sessionId}`,
      },
      (payload) => {
        onUpdate(payload.new as PvPGameSession);
      }
    )
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      // One-shot catch-up for anything missed during the join.
      supabase
        .from('game_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()
        .then(({ data, error }) => {
          if (removed || error || !data) return;
          onUpdate(data as PvPGameSession);
        });
    });

  return () => {
    removed = true;
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to new moves in a game session
 */
export function subscribeToMoves(
  sessionId: string,
  onNewMove: (move: PvPGameMove) => void
) {
  const channel = supabase
    .channel(`game-moves-${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'game_moves',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        onNewMove(payload.new as PvPGameMove);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
