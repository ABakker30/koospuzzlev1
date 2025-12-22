import React, { useState } from 'react';

interface PlayHowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PlayHowToPlayModal: React.FC<PlayHowToPlayModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [showDetails, setShowDetails] = useState(false);

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
        
        .play-how-to-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        
        .play-how-to-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
          borderRadius: 4px;
        }
        
        .play-how-to-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(219, 39, 119, 0.5);
          borderRadius: 4px;
        }
        
        .play-how-to-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(219, 39, 119, 0.7);
        }
      `}</style>

      {/* Game Overview Modal */}
      {!showDetails && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 10004,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
              borderRadius: '20px',
              padding: '0',
              width: '90%',
              maxWidth: '560px',
              maxHeight: '90vh',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              border: '2px solid rgba(255, 255, 255, 0.2)',
              animation: 'modalSlideIn 0.3s ease-out',
              zIndex: 10005,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                padding: '16px 20px',
                minHeight: '56px',
                borderRadius: '18px 18px 0 0',
                textAlign: 'center',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  margin: 0,
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                }}
              >
                How to Play
              </h2>
            </div>

            <div
              className="play-how-to-scrollbar"
              style={{
                padding: '20px',
                overflowY: 'auto',
                flex: 1,
              }}
            >
              <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#fff' }}>
                <p style={{ margin: '0 0 1rem 0', fontWeight: 600 }}>
                  Compete against the computer in turn-based puzzle assembly. Take turns placing pieces and try to outscore your opponent.
                </p>

                <div style={{ marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                    Turns
                  </h3>
                  <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                    You and the computer take turns placing one piece at a time.
                  </p>
                  <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                    A piece is shown on the board immediately, then the system checks if the puzzle is still solvable.
                  </p>
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                    Winning
                  </h3>
                  <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                    The game ends only when the board is completely filled. The player with the higher score wins.
                  </p>
                </div>

                {/* How to Play Button */}
                <button
                  onClick={() => setShowDetails(true)}
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: '2px solid rgba(255, 255, 255, 0.4)',
                    borderRadius: '12px',
                    color: '#fff',
                    cursor: 'pointer',
                    padding: '14px',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    marginTop: '1rem',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  📖 How to Play
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gameplay Details Modal */}
      {showDetails && (
        <div
          onClick={() => setShowDetails(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 10006,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
              borderRadius: '20px',
              padding: '0',
              width: '90%',
              maxWidth: '560px',
              maxHeight: '90vh',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              border: '2px solid rgba(255, 255, 255, 0.2)',
              animation: 'modalSlideIn 0.3s ease-out',
              zIndex: 10007,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                padding: '16px 20px',
                minHeight: '56px',
                borderRadius: '18px 18px 0 0',
                textAlign: 'center',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => setShowDetails(false)}
                style={{
                  position: 'absolute',
                  top: '16px',
                  left: '16px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '20px',
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
                ← Back
              </button>

              <button
                onClick={() => {
                  setShowDetails(false);
                  onClose();
                }}
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
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  margin: 0,
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                }}
              >
                Gameplay Details
              </h2>
            </div>

            <div
              className="play-how-to-scrollbar"
              style={{
                padding: '20px',
                overflowY: 'auto',
                flex: 1,
              }}
            >
              <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#fff' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                    Valid vs Invalid Moves
                  </h3>
                  <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                    <strong>Valid move:</strong> The piece stays, and you earn +1 point.
                  </p>
                  <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                    <strong>Invalid move:</strong> If the placement makes the puzzle unsolvable, the piece is removed with a short fade-out, you earn 0 points, and the turn passes.
                  </p>
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                    How to Place a Piece
                  </h3>
                  <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                    On your turn, draw up to 4 connected empty cells to form a piece shape. The system identifies the matching piece and places it.
                  </p>
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                    Solvability Indicator <span style={{ fontSize: '1.2rem' }}>●</span>
                  </h3>
                  <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                    <strong style={{ color: '#4ade80' }}>Green:</strong> Puzzle is solvable
                  </p>
                  <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                    <strong style={{ color: '#fb923c' }}>Orange:</strong> Solvability unknown (still allowed)
                  </p>
                  <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
                    <strong style={{ color: '#f87171' }}>Red:</strong> This move is rejected and will be undone
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
