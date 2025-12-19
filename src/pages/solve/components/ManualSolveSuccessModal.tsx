import React from 'react';

type ManualSolveSuccessModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onViewLeaderboard?: () => void;
  solveStartTime: number | null;
  solveEndTime: number | null;
  moveCount: number;
  pieceCount: number;
  ratedScore?: number;
  isRated?: boolean;
};

export const ManualSolveSuccessModal: React.FC<ManualSolveSuccessModalProps> = ({
  isOpen,
  onClose,
  onViewLeaderboard,
  solveStartTime,
  solveEndTime,
  moveCount,
  pieceCount,
  ratedScore,
  isRated = false,
}) => {
  if (!isOpen) return null;

  const solveSeconds =
    solveStartTime && solveEndTime
      ? Math.floor((solveEndTime - solveStartTime) / 1000)
      : null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'linear-gradient(135deg, #1e88e5, #42a5f5)',
        color: 'white',
        padding: '32px 40px',
        borderRadius: '16px',
        fontSize: '20px',
        fontWeight: 'bold',
        textAlign: 'center',
        boxShadow: '0 12px 40px rgba(30, 136, 229, 0.5)',
        zIndex: 1001,
        maxWidth: '400px',
        minWidth: '320px',
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          background: 'transparent',
          border: 'none',
          color: 'white',
          fontSize: '28px',
          cursor: 'pointer',
          padding: '4px 8px',
          lineHeight: '1',
          opacity: 0.8,
          fontWeight: 'normal',
        }}
        title="Close"
      >
        ×
      </button>

      <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
      <div
        style={{
          fontSize: '32px',
          fontWeight: 700,
          marginBottom: '8px',
          color: '#ffffff',
        }}
      >
        Congratulations!
      </div>
      <div
        style={{
          fontSize: '18px',
          fontWeight: 600,
          marginBottom: '24px',
          opacity: 0.95,
        }}
      >
        Puzzle Solved!
      </div>

      <div
        style={{
          fontSize: '15px',
          fontWeight: 'normal',
          lineHeight: '1.8',
          textAlign: 'left',
          background: 'rgba(0,0,0,0.2)',
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '20px',
          color: '#ffffff',
        }}
      >
        <div
          style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 600 }}
        >
          ✨ Puzzle Complete!
        </div>
        
        {isRated && ratedScore !== undefined && (
          <div
            style={{
              marginBottom: '16px',
              paddingBottom: '16px',
              borderBottom: '1px solid rgba(255,255,255,0.3)',
              fontSize: '20px',
              fontWeight: 700,
            }}
          >
            <strong>🏆 Final Score:</strong>{' '}
            <span
              style={{
                color: '#10b981',
                textShadow: '0 0 10px rgba(16, 185, 129, 0.5)',
              }}
            >
              {ratedScore}
            </span>
          </div>
        )}
        
        <div>
          <strong>📅 Date:</strong> {new Date().toLocaleDateString()}
        </div>
        <div>
          <strong>⏱️ Solve Time:</strong>{' '}
          {solveSeconds !== null ? `${solveSeconds}s` : 'N/A'}
        </div>
        <div>
          <strong>🔢 Moves:</strong> {moveCount}
        </div>
        <div
          style={{
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(255,255,255,0.3)',
          }}
        >
          <strong>🧩 Pieces:</strong> {pieceCount}
        </div>
      </div>

      <div
        style={{
          fontSize: '14px',
          fontWeight: 'normal',
          opacity: 0.9,
          padding: '12px',
          background: 'rgba(0,0,0,0.15)',
          borderRadius: '8px',
        }}
      >
        ✅ Your solution has been automatically saved!
      </div>
    </div>
  );
};
