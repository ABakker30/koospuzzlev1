import React, { useState, FormEvent, useRef, useEffect } from 'react';
import { useGameChat } from '../pages/solve/hooks/useGameChat';
import type { GameChatMessage } from '../pages/solve/hooks/useGameChat';
import { FLAGS } from '../config/flags';
import { runKoosProbes } from '../ai/probes/runKoosProbes';
import { exportProbeRunJson, loadProbeRuns } from '../ai/probes/probeRecorder';
import '../styles/manualGame.css';

interface HomeAIChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUserMessage?: string;
  autoSend?: boolean;
}

const QUICK_EMOJIS = ['😀', '😅', '🎉', '🤔', '😈'];

export const HomeAIChatModal: React.FC<HomeAIChatModalProps> = ({
  isOpen,
  onClose,
  initialUserMessage,
  autoSend = false,
}) => {
  const [draft, setDraft] = useState('');
  const chatBodyRef = useRef<HTMLDivElement>(null);
  
  // Dev-only: AI Probe Mode state
  const [probeRunning, setProbeRunning] = useState(false);
  const [probeProgress, setProbeProgress] = useState<{ i: number; total: number } | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  
  // Use story-aware chat mode with Koos Puzzle context
  const { messages, isSending, sendUserMessage, sendEmoji } = useGameChat({
    mode: 'general',
    includeStoryContext: true,
    initialMessage: "Hello! I'm here to chat about the Koos Puzzle, its history, mathematics, and philosophy. What would you like to explore? 🧩"
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  // Handle initial message and auto-send
  useEffect(() => {
    if (isOpen && initialUserMessage && autoSend) {
      // Small delay to ensure modal is fully rendered
      const timer = setTimeout(() => {
        sendUserMessage(initialUserMessage);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialUserMessage, autoSend, sendUserMessage]);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, onClose]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    sendUserMessage(draft);
    setDraft('');
  };

  // Dev-only: Run probes handler
  const handleRunProbes = async () => {
    setProbeRunning(true);
    setProbeProgress({ i: 0, total: 0 });

    try {
      const run = await runKoosProbes(import.meta.env.VITE_APP_VERSION, (i, total) => {
        setProbeProgress({ i, total });
      });

      setLastRunId(run.run_id);
      alert(`Probe run complete! ${run.items.length} probes executed. Click Export JSON to download results.`);
    } catch (error) {
      console.error('Probe run error:', error);
      alert(`Probe run failed: ${error}`);
    } finally {
      setProbeRunning(false);
      setProbeProgress(null);
    }
  };

  // Dev-only: Export last run handler
  const handleExportLast = () => {
    const runs = loadProbeRuns();
    const run = runs.find(r => r.run_id === lastRunId) ?? runs[0];
    if (run) {
      exportProbeRunJson(run);
    } else {
      alert('No probe runs found. Run probes first.');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translate(-50%, -45%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Modal Container */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '20px',
            padding: '0',
            width: '90%',
            maxWidth: '560px',
            maxHeight: '90vh',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            animation: 'modalSlideIn 0.3s ease-out',
            zIndex: 10001,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '16px 20px',
              borderRadius: '18px 18px 0 0',
              position: 'relative',
              flexShrink: 0,
            }}
          >
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '24px',
                color: 'rgba(255, 255, 255, 0.8)',
                padding: '4px',
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
              }}
            >
              ✕
            </button>

            <h2
              style={{
                color: '#fff',
                fontSize: '1.25rem',
                fontWeight: 700,
                margin: '0 0 4px 0',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              AI Chat
            </h2>
            <p
              style={{
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: '0.8rem',
                margin: 0,
              }}
            >
              Ask about puzzles, symmetry, mathematics, or philosophy
            </p>
          </div>

          {/* Chat Body - Reusing existing chat styles */}
          <div
            style={{
              flex: 1,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(15, 23, 42, 0.95)',
              padding: '16px',
            }}
          >
            {/* Messages */}
            <div
              className="vs-chat-body"
              ref={chatBodyRef}
              style={{
                flex: 1,
                maxHeight: 'none',
              }}
            >
              {messages.length === 0 ? (
                <div className="vs-chat-empty">
                  No messages yet. Ask a question! 👋
                </div>
              ) : (
                messages.map((msg: GameChatMessage) => (
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
              {isSending && (
                <div className="vs-chat-message vs-chat-message-ai">
                  <div className="vs-chat-bubble" style={{ opacity: 0.7 }}>
                    Thinking<span className="vs-chat-dot">…</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Emojis */}
            <div className="vs-chat-quick">
              {QUICK_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  className="vs-chat-emoji"
                  onClick={() => sendEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Dev-only: Probe Mode Controls */}
            {FLAGS.AI_PROBE_MODE && (
              <div
                style={{
                  marginTop: '12px',
                  marginBottom: '8px',
                  padding: '8px',
                  background: 'rgba(255, 165, 0, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 165, 0, 0.3)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.7rem',
                    color: 'rgba(255, 165, 0, 0.9)',
                    fontWeight: 600,
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  🔬 Dev Mode: Story Context Probe
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    disabled={probeRunning}
                    onClick={handleRunProbes}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: probeRunning ? 'rgba(148, 163, 184, 0.5)' : 'rgba(59, 130, 246, 0.9)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: probeRunning ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (!probeRunning) {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!probeRunning) {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.9)';
                      }
                    }}
                  >
                    {probeRunning ? 'Running...' : 'Run Probes'}
                  </button>
                  <button
                    type="button"
                    disabled={probeRunning}
                    onClick={handleExportLast}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: probeRunning ? 'rgba(148, 163, 184, 0.5)' : 'rgba(34, 197, 94, 0.9)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: probeRunning ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (!probeRunning) {
                        e.currentTarget.style.background = 'rgba(34, 197, 94, 1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!probeRunning) {
                        e.currentTarget.style.background = 'rgba(34, 197, 94, 0.9)';
                      }
                    }}
                  >
                    Export JSON
                  </button>
                  {probeProgress && (
                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontWeight: 600,
                      }}
                    >
                      {probeProgress.i}/{probeProgress.total}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Input */}
            <form className="vs-chat-input-row" onSubmit={handleSubmit}>
              <input
                type="text"
                className="vs-chat-input"
                placeholder="Ask a question…"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e as any);
                  }
                }}
              />
              <button 
                type="submit" 
                className="btn vs-chat-send"
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  color: '#fff',
                  fontWeight: 600,
                  padding: '0.4rem 1rem',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};
