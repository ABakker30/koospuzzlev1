// AI Chat Modal - Interactive AI assistant for help and guidance
import { useState } from 'react';
import { aiClient, hToMsgs } from '../services/aiClient';
import { useDraggable } from '../hooks/useDraggable';

interface AIChatModalProps {
  onClose: () => void;
  screen?: string;
  topic?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const STARTER_SUGGESTIONS = [
  "What am I looking at?",
  "How does symmetry affect this shape?",
  "Why won't this piece fit?"
];

export const AIChatModal: React.FC<AIChatModalProps> = ({ onClose }) => {
  const draggable = useDraggable();
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const send = async (message?: string) => {
    const msgToSend = message || input.trim();
    if (!msgToSend) return;

    setLoading(true);
    const userMsg: Message = { role: 'user', content: msgToSend };
    setHistory(h => [...h, userMsg]);
    setInput('');

    try {
      const systemMsg = { role: 'system' as const, content: 'You are a helpful assistant for the KOOS Puzzle app. Be concise and friendly. Help users understand 3D puzzles, piece placement, symmetry, and puzzle-solving strategies.' };
      const reply = await aiClient.chat([systemMsg, ...hToMsgs([...history, userMsg])]);
      setHistory(h => [...h, { role: 'assistant', content: reply }]);
    } catch (error) {
      console.error('Chat error:', error);
      setHistory(h => [...h, { role: 'assistant', content: "I encountered an error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div
      ref={draggable.ref}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        ...draggable.style,
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        border: '1px solid #d1d5db',
        zIndex: 10000,
        width: '90%',
        maxWidth: '500px',
        maxHeight: '600px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          ...draggable.headerStyle,
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f9fafb',
          borderTopLeftRadius: '8px',
          borderTopRightRadius: '8px',
          userSelect: 'none',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>🤖</span> AI Guide
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            color: '#6b7280',
            padding: '0',
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>

      {/* Chat messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          backgroundColor: '#f9fafb',
        }}
      >
        {history.length === 0 && (
          <>
            <div style={{ 
              textAlign: 'center', 
              color: '#6b7280', 
              padding: '2rem 1rem',
              fontSize: '0.95rem'
            }}>
              👋 Hi! I'm your AI guide. Ask me anything about KOOS Puzzle!
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {STARTER_SUGGESTIONS.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => send(suggestion)}
                  disabled={loading}
                  style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    color: '#374151',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                    e.currentTarget.style.borderColor = '#d1d5db';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </>
        )}

        {history.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                backgroundColor: msg.role === 'user' ? '#2563eb' : '#ffffff',
                color: msg.role === 'user' ? '#ffffff' : '#1f2937',
                border: msg.role === 'assistant' ? '1px solid #e5e7eb' : 'none',
                fontSize: '0.95rem',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                color: '#6b7280',
                fontSize: '0.95rem',
              }}
            >
              <span style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>●</span>
              <span style={{ animation: 'pulse 1.5s ease-in-out 0.2s infinite' }}>●</span>
              <span style={{ animation: 'pulse 1.5s ease-in-out 0.4s infinite' }}>●</span>
            </div>
          </div>
        )}
      </div>

      {/* Input composer */}
      <div
        style={{
          borderTop: '1px solid #e5e7eb',
          padding: '1rem',
          backgroundColor: '#ffffff',
          borderBottomLeftRadius: '8px',
          borderBottomRightRadius: '8px',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about what you're viewing…"
            disabled={loading}
            style={{
              flex: 1,
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.95rem',
              outline: 'none',
            }}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: loading || !input.trim() ? '#d1d5db' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
            }}
          >
            {loading ? '...' : 'Send'}
          </button>
        </div>
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};
