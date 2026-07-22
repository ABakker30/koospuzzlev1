// usePvPHumanChat — real player-to-player chat for PvP sessions.
//
// When the opponent is a human (pvpSession.is_simulated === false) the game
// chat must connect the two PLAYERS, not an AI bot (which is what useGameChat
// provides and what simulated matches keep).
//
// Transport (async-first PvP Phase 2b): messages persist in
// public.game_messages (migration 20260806) — history loads on open, realtime
// INSERTs deliver live, and the DB content/rate-limit triggers moderate. The
// first history load doubles as the availability probe: pre-migration
// (missing table) every session falls back to the ORIGINAL ephemeral
// broadcast channel, so nothing regresses before Anton runs the migration.
//
// Exposes the same shape as useGameChat so ChatDrawer/ManualGameChatPanel
// render either interchangeably (opponent messages use the 'ai' role, which
// the panel styles as the left-hand bubble).

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { GameChatMessage } from '../../pages/solve/hooks/useGameChat';
import { fetchBlocklist, maskDisallowedText } from '../../services/moderationService';
import {
  fetchChatHistory,
  sendGameMessage,
  subscribeToGameMessages,
  markChatSeen,
  type GameMessageRow,
} from './gameMessages';

function msg(role: 'user' | 'ai', content: string): GameChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: Date.now(),
  };
}

/** Toast keys the host page can surface (i18n keys, not copy). */
export type PvPChatNotice = 'pvp.chat.blocked' | 'pvp.chat.slowDown';

export function usePvPHumanChat(
  sessionId: string | null,
  userId: string | null,
  username: string,
  opponentName: string,
  onNotice?: (noticeKey: PvPChatNotice) => void
) {
  const [messages, setMessages] = useState<GameChatMessage[]>([]);
  // null = probing (history load in flight); true = game_messages path;
  // false = legacy broadcast path (pre-migration).
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;
  // Soft profanity filter (client-side pre-mask, kept as UX on both paths —
  // on the persistent path the DB trigger is the enforcement). Blocked words
  // are masked with asterisks rather than blocking the message.
  const blocklistRef = useRef<string[]>([]);
  // Persistent-path dedupe: row ids already rendered (our own insert comes
  // back as a realtime echo).
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchBlocklist().then((words) => {
      if (!cancelled) blocklistRef.current = words;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Probe + history + subscription (persistent path) ----
  useEffect(() => {
    if (!sessionId || !userId) return;
    let cancelled = false;
    let unsubMessages: (() => void) | null = null;

    setMessages([]);
    setPersistent(null);
    seenIdsRef.current = new Set();

    const rowToChat = (row: GameMessageRow): GameChatMessage => ({
      id: row.id,
      role: row.sender_id === userId ? 'user' : 'ai',
      content: maskDisallowedText(row.text.slice(0, 500), blocklistRef.current),
      timestamp: Date.parse(row.created_at) || Date.now(),
    });

    (async () => {
      const history = await fetchChatHistory(sessionId);
      if (cancelled) return;

      if (!history.available) {
        // Pre-migration: legacy ephemeral broadcast channel, unchanged.
        setPersistent(false);
        return;
      }

      setPersistent(true);
      for (const row of history.messages) seenIdsRef.current.add(row.id);
      // Blocklist may still be fetching — mask again cheaply on arrival is
      // not worth it; the DB trigger already refused disallowed content.
      setMessages(history.messages.map(rowToChat).filter((m) => m.content));
      // The game is open — everything loaded counts as seen.
      markChatSeen(sessionId);

      unsubMessages = subscribeToGameMessages(sessionId, (row) => {
        if (cancelled) return;
        if (seenIdsRef.current.has(row.id)) return;
        seenIdsRef.current.add(row.id);
        const chatMsg = rowToChat(row);
        if (chatMsg.content) setMessages((prev) => [...prev, chatMsg]);
        // Chat is on screen while the game is open — keep the watermark fresh
        // so the inbox badge doesn't count messages the player just read.
        markChatSeen(sessionId);
      });
    })();

    return () => {
      cancelled = true;
      if (unsubMessages) unsubMessages();
    };
  }, [sessionId, userId]);

  // ---- Legacy broadcast transport (only when the table is missing) ----
  useEffect(() => {
    if (!sessionId || !userId || persistent !== false) return;
    const channel = supabase.channel(`game-chat-${sessionId}`);
    channel
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        if (!payload || payload.from === userId) return; // own messages are appended on send
        // Mask incoming too — the sender's client may not have filtered.
        const text = maskDisallowedText(
          String(payload.text ?? '').slice(0, 500),
          blocklistRef.current
        );
        if (text) setMessages((prev) => [...prev, msg('ai', text)]);
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [sessionId, userId, persistent]);

  const sendUserMessage = useCallback(
    async (text: string) => {
      // Outgoing filter: mask blocked words (cached fetch — instant after the
      // first call; [] pre-migration → passes through unchanged).
      const trimmed = maskDisallowedText(
        text.trim().slice(0, 500),
        await fetchBlocklist()
      );
      if (!trimmed || !sessionId || !userId) return;

      if (persistent) {
        const result = await sendGameMessage(sessionId, userId, trimmed);
        if (result.ok) {
          if (!seenIdsRef.current.has(result.message.id)) {
            seenIdsRef.current.add(result.message.id);
            setMessages((prev) => [
              ...prev,
              {
                id: result.message.id,
                role: 'user',
                content: trimmed,
                timestamp: Date.parse(result.message.created_at) || Date.now(),
              },
            ]);
          }
          markChatSeen(sessionId);
        } else if (result.code === 'disallowed_content') {
          onNoticeRef.current?.('pvp.chat.blocked');
        } else if (result.code === 'rate_limited') {
          onNoticeRef.current?.('pvp.chat.slowDown');
        } else {
          // Transient failure (or the table vanished) — show the message
          // locally so typing isn't lost; persistence is best-effort here.
          setMessages((prev) => [...prev, msg('user', trimmed)]);
        }
        return;
      }

      // Legacy broadcast path (pre-migration) — unchanged behavior.
      setMessages((prev) => [...prev, msg('user', trimmed)]);
      try {
        await channelRef.current?.send({
          type: 'broadcast',
          event: 'message',
          payload: { from: userId, name: username, text: trimmed },
        });
      } catch {
        /* transient network failure — message stays visible locally */
      }
    },
    [sessionId, userId, username, persistent]
  );

  const sendEmoji = useCallback((emoji: string) => sendUserMessage(emoji), [sendUserMessage]);

  return {
    messages,
    isSending: false, // human chat has no "thinking…" state
    sendUserMessage,
    sendEmoji,
    opponentName,
  };
}
