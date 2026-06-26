import React from 'react';
import { ModalBase } from '../../../components/ModalBase';

interface InvalidMoveModalProps {
  isOpen: boolean;
  onClose: (dontShowAgain: boolean) => void;
}

export const InvalidMoveModal: React.FC<InvalidMoveModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [dontShowAgain, setDontShowAgain] = React.useState(false);

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={() => onClose(dontShowAgain)}
      gradient="warning"
      maxWidth={450}
      headerIcon="⚠️"
      title="Invalid Move!"
      dimBackdrop={false}
      dismissOnBackdrop={false}
      footer={
        <button
          onClick={() => onClose(dontShowAgain)}
          style={{
            width: '100%',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: '700',
            color: '#d97706',
            background: '#fff',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          Got it!
        </button>
      }
    >
      <div style={{ fontSize: '1.05rem', textAlign: 'center', lineHeight: '1.6', marginBottom: '1.5rem' }}>
        That move breaks the puzzle's solvability.
        <br />
        <span style={{ opacity: 0.9 }}>Piece will be removed. Turn passes on.</span>
      </div>
      {/* Don't show again checkbox */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          cursor: 'pointer',
          fontSize: '0.9rem',
          opacity: 0.9,
        }}
      >
        <input
          type="checkbox"
          checked={dontShowAgain}
          onChange={(e) => setDontShowAgain(e.target.checked)}
          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
        />
        Don't show this again
      </label>
    </ModalBase>
  );
};
