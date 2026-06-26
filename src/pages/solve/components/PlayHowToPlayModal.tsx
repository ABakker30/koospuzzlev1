import React, { useState } from 'react';
import { ModalBase } from '../../../components/ModalBase';

interface PlayHowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PlayHowToPlayModal: React.FC<PlayHowToPlayModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      {/* Game Overview Modal */}
      <ModalBase
        isOpen={isOpen && !showDetails}
        onClose={onClose}
        title="How to Play"
        maxWidth={560}
        gradient="accent"
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
      </ModalBase>

      {/* Gameplay Details Modal */}
      <ModalBase
        isOpen={isOpen && showDetails}
        onClose={() => {
          setShowDetails(false);
          onClose();
        }}
        title="Gameplay Details"
        maxWidth={560}
        gradient="accent"
      >
        <div style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#fff' }}>
          <button
            onClick={() => setShowDetails(false)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '20px',
              color: 'rgba(255, 255, 255, 0.8)',
              padding: '4px',
              lineHeight: 1,
              marginBottom: '0.5rem',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
            }}
          >
            ←
          </button>

          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
              🎯 How to Place a Piece
            </h3>
            <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
              On your turn, double-click on empty cells to draw a piece shape (up to 4 connected cells). The system identifies the matching piece and places it automatically.
            </p>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
              ✅ Valid vs ❌ Invalid Moves
            </h3>
            <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
              <strong>Valid move:</strong> The piece stays and you earn <strong>+1 point</strong>.
            </p>
            <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
              <strong>Invalid move:</strong> If your placement makes the puzzle unsolvable, the piece fades out, you earn <strong>0 points</strong>, and the turn passes.
            </p>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
              💡 Hints
            </h3>
            <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
              Stuck? Use the hint button to reveal a valid piece placement. But be careful — using a hint costs you the turn! The hint is shown, but the <strong>computer gets to play next</strong>.
            </p>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
              📊 Scoring
            </h3>
            <p style={{ margin: '0 0 0.25rem 0', opacity: 0.95 }}>
              • <strong>+1 point</strong> for each valid piece placement
            </p>
            <p style={{ margin: '0 0 0.25rem 0', opacity: 0.95 }}>
              • <strong>0 points</strong> for invalid moves (piece removed)
            </p>
            <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
              • <strong>0 points</strong> when using a hint (turn passes to computer)
            </p>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
              🔊 Sound Effects
            </h3>
            <p style={{ margin: '0 0 0.5rem 0', opacity: 0.95 }}>
              Listen for audio cues: sounds play when pieces are placed, and distinct sounds indicate valid moves, invalid moves, and game completion.
            </p>
          </div>
        </div>
      </ModalBase>
    </>
  );
};
