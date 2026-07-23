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
  fetchMessagesSince,
  laterCreatedAt,
  sendGameMessage,
  subscribeToGameMessages,
  markChatSeen,
  type GameMessageRow,
} from './gameMessages';

/** Chat poll cadence — matches the PvP polling backstop in GamePage (4s). */
const CHAT_POLL_INTERVAL_MS = 4000;

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
  // back as a realtime echo AND as a poll result).
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Poll cursor: created_at of the newest row this client has observed (via
  // history, realtime, own send, or a previous poll). null = nothing yet.
  const newestCreatedAtRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBlocklist().then((words) => {
      if (!cancelled) blocklistRef.current = words;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Probe + history + subscription + poll (persistent path) ----
  useEffect(() => {
    if (!sessionId || !userId) return;
    let cancelled = false;
    let unsubMessages: (() => void) | null = null;
    let pollId: number | null = null;

    setMessages([]);
    setPersistent(null);
    seenIdsRef.current = new Set();
    newestCreatedAtRef.current = null;

    const rowToChat = (row: GameMessageRow): GameChatMessage => ({
      id: row.id,
      role: row.sender_id === userId ? 'user' : 'ai',
      content: maskDisallowedText(row.text.slice(0, 500), blocklistRef.current),
      timestamp: Date.parse(row.created_at) || Date.now(),
    });

    // SINGLE arrival handler — realtime and poll both land here, so dedupe,
    // rendering, and the seen-watermark side effect are identical no matter
    // which transport delivered the row. The poll cursor is NOT advanced
    // here: realtime can drop an earlier row while delivering a later one
    // during channel flap, and jumping the cursor past the gap would lose
    // the dropped row. Only complete ascending scans (history load, poll
    // batches) move the cursor; realtime rows get refetched and deduped.
    const applyIncomingRow = (row: GameMessageRow) => {
      if (cancelled) return;
      if (seenIdsRef.current.has(row.id)) return;
      seenIdsRef.current.add(row.id);
      const chatMsg = rowToChat(row);
      if (chatMsg.content) setMessages((prev) => [...prev, chatMsg]);
      // Chat is on screen while the game is open — keep the watermark fresh
      // so the inbox badge doesn't count messages the player just read.
      markChatSeen(sessionId);
    };

    (async () => {
      const history = await fetchChatHistory(sessionId);
      if (cancelled) return;

      if (!history.available) {
        // Pre-migration: legacy ephemeral broadcast channel, unchanged.
        setPersistent(false);
        return;
      }

      setPersistent(true);
      for (const row of history.messages) {
        seenIdsRef.current.add(row.id);
        newestCreatedAtRef.current = laterCreatedAt(newestCreatedAtRef.current, row.created_at);
      }
      // Blocklist may still be fetching — mask again cheaply on arrival is
      // not worth it; the DB trigger already refused disallowed content.
      setMessages(history.messages.map(rowToChat).filter((m) => m.content));
      // The game is open — everything loaded counts as seen.
      markChatSeen(sessionId);

      unsubMessages = subscribeToGameMessages(sessionId, applyIncomingRow);

      // ---- Chat polling backstop: the GUARANTEED delivery path ----
      // Same doctrine as the moves/session poll in GamePage: realtime channel
      // joins flap on phones for long stretches, so postgres_changes is only
      // an accelerator. Every 4s while visible, fetch rows newer than the
      // poll cursor and feed them through the SAME handler as realtime —
      // id-dedupe makes the overlap free. Local sessions never reach the
      // persistent path with a real DB row set, but mirror the backbone's
      // 'local-' guard anyway so we never poll Supabase for a local id.
      if (!sessionId.startsWith('local-')) {
        let inFlight = false;
        const tick = async () => {
          if (cancelled || inFlight || document.visibilityState === 'hidden') return;
          inFlight = true;
          try {
            const batch = await fetchMessagesSince(sessionId, newestCreatedAtRef.current);
            if (cancelled || !batch.available) return;
            for (const row of batch.messages) {
              // Poll batches are complete ascending scans past the cursor, so
              // (unlike realtime rows) they may advance it.
              newestCreatedAtRef.current = laterCreatedAt(
                newestCreatedAtRef.current,
                row.created_at
              );
              applyIncomingRow(row);
            }
          } catch {
            // Offline blip — the next tick retries.
          } finally {
            inFlight = false;
          }
        };
        pollId = window.setInterval(tick, CHAT_POLL_INTERVAL_MS);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubMessages) unsubMessages();
      if (pollId !== null) window.clearInterval(pollId);
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
          // NOTE: deliberately do NOT advance the poll cursor here — our row's
          // created_at could postdate an opponent row the poll hasn't fetched
          // yet, and jumping past it would skip that row forever. The next
          // poll refetches our own row and the id-dedupe drops it (free).
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
