import React from 'react';
import { InfoModal } from '../../../components/InfoModal';

interface ManualGameHowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ManualGameHowToPlayModal: React.FC<ManualGameHowToPlayModalProps> = ({
  isOpen,
  onClose,
}) => {
  return (
    <InfoModal
      isOpen={isOpen}
      onClose={onClose}
      title="How to Play"
    >
      <div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
        <p style={{ marginTop: 0 }}>
          Compete against the computer in turn-based puzzle assembly. Take turns placing pieces and try to outscore your opponent.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>Turns</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          You and the computer take turns placing one piece at a time.
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          A piece is shown on the board immediately, then the system checks if the puzzle is still solvable.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>Valid vs Invalid Moves</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          <strong>Valid move:</strong> The piece stays, and you earn +1 point.
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          <strong>Invalid move:</strong> If the placement makes the puzzle unsolvable, the piece is removed with a short fade-out, you earn 0 points, and the turn passes.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>How to Place a Piece</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          On your turn, draw up to 4 connected empty cells to form a piece shape. The system identifies the matching piece and places it.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>Winning</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          The game ends only when the board is completely filled. The player with the higher score wins.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>Solvability Indicator</strong> <span style={{ fontSize: '1.2rem' }}>●</span></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          <strong style={{ color: '#16a34a' }}>Green:</strong> Puzzle is solvable
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          <strong style={{ color: '#ea580c' }}>Orange:</strong> Solvability unknown (still allowed)
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          <strong style={{ color: '#dc2626' }}>Red:</strong> This move is rejected and will be undone
        </p>
      </div>
    </InfoModal>
  );
};
