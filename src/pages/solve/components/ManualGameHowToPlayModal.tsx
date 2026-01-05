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
          Compete against the computer in turn-based puzzle assembly. Take turns placing pieces and try to outscore your opponent!
        </p>

        <p style={{ marginTop: '1rem' }}><strong>🎯 How to Place a Piece</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          On your turn, double-click on empty cells to draw a piece shape (up to 4 connected cells). The system identifies the matching piece and places it automatically.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>🔄 Taking Turns</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          You and the computer alternate placing one piece at a time. After you place a piece, the system checks if the puzzle remains solvable.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>✅ Valid vs ❌ Invalid Moves</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          <strong>Valid move:</strong> The piece stays and you earn <strong>+1 point</strong>.
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          <strong>Invalid move:</strong> If your placement makes the puzzle unsolvable, the piece fades out, you earn <strong>0 points</strong>, and the turn passes.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>💡 Hints</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          Stuck? Use the hint button to reveal a valid piece placement. But be careful — using a hint costs you the turn! The hint is shown, but the <strong>computer gets to play next</strong>.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>📊 Scoring</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          • <strong>+1 point</strong> for each valid piece placement
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          • <strong>0 points</strong> for invalid moves (piece removed)
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          • <strong>0 points</strong> when using a hint (turn passes to computer)
        </p>

        <p style={{ marginTop: '1rem' }}><strong>🏆 Winning</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          The game ends when the puzzle is completely filled. The player with the higher score wins!
        </p>

        <p style={{ marginTop: '1rem' }}><strong>🔊 Sound Effects</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          Listen for audio cues: a satisfying sound when pieces are placed, and distinct sounds for valid moves, invalid moves, and game completion.
        </p>
      </div>
    </InfoModal>
  );
};
