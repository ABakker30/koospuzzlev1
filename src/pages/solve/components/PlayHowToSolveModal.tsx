import React, { useState } from 'react';

interface PlayHowToSolveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDontShowAgain?: () => void;
}

export const PlayHowToSolveModal: React.FC<PlayHowToSolveModalProps> = ({
  isOpen,
  onClose,
  onDontShowAgain,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  
  const handleClose = () => {
    if (dontShowAgain && onDontShowAgain) {
      onDontShowAgain();
    } else {
      onClose();
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
        
        .solve-how-to-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        
        .solve-how-to-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
          borderRadius: 4px;
        }
        
        .solve-how-to-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(16, 185, 129, 0.5);
          borderRadius: 4px;
        }
        
        .solve-how-to-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(16, 185, 129, 0.7);
        }
      `}</style>

      {/* Solve Overview Modal */}
      {!showDetails && (
        <div
          onClick={handleClose}
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
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
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
                onClick={handleClose}
                style={{
                  position: 'absolute',
                  right: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '24px',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }}
              >
                ✕
              </button>
              <h2 style={{ 
                color: '#fff', 
                margin: 0, 
                fontSize: '28px',
                fontWeight: '700',
              }}>
                How to Solve
              </h2>
            </div>

            <div
              className="solve-how-to-scrollbar"
              style={{
                padding: '32px',
                background: 'rgba(255, 255, 255, 0.95)',
                color: '#1e293b',
                fontSize: '16px',
                lineHeight: '1.6',
                overflowY: 'auto',
                flex: 1,
                borderRadius: '0 0 18px 18px',
              }}
            >
              <p style={{ 
                marginTop: 0, 
                fontSize: '18px', 
                marginBottom: '24px',
                fontWeight: '600',
              }}>
                Complete the puzzle by yourself! Place all pieces to fill the entire board.
              </p>

              <h3 style={{ 
                fontSize: '20px', 
                fontWeight: '700', 
                marginTop: '24px', 
                marginBottom: '12px',
                color: '#059669',
              }}>
                Scoring
              </h3>
              
              <p style={{ marginBottom: '16px' }}>
                <strong>+1 point</strong> for each valid piece placement.
              </p>
              
              <p style={{ marginBottom: '16px' }}>
                <strong>No penalty</strong> for invalid moves — just try again!
              </p>

              <p style={{ marginBottom: '16px' }}>
                <strong>⚠️ Hints don't give points:</strong> Using a hint to place a piece will not increase your score.
              </p>

              <p style={{ marginBottom: '16px' }}>
                Your goal is to complete the puzzle with the highest possible score.
              </p>

              <h3 style={{ 
                fontSize: '20px', 
                fontWeight: '700', 
                marginTop: '24px', 
                marginBottom: '12px',
                color: '#059669',
              }}>
                Tools
              </h3>

              <p style={{ marginBottom: '16px' }}>
                <strong>💡 Hint:</strong> Get a suggested piece placement when you're stuck.
              </p>

              <p style={{ marginBottom: '16px' }}>
                <strong>👁️ Hide/Show:</strong> Toggle visibility of placed pieces to see the remaining space.
              </p>

              <p style={{ marginBottom: '16px' }}>
                <strong>🎮 New Game:</strong> Reset and start fresh anytime.
              </p>

              {/* Don't show again checkbox */}
              {onDontShowAgain && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginTop: '24px',
                    cursor: 'pointer',
                    color: '#4b5563',
                    fontSize: '0.95rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={dontShowAgain}
                    onChange={(e) => setDontShowAgain(e.target.checked)}
                    style={{
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer',
                      accentColor: '#10B981',
                    }}
                  />
                  Don't show this again
                </label>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Solve Details Modal */}
      {showDetails && (
        <div
          onClick={() => setShowDetails(false)}
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
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
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
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => setShowDetails(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '18px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }}
              >
                ←
              </button>
              <h2 style={{ 
                color: '#fff', 
                margin: 0, 
                fontSize: '24px',
                fontWeight: '700',
                flex: 1,
                textAlign: 'center',
              }}>
                Solve Details
              </h2>
              <button
                onClick={handleClose}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '24px',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                }}
              >
                ✕
              </button>
            </div>

            <div
              className="solve-how-to-scrollbar"
              style={{
                padding: '32px',
                background: 'rgba(255, 255, 255, 0.95)',
                color: '#1e293b',
                fontSize: '16px',
                lineHeight: '1.6',
                overflowY: 'auto',
                flex: 1,
                borderRadius: '0 0 18px 18px',
              }}
            >
              <h3 style={{ 
                fontSize: '20px', 
                fontWeight: '700', 
                marginTop: 0, 
                marginBottom: '12px',
                color: '#059669',
              }}>
                Valid Moves
              </h3>
              <p style={{ marginBottom: '16px' }}>
                A piece placement is <strong>valid</strong> if:
              </p>
              <ul style={{ marginBottom: '24px', paddingLeft: '24px' }}>
                <li style={{ marginBottom: '8px' }}>All spheres fit inside the container</li>
                <li style={{ marginBottom: '8px' }}>No overlapping with existing pieces</li>
                <li style={{ marginBottom: '8px' }}>The remaining puzzle is still solvable</li>
              </ul>

              <h3 style={{ 
                fontSize: '20px', 
                fontWeight: '700', 
                marginTop: '24px', 
                marginBottom: '12px',
                color: '#059669',
              }}>
                How to Place a Piece
              </h3>
              <p style={{ marginBottom: '16px' }}>
                <strong>Double-click</strong> on an empty cell to automatically place a piece that covers that cell.
              </p>
              <p style={{ marginBottom: '24px' }}>
                The system will choose an appropriate piece and orientation for you.
              </p>

              <h3 style={{ 
                fontSize: '20px', 
                fontWeight: '700', 
                marginTop: '24px', 
                marginBottom: '12px',
                color: '#059669',
              }}>
                Strategy Tips
              </h3>
              <ul style={{ marginBottom: '24px', paddingLeft: '24px' }}>
                <li style={{ marginBottom: '8px' }}>Start from corners and edges — they're easier to fill</li>
                <li style={{ marginBottom: '8px' }}>Use hints when you're genuinely stuck</li>
                <li style={{ marginBottom: '8px' }}>Hide placed pieces to better see remaining space</li>
                <li style={{ marginBottom: '8px' }}>Think ahead — every move affects future options</li>
              </ul>

              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '2px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '12px',
                padding: '16px',
                marginTop: '24px',
              }}>
                <p style={{ margin: 0, fontWeight: '600', color: '#059669' }}>
                  💡 <strong>Tip:</strong> Invalid moves don't count against your score — experiment freely!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
