import React from 'react';
import type { PuzzleSolutionRecord } from '../../api/solutions';

interface SolutionInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  solution: PuzzleSolutionRecord;
  puzzleStats?: {
    cellCount: number;
    createdAt: string;
    creatorName: string;
    totalSolutions: number;
    autoSolveCount: number;
    manualSolveCount: number;
    gamesPlayed: number;
  };
}

export const SolutionInfoModal: React.FC<SolutionInfoModalProps> = ({
  isOpen,
  onClose,
  solution,
  puzzleStats,
}) => {
  if (!isOpen) return null;

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <>
      <style>{`
        @keyframes modalFadeIn {
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
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '24px',
            padding: '0',
            width: '90%',
            maxWidth: '480px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '3px solid rgba(255, 255, 255, 0.2)',
            animation: 'modalFadeIn 0.3s ease-out',
            zIndex: 10001,
          }}
        >
          {/* Compact Header */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '16px 20px 12px',
              borderRadius: '21px 21px 0 0',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '2rem' }}>🏆</div>
            <div style={{ flex: 1 }}>
              <h2
                style={{
                  color: '#fff',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  margin: 0,
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                }}
              >
                Solution Info
              </h2>
              {solution.puzzle_name && (
                <p
                  style={{
                    color: 'rgba(255, 255, 255, 0.75)',
                    fontSize: '0.8rem',
                    margin: '2px 0 0 0',
                  }}
                >
                  {solution.puzzle_name}
                </p>
              )}
            </div>
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
          </div>

          {/* Content */}
          <div
            style={{
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {/* Solution Type Badge */}
            <div
              style={{
                background: solution.is_auto_solved 
                  ? 'rgba(139, 92, 246, 0.3)'
                  : 'rgba(76, 175, 80, 0.3)',
                border: solution.is_auto_solved
                  ? '2px solid rgba(139, 92, 246, 0.6)'
                  : '2px solid rgba(76, 175, 80, 0.6)',
                borderRadius: '10px',
                padding: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>
                {solution.is_auto_solved ? '🤖' : '🧩'}
              </span>
              <span
                style={{
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                Solved by {solution.solver_name?.split('@')[0] || solution.solver_name}
              </span>
            </div>

            {/* Stats Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
              }}
            >
              {/* Date & Time Combined */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '10px',
                }}
              >
                <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>📅</div>
                <div
                  style={{
                    color: '#fff',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    lineHeight: '1.3',
                  }}
                >
                  {formatDateTime(solution.created_at)}
                </div>
              </div>

              {/* Solve Time */}
              {solution.time_to_solve_sec !== undefined && (
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.12)',
                    borderRadius: '10px',
                    padding: '10px',
                  }}
                >
                  <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>⏱️</div>
                  <div
                    style={{
                      color: '#fff',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    {formatDuration(solution.time_to_solve_sec)}
                  </div>
                  <div
                    style={{
                      color: 'rgba(255, 255, 255, 0.7)',
                      fontSize: '0.65rem',
                    }}
                  >
                    Solve Time
                  </div>
                </div>
              )}

              {/* Puzzle Stats if available */}
              {puzzleStats && (
                <>
                  {/* Cell Count */}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.12)',
                      borderRadius: '10px',
                      padding: '10px',
                    }}
                  >
                    <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>🧊</div>
                    <div
                      style={{
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                      }}
                    >
                      {puzzleStats.cellCount}
                    </div>
                    <div
                      style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.65rem',
                      }}
                    >
                      Cells
                    </div>
                  </div>

                  {/* Total Solutions */}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.12)',
                      borderRadius: '10px',
                      padding: '10px',
                    }}
                  >
                    <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>🎯</div>
                    <div
                      style={{
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                      }}
                    >
                      {puzzleStats.totalSolutions}
                    </div>
                    <div
                      style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.65rem',
                      }}
                    >
                      Solutions
                    </div>
                  </div>

                  {/* Auto-Solve Count */}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.12)',
                      borderRadius: '10px',
                      padding: '10px',
                    }}
                  >
                    <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>🤖</div>
                    <div
                      style={{
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                      }}
                    >
                      {puzzleStats.autoSolveCount}
                    </div>
                    <div
                      style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.65rem',
                      }}
                    >
                      Auto-Solved
                    </div>
                  </div>

                  {/* Manual Count */}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.12)',
                      borderRadius: '10px',
                      padding: '10px',
                    }}
                  >
                    <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>🧩</div>
                    <div
                      style={{
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                      }}
                    >
                      {puzzleStats.manualSolveCount}
                    </div>
                    <div
                      style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.65rem',
                      }}
                    >
                      Manual
                    </div>
                  </div>

                  {/* Games Played */}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.12)',
                      borderRadius: '10px',
                      padding: '10px',
                    }}
                  >
                    <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>🎮</div>
                    <div
                      style={{
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                      }}
                    >
                      {puzzleStats.gamesPlayed}
                    </div>
                    <div
                      style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.65rem',
                      }}
                    >
                      Games
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Puzzle Shape Credits */}
            {puzzleStats && (
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  padding: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  fontSize: '0.75rem',
                  color: 'rgba(255, 255, 255, 0.8)',
                  textAlign: 'center',
                  lineHeight: '1.5',
                }}
              >
                <div style={{ marginBottom: '4px', opacity: 0.7 }}>
                  Puzzle Shape Credits
                </div>
                <div>
                  <strong>{puzzleStats.creatorName}</strong>
                </div>
                <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                  {formatDateTime(puzzleStats.createdAt)}
                </div>
              </div>
            )}

            {/* Tip */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '10px',
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.8)',
                lineHeight: '1.4',
                display: 'flex',
                gap: '8px',
              }}
            >
              <span>💡</span>
              <span>Use explosion slider and reveal arrows to study the assembly</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
