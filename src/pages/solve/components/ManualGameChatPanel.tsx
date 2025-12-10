import React, { useState, FormEvent } from 'react';
import type { GameChatMessage } from '../hooks/useGameChat';

interface ManualGameChatPanelProps {
  messages: GameChatMessage[];
  isSending: boolean;
  onSendMessage: (text: string) => void;
  onSendEmoji: (emoji: string) => void;
}

const QUICK_EMOJIS = ['😀', '😅', '🎉', '🤔', '😈'];

export const ManualGameChatPanel: React.FC<ManualGameChatPanelProps> = ({
  messages,
  isSending,
  onSendMessage,
  onSendEmoji,
}) => {
  const [draft, setDraft] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSendMessage(draft);
    setDraft('');
  };

  return (
    <section className="vs-chat-panel">
      <header className="vs-chat-header">
        <div>
          <div className="vs-chat-title">Game chat</div>
          <div className="vs-chat-subtitle">
            Chat with your AI opponent while you play.
          </div>
        </div>
        {isSending && (
          <div className="vs-chat-status">
            Thinking<span className="vs-chat-dot">…</span>
          </div>
        )}
      </header>

      <div className="vs-chat-body">
        {messages.length === 0 ? (
          <div className="vs-chat-empty">
            No messages yet. Say hi 👋
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={
                msg.role === 'user'
                  ? 'vs-chat-message vs-chat-message-user'
                  : 'vs-chat-message vs-chat-message-ai'
              }
            >
              <div className="vs-chat-bubble">
                {msg.content}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="vs-chat-quick">
        {QUICK_EMOJIS.map(emoji => (
          <button
            key={emoji}
            type="button"
            className="vs-chat-emoji"
            onClick={() => onSendEmoji(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>

      <form className="vs-chat-input-row" onSubmit={handleSubmit}>
        <input
          type="text"
          className="vs-chat-input"
          placeholder="Send a short message or emoji to your opponent…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
        <button type="submit" className="btn vs-chat-send">
          Send
        </button>
      </form>
    </section>
  );
};
