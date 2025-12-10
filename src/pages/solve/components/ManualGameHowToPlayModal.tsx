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
        <p style={{ marginTop: 0 }}><strong>Placing a Piece</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – Valid placement: +1 point, turn ends.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>Using a Hint</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – Piece may be placed for you.
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – No points, and your turn ends.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>Removing a Piece</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – No points, turn ends.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>Checking Solvability</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          If the puzzle is <em>still solvable</em> → you were wrong; turn ends.
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          If the puzzle is <em>not solvable</em> → last piece is removed; you keep your turn.
        </p>
        <p style={{ marginTop: '0.5rem', marginLeft: '1rem', fontStyle: 'italic' }}>
          Solvability checks are a strategic risk: call it right, keep your turn; call it wrong, lose it.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>Goal:</strong> Highest score when the puzzle is completed.</p>
      </div>
    </InfoModal>
  );
};
