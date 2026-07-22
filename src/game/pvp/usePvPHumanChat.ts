// usePvPHumanChat — real player-to-player chat for live PvP sessions.
//
// When the opponent is a human (pvpSession.is_simulated === false) the game
// chat must connect the two PLAYERS, not an AI bot (which is what useGameChat
// provides and what simulated matches keep). Transport is a Supabase Realtime
// broadcast channel per session — ephemeral, no table, no persistence: the
// chat lives exactly as long as the match.
//
// Exposes the same shape as useGameChat so ChatDrawer/ManualGameChatPanel
// render either interchangeably (opponent messages use the 'ai' role, which
// the panel styles as the left-hand bubble).

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { GameChatMessage } from '../../pages/solve/hooks/useGameChat';
import { fetchBlocklist, maskDisallowedText } from '../../services/moderationService';

function msg(role: 'user' | 'ai', content: string): GameChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: Date.now(),
  };
}

export function usePvPHumanChat(
  sessionId: string | null,
  userId: string | null,
  username: string,
  opponentName: string
) {
  const [messages, setMessages] = useState<GameChatMessage[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Soft profanity filter (client-side only — messages are ephemeral
  // broadcasts, never stored, so there's no DB trigger to lean on). Blocked
  // words are masked with asterisks rather than blocking the message.
  const blocklistRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchBlocklist().then((words) => {
      if (!cancelled) blocklistRef.current = words;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionId || !userId) return;
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
  }, [sessionId, userId]);

  const sendUserMessage = useCallback(
    async (text: string) => {
      // Outgoing filter: mask blocked words (cached fetch — instant after the
      // first call; [] pre-migration → passes through unchanged).
      const trimmed = maskDisallowedText(
        text.trim().slice(0, 500),
        await fetchBlocklist()
      );
      if (!trimmed) return;
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
    [userId, username]
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
