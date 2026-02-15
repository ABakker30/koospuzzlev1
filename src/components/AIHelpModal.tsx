import React, { useState, useEffect } from 'react';
import { aiHelpTelemetry } from '../services/telemetry';
import { aiClient } from '../services/aiClient';
import { runPublicationsProbes } from '../ai/probes/runPublicationsProbes';
import { exportProbeRunJson, loadProbeRuns } from '../ai/probes/probeRecorder';

interface AIHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  context?: any;
}

// Response data structure
const responses = {
  what_is_the_koos_puzzle: {
    answer: "The Koos Puzzle is a three-dimensional lattice puzzle made from 25 interlocking pieces, each built from four connected spheres. It's based on atomic-style geometry where every piece fits into a precise grid of positions. You can explore small puzzles that take minutes or vast structures that challenge even computers.",
    followups: ['who_designed', 'how_to_start_simple']
  },
  why_atoms: {
    answer: "The puzzle's geometry comes from atomic lattices—the same kind of regular arrangements found in crystals and metals. Each sphere marks a potential atomic position in a repeating 3D grid. Building with these pieces is like exploring how nature packs space efficiently.",
    followups: ['what_is_lattice_simple', 'same_as_crystals']
  },
  complexity: {
    answer: "With 25 pieces and many possible orientations, the number of ways they could combine reaches roughly 10^80. That's about the number of atoms in the observable universe. You can start small or explore shapes so large that no complete solution is known.",
    followups: ['make_it_easier', 'what_makes_harder']
  },
  ten_to_80: {
    answer: "10^80 means a 1 followed by eighty zeros—an unimaginably large number. It reflects how the search space explodes when you rotate and rearrange all 25 pieces. Even the fastest computers can't exhaustively explore it.",
    followups: ['why_grows_fast', 'explore_without_solving']
  },
  math: {
    answer: "Yes. The Koos Puzzle connects to ideas in geometry, combinatorics, and spatial reasoning. These ideas describe how shapes fit together in three-dimensional space. You don't need math knowledge to enjoy it—curiosity is enough.",
    followups: ['simple_math_example', 'why_four_sphere_pieces']
  }
};

const suggestedQuestions = [
  { text: 'What is the Koos Puzzle?', route: 'what_is_the_koos_puzzle' },
  { text: 'Why does it look like atoms?', route: 'why_atoms' },
  { text: 'How complex can it get?', route: 'complexity' },
  { text: 'Explain 10^80 simply.', route: 'ten_to_80' },
  { text: 'Is there math behind it?', route: 'math' }
];

interface AIResponse {
  answer: string;
  followups: string[];
  intent: string;
}

