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
      title="How to play"
    >
      <div style={{ fontSize: '0.9rem', lineHeight: 1.45 }}>
        <p>Draw 4 connected empty cells to place one Koos piece.</p>
        <p>Your opponent will draw and place a piece after you.</p>
        <p>
          <strong>Hint</strong> will draw and place a good move for you.
        </p>
        <p>
          <strong>Solvable?</strong> checks if the position can still be
          finished.
        </p>
        <p>Gold pieces are yours. Silver pieces are your opponent&apos;s.</p>
        <p>When no more pieces fit, the game ends and the scores decide the winner.</p>
      </div>
    </InfoModal>
  );
};
