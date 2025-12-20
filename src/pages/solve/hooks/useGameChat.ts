import { useCallback, useState } from 'react';
import { aiClient } from '../../../services/aiClient';
import { getStoryContextCondensed } from '../../../ai/StoryContext';

export type GameChatRole = 'user' | 'ai';

export interface GameChatMessage {
  id: string;
  role: GameChatRole;
  content: string;
  timestamp: number;
}

export interface GameChatOptions {
  getGameContext?: () => any;
  includeStoryContext?: boolean;
  mode?: 'versus' | 'general';
  initialMessage?: string;
}

function createMessage(role: GameChatRole, content: string): GameChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: Date.now(),
  };
}

/**
 * Chat hook for AI interactions throughout the app.
 * Can be used in versus mode (game-specific) or general mode (story-aware).
 */
export function useGameChat(options: GameChatOptions = {}) {
  const {
    getGameContext,
    includeStoryContext = false,
    mode = 'versus',
    initialMessage = "Hi, I'm your Koos opponent 🤖. You play the pieces, I play back — and we can chat down here while we do it."
  } = options;
  const [messages, setMessages] = useState<GameChatMessage[]>([
    createMessage('ai', initialMessage),
  ]);
  const [isSending, setIsSending] = useState(false);

  const appendMessage = useCallback((msg: GameChatMessage) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  const sendUserMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userMsg = createMessage('user', trimmed);
      appendMessage(userMsg);

      setIsSending(true);
      try {
        // Now using supabase.functions.invoke() which handles CORS properly
        const USE_REAL_AI = true; // ← Now true - using Supabase client instead of raw fetch
        
        let reply: string;
        
        if (USE_REAL_AI) {
          const gameContext = getGameContext ? getGameContext() : undefined;

          // Build system prompt based on mode
          let systemPrompt = '';
          
          if (mode === 'versus') {
            // Versus mode: game-focused
            systemPrompt = `
You are a playful AI opponent in the Koos Puzzle versus mode.

Current game state (JSON): ${JSON.stringify(gameContext ?? {})}

Style: friendly, competitive, playful. Keep responses to 1–2 sentences.
React to the game state if relevant (like score, last move, how full the board is),
otherwise just chat naturally with the user.
            `.trim();
          } else {
            // General mode: story-aware
            systemPrompt = `
You are the AI assistant inside the Koos Puzzle app.

Style: Friendly, curious, natural. Keep responses conversational and clear.
Answer questions naturally without forcing history or context unless relevant.
            `.trim();
          }

          // Inject story context if requested (soft augmentation)
          if (includeStoryContext) {
            const storyContext = getStoryContextCondensed();
            systemPrompt += `

Background context (use when relevant, but keep responses natural):
${storyContext}
            `.trim();
          }

          reply = await aiClient.chat(
            [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: trimmed },
            ],
            {
              screen: { name: mode === 'versus' ? 'versus_chat' : 'home_chat' },
            }
          );
        } else {
          // Stub response while edge function is being set up
          await new Promise(res => setTimeout(res, 400)); // Simulate delay
          reply = trimmed.length < 6
            ? `Short but sweet. Your turn up there, my turn down here 😄`
            : `I see what you mean about "${trimmed}". Let's see how that plays out on the board.`;
        }

        const aiMsg = createMessage('ai', reply);
        appendMessage(aiMsg);
      } catch (error) {
        console.error('AI chat error:', error);
        const aiMsg = createMessage(
          'ai',
          "I'm having connection trouble talking to HQ. Let's keep puzzling and try again in a bit 😅"
        );
        appendMessage(aiMsg);
      } finally {
        setIsSending(false);
      }
    },
    [appendMessage, getGameContext]
  );

  const sendEmoji = useCallback(
    async (emoji: string) => {
      const userMsg = createMessage('user', emoji);
      appendMessage(userMsg);

      // Optional tiny AI reaction to emoji
      setIsSending(true);
      try {
        const aiMsg = createMessage(
          'ai',
          `Nice ${emoji}! I'll pretend that was either confidence or mild panic.` 
        );
        await new Promise(res => setTimeout(res, 300));
        appendMessage(aiMsg);
      } finally {
        setIsSending(false);
      }
    },
    [appendMessage]
  );

  const addAIComment = useCallback(
    (content: string) => {
      const msg = createMessage('ai', content);
      appendMessage(msg);
    },
    [appendMessage]
  );

  return {
    messages,
    isSending,
    sendUserMessage,
    sendEmoji,
    addAIComment, // 👈 NEW - for event-driven comments
  };
}
