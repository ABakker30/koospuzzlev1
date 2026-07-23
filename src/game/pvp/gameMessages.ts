// src/game/pvp/gameMessages.ts
// Persistent PvP chat client — thin layer over public.game_messages
// (migration 20260806_game_messages.sql, the contract). Messages persist per
// session so a turn-at-your-leisure opponent finds them on open; realtime
// INSERTs deliver them instantly when both players are present.
//
// Anton runs migrations by hand, so EVERYTHING here degrades gracefully
// pre-migration: the first history load doubles as the availability probe —
// a missing-table error marks the table unavailable (cached module-wide) and
// callers fall back to the legacy broadcast-only chat. Nothing throws.

import { supabase } from '../../lib/supabase';
import { mapDbModerationError } from '../../services/moderationService';

export interface GameMessageRow {
  id: string;
  session_id: string;
  sender_id: string;
  text: string;
  created_at: string;
}

/** Pre-migration detector (same style as moderationService). */
const isMissingTable = (message: string | undefined): boolean =>
  !!message && /does not exist|schema cache|not found/i.test(message);

// Missing table is a global condition — probe once per app session, not per
// game. null = not probed yet; the first history load decides.
let tableAvailable: boolean | null = null;

/** Whether game_messages exists, as far as this session has observed. */
export function isPersistentChatKnownUnavailable(): boolean {
  return tableAvailable === false;
}

export type ChatHistoryResult =
  | { available: true; messages: GameMessageRow[] }
  | { available: false };

/**
 * Load the last `limit` messages of a session in ascending order. Doubles as
 * the per-session availability probe: a missing-table error returns
 * {available: false} (cached) so the caller can use the broadcast fallback.
 * Non-missing-table errors degrade to an empty history but keep the
 * persistent path (the trigger-backed insert is still the better transport).
 */
export async function fetchChatHistory(
  sessionId: string,
  limit = 100
): Promise<ChatHistoryResult> {
  if (tableAvailable === false) return { available: false };
  try {
    const { data, error } = await supabase
      .from('game_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      if (isMissingTable(error.message)) {
        tableAvailable = false;
        return { available: false };
      }
      return { available: true, messages: [] };
    }
    tableAvailable = true;
    return { available: true, messages: (data as GameMessageRow[]).reverse() };
  } catch (e: any) {
    if (isMissingTable(e?.message)) {
      tableAvailable = false;
      return { available: false };
    }
    return { available: false };
  }
}

/**
 * Pure cursor helper for the chat poll: returns whichever created_at is later.
 * `current` null (no messages seen yet) → the candidate wins. Unparseable
 * timestamps compare as 0, so a valid candidate always beats a garbage cursor
 * (and a garbage candidate never regresses a valid one).
 */
export function laterCreatedAt(current: string | null, candidate: string): string {
  if (current === null) return candidate;
  return (Date.parse(candidate) || 0) > (Date.parse(current) || 0) ? candidate : current;
}

/**
 * Incremental poll fetch: messages with created_at strictly AFTER
 * `afterCreatedAt`, ascending, capped at `limit`. A null cursor (nothing seen
 * yet — e.g. the session had no history) delegates to fetchChatHistory so the
 * shape (last `limit`, ascending) matches the open-time load. Same
 * availability/missing-table degradation as fetchChatHistory: this doubles as
 * a probe, and non-missing-table errors degrade to an empty batch so the next
 * tick simply retries.
 */
export async function fetchMessagesSince(
  sessionId: string,
  afterCreatedAt: string | null,
  limit = 100
): Promise<ChatHistoryResult> {
  if (afterCreatedAt === null) return fetchChatHistory(sessionId, limit);
  if (tableAvailable === false) return { available: false };
  try {
    const { data, error } = await supabase
      .from('game_messages')
      .select('*')
      .eq('session_id', sessionId)
      .gt('created_at', afterCreatedAt)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) {
      if (isMissingTable(error.message)) {
        tableAvailable = false;
        return { available: false };
      }
      return { available: true, messages: [] };
    }
    tableAvailable = true;
    return { available: true, messages: data as GameMessageRow[] };
  } catch (e: any) {
    if (isMissingTable(e?.message)) {
      tableAvailable = false;
      return { available: false };
    }
    return { available: false };
  }
}

export type SendMessageResult =
  | { ok: true; message: GameMessageRow }
  | { ok: false; code: 'disallowed_content' | 'rate_limited' | 'unavailable' | 'error' };

/** Insert a chat message. Maps the 20260806 trigger rejections so the UI can
 *  show friendly toasts ('disallowed_content' / 'rate_limited'). */
export async function sendGameMessage(
  sessionId: string,
  senderId: string,
  text: string
): Promise<SendMessageResult> {
  try {
    const { data, error } = await supabase
      .from('game_messages')
      .insert({ session_id: sessionId, sender_id: senderId, text })
      .select()
      .single();
    if (error) {
      const mod = mapDbModerationError(error);
      if (mod === 'disallowed_content' || mod === 'rate_limited') {
        return { ok: false, code: mod };
      }
      if (isMissingTable(error.message)) {
        tableAvailable = false;
        return { ok: false, code: 'unavailable' };
      }
      return { ok: false, code: 'error' };
    }
    tableAvailable = true;
    return { ok: true, message: data as GameMessageRow };
  } catch (e: any) {
    const mod = mapDbModerationError(e);
    if (mod === 'disallowed_content' || mod === 'rate_limited') {
      return { ok: false, code: mod };
    }
    if (isMissingTable(e?.message)) {
      tableAvailable = false;
      return { ok: false, code: 'unavailable' };
    }
    return { ok: false, code: 'error' };
  }
}

/** Realtime INSERT stream for one session's chat. Returns the unsubscribe. */
export function subscribeToGameMessages(
  sessionId: string,
  onMessage: (message: GameMessageRow) => void
): () => void {
  const channel = supabase
    .channel(`game-messages-${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'game_messages',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        onMessage(payload.new as GameMessageRow);
      }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Unread watermark — per-session "seen up to" timestamp in localStorage.
// Set whenever the game/chat is open; the Home inbox counts newer messages.
// ---------------------------------------------------------------------------

const seenKey = (sessionId: string) => `pvp.chatSeen.${sessionId}`;

export function getChatSeenWatermark(sessionId: string): string | null {
  try {
    return localStorage.getItem(seenKey(sessionId));
  } catch {
    return null;
  }
}

export function markChatSeen(sessionId: string): void {
  try {
    localStorage.setItem(seenKey(sessionId), new Date().toISOString());
  } catch {
    // Best-effort — worst case the unread badge over-counts.
  }
}

/** Drop a session's watermark (terminal cleanup, alongside removeMySession). */
export function clearChatSeen(sessionId: string): void {
  try {
    localStorage.removeItem(seenKey(sessionId));
  } catch {
    // Best-effort.
  }
}

/**
 * Unread count for the inbox: messages from the OPPONENT newer than the
 * per-session watermark. 0 pre-migration or on any error (badge is
 * decoration, never noise).
 */
export async function countUnreadMessages(
  sessionId: string,
  myUserId: string
): Promise<number> {
  if (tableAvailable === false) return 0;
  try {
    let query = supabase
      .from('game_messages')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .neq('sender_id', myUserId);
    const watermark = getChatSeenWatermark(sessionId);
    if (watermark) query = query.gt('created_at', watermark);
    const { count, error } = await query;
    if (error) {
      if (isMissingTable(error.message)) tableAvailable = false;
      return 0;
    }
    tableAvailable = true;
    return count ?? 0;
  } catch {
    return 0;
  }
}
