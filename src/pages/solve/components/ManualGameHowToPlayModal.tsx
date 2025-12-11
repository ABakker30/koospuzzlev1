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

        <p style={{ marginTop: '1rem' }}><strong>Using a Hint (💡 button)</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – Click the lightbulb button to get a hint.
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – Piece may be placed for you.
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – No points, and your turn ends.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>Hide/Show Placed Pieces (👁️/🙈 button)</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – Toggle visibility of already-placed pieces.
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – Useful for seeing the empty container structure.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>Removing a Piece</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – No points, turn ends.
        </p>

        <p style={{ marginTop: '1rem' }}><strong>Checking Solvability (? button)</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – Click the question mark button to verify if the puzzle can still be solved.
        </p>
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

        <hr style={{ margin: '1.5rem 0', border: 'none', borderTop: '1px solid rgba(59, 130, 246, 0.3)' }} />

        <p style={{ marginTop: '1rem' }}><strong>How to Place, Select, and Delete Pieces</strong></p>
        
        <p style={{ marginTop: '0.75rem', marginLeft: '0' }}><strong style={{ fontSize: '0.85rem' }}>Placing a Piece:</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          1. Click on an empty cell in the container to start drawing.
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          2. Continue clicking adjacent cells to define the shape.
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          3. The system will automatically match your drawn shape to a valid piece and place it.
        </p>

        <p style={{ marginTop: '0.75rem', marginLeft: '0' }}><strong style={{ fontSize: '0.85rem' }}>Selecting a Piece:</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – Single-click on any placed piece to select it.
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – Selected pieces are highlighted.
        </p>

        <p style={{ marginTop: '0.75rem', marginLeft: '0' }}><strong style={{ fontSize: '0.85rem' }}>Deleting a Piece:</strong></p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – Double-click on a placed piece to remove it.
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – Or: Select the piece (single-click), then click the delete/trash button.
        </p>
        <p style={{ marginTop: '0.25rem', marginLeft: '1rem' }}>
          – Remember: Deleting a piece uses your turn but gives no points.
        </p>
      </div>
    </InfoModal>
  );
};