export const AIHelpModal: React.FC<AIHelpModalProps> = ({ isOpen, onClose }) => {
  const [currentAnswer, setCurrentAnswer] = useState<string | null>(null);
  const [currentFollowups, setCurrentFollowups] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Dev-only: Publications Probe Mode state
  const [probeRunning, setProbeRunning] = useState(false);
  const [probeProgress, setProbeProgress] = useState<{ i: number; total: number } | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);

  // Track modal open and reset state
  useEffect(() => {
    if (isOpen) {
      aiHelpTelemetry.opened('info_modal');
      // Reset state when modal opens
      setCurrentAnswer(null);
      setCurrentFollowups([]);
      setErrorMessage(null);
      setInputValue('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSuggestedQuestion = async (route: string) => {
    const question = suggestedQuestions.find(q => q.route === route)?.text;
    if (question) {
      aiHelpTelemetry.questionSuggestedClicked(route);
      await askAI(question);
    }
  };

  const askAI = async (question: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setInputValue('');

    try {
      // Option B: Strict JSON schema system prompt
      const systemPrompt = [
        "You are the Koos Puzzle AI Help.",
        "",
        "CRITICAL: You MUST respond with ONLY valid JSON in this EXACT format:",
        "{",
        '  "answer": "your answer text here (1-3 short paragraphs)",',
        '  "followups": ["follow-up question 1", "follow-up question 2"],',
        '  "intent": "learn_overview"',
        "}",
        "",
        "Intent must be one of: learn_overview, learn_lattice, learn_complexity, learn_combinatorics, math_help, other",
        "",
        "Scope: overview, atomic/lattice geometry (FCC-style), combinatorics (~10^80 scale), general math ideas.",
        "Guardrails: text-only; no images, app control, or unimplemented features; do NOT claim symmetry is used for solving.",
        "Style: friendly, clear, curiosity-first; 1–3 short paragraphs.",
        "",
        "GROUNDING FACTS:",
        "- 25 pieces total; each piece has 4 connected spheres",
        "- FCC-style lattice grid (atomic-like packing)",
        "- Pieces have orientation families that affect placement",
        "- Search space can approach ~10^80 arrangements",
        "",
        "KNOWLEDGE BASE:",
        `Overview: ${responses.what_is_the_koos_puzzle.answer}`,
        `Lattice: ${responses.why_atoms.answer}`,
        `Complexity: ${responses.complexity.answer}`,
        `10^80: ${responses.ten_to_80.answer}`,
        `Math: ${responses.math.answer}`
      ].join('\n');

      const reply = await aiClient.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `USER_QUESTION: ${question}` }
        ],
        {
          screen: { name: 'ai_help_modal' },
          telemetry: { ai_help_question: question },
          response_format: { type: 'json_object' } // Request JSON response
        }
      );

      // Parse JSON response
      console.log('[AIHelp] Raw reply:', reply);
      try {
        const parsed: AIResponse = JSON.parse(reply);
        console.log('[AIHelp] Parsed response:', parsed);
        console.log('[AIHelp] Setting answer:', parsed.answer);
        console.log('[AIHelp] Setting followups:', parsed.followups);
        setCurrentAnswer(parsed.answer);
        setCurrentFollowups(parsed.followups || []);
        aiHelpTelemetry.answerShown(parsed.intent || 'openai_response');
        console.log('[AIHelp] State updated, answer should display');
      } catch (parseError) {
        console.error('[AIHelp] JSON parse error:', parseError);
        console.error('[AIHelp] Failed to parse:', reply);
        // Fallback
        setCurrentAnswer("I didn't catch that. Ask about the Koos Puzzle overview, atomic geometry, complexity, 10^80, or the ideas behind it.");
        setCurrentFollowups(["What is the Koos Puzzle?", "Why does it look like atoms?"]);
      }
    } catch (error) {
      console.error('[AIHelp] OpenAI error:', error);
      setErrorMessage('Sorry, I encountered an error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAsk = async () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || isLoading) return;
    await askAI(trimmedInput);
  };

  const handleBack = () => {
    setCurrentAnswer(null);
    setCurrentFollowups([]);
    setErrorMessage(null);
  };

  const handleFollowup = async (followup: string) => {
    await askAI(followup);
  };

  // Dev-only: Run publications probes handler
  const handleRunProbes = async () => {
    setProbeRunning(true);
    setProbeProgress({ i: 0, total: 0 });

    try {
      const run = await runPublicationsProbes(import.meta.env.VITE_APP_VERSION, (i, total) => {
        setProbeProgress({ i, total });
      });

      setLastRunId(run.run_id);
      alert(`Publications probe run complete! ${run.items.length} probes executed. Click Export JSON to download results.`);
    } catch (error) {
      console.error('Publications probe run error:', error);
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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '1rem'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: '#333' }}>
            Ask about the Koos Puzzle
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#666',
              padding: '0.25rem',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem'
        }}>
          {isLoading && !currentAnswer && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#667eea' }}>
              <div style={{ marginBottom: '1rem', fontSize: '2rem' }}>🤔</div>
              <p>Thinking...</p>
            </div>
          )}
          
          {!currentAnswer && !isLoading ? (
            <>
              <p style={{ color: '#666', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                Curious about how it works? Ask about its origins, atomic geometry, the scale of possibilities, or the ideas behind it.
              </p>

              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#333' }}>
                  Suggested Questions
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {suggestedQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSuggestedQuestion(q.route)}
                      disabled={isLoading}
                      style={{
                        padding: '0.75rem 1rem',
                        background: isLoading ? '#e5e7eb' : '#f3f4f6',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        textAlign: 'left',
                        fontSize: '0.95rem',
                        color: '#374151',
                        transition: 'all 0.2s',
                        opacity: isLoading ? 0.6 : 1
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#e5e7eb';
                        e.currentTarget.style.borderColor = '#d1d5db';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#f3f4f6';
                        e.currentTarget.style.borderColor = '#e5e7eb';
                      }}
                    >
                      {q.text}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ask your own */}
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#333' }}>
                  Or ask your own
                </h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    onKeyPress={(e) => e.key === 'Enter' && handleAsk()}
                    placeholder="Ask me anything about the puzzle…"
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '0.95rem'
                    }}
                  />
                  <button
                    onClick={handleAsk}
                    disabled={isLoading || !inputValue.trim()}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: (isLoading || !inputValue.trim()) 
                        ? '#d1d5db' 
                        : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: (isLoading || !inputValue.trim()) ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      opacity: (isLoading || !inputValue.trim()) ? 0.6 : 1
                    }}
                  >
                    {isLoading ? 'Thinking...' : 'Ask'}
                  </button>
                </div>
                
                {/* Error message */}
                {errorMessage && (
                  <div style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem 1rem',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    color: '#991b1b',
                    fontSize: '0.875rem',
                    lineHeight: '1.5'
                  }}>
                    {errorMessage}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div>
              <button
                onClick={handleBack}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#667eea',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  marginBottom: '1rem',
                  padding: '0.25rem 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
              >
                ←
              </button>

              <div style={{
                padding: '1rem',
                background: '#f9fafb',
                borderRadius: '8px',
                marginBottom: '1rem',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word'
              }}>
                <p style={{ color: '#374151', lineHeight: '1.7', margin: 0 }}>
                  {currentAnswer}
                </p>
              </div>

              {currentFollowups.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>
                    Follow-up questions:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {currentFollowups.map((followup, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleFollowup(followup)}
                        disabled={isLoading}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#fff',
                          border: '1px solid #d1d5db',
                          borderRadius: '20px',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          fontSize: '0.875rem',
                          color: '#667eea',
                          transition: 'all 0.2s',
                          opacity: isLoading ? 0.6 : 1
                        }}
                        onMouseEnter={(e) => {
                          if (!isLoading) e.currentTarget.style.background = '#f3f4f6';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#fff';
                        }}
                      >
                        {followup}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dev-only: Probe Controls */}
        {import.meta.env.DEV && (
          <div style={{
            marginTop: '1.5rem',
            paddingTop: '1.5rem',
            borderTop: '2px solid #e5e7eb',
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center'
          }}>
            <button
              onClick={handleRunProbes}
              disabled={probeRunning || isLoading}
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
                background: probeRunning ? 'rgba(59, 130, 246, 0.5)' : 'rgba(59, 130, 246, 0.9)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.875rem',
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
              {probeRunning ? ' Running Probes...' : ' Run Publications Probes'}
            </button>
            <button
              onClick={handleExportLast}
              disabled={probeRunning || !lastRunId}
              style={{
                padding: '0.75rem 1rem',
                background: (probeRunning || !lastRunId) ? 'rgba(34, 197, 94, 0.5)' : 'rgba(34, 197, 94, 0.9)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: (probeRunning || !lastRunId) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!probeRunning && lastRunId) {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!probeRunning && lastRunId) {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.9)';
                }
              }}
            >
              Export JSON
            </button>
            {probeProgress && (
              <div style={{
                fontSize: '0.75rem',
                color: '#666',
                fontWeight: 600,
                minWidth: '60px',
                textAlign: 'right'
              }}>
                {probeProgress.i}/{probeProgress.total}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
