import React from 'react';
import { ModalBase } from '../../../components/ModalBase';

type PieceMode = 'unlimited' | 'unique' | 'identical';

interface ModeViolationModalProps {
  isOpen: boolean;
  onClose: (dontShowAgain: boolean) => void;
  mode: PieceMode;
  attemptedPieceId: string | null;
  requiredPieceId?: string | null; // For identical mode
}

const MODE_MESSAGES: Record<PieceMode, { title: string; message: string }> = {
  unique: {
    title: 'Piece Already Used!',
    message: 'In Unique mode, each piece can only be used once. This piece is already on the board.',
  },
  identical: {
    title: 'Wrong Piece Type!',
    message: 'In Identical mode, all pieces must be the same type as the first piece placed.',
  },
  unlimited: {
    title: 'Invalid Piece',
    message: 'This piece cannot be placed here.',
  },
};

export const ModeViolationModal: React.FC<ModeViolationModalProps> = ({
  isOpen,
  onClose,
  mode,
  attemptedPieceId,
  requiredPieceId,
}) => {
  const [dontShowAgain, setDontShowAgain] = React.useState(false);

  const { title, message } = MODE_MESSAGES[mode];

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={() => onClose(dontShowAgain)}
      gradient="danger"
      maxWidth={450}
      headerIcon="🚫"
      title={title}
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
            color: '#dc2626',
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
      <div style={{ fontSize: '1.05rem', textAlign: 'center', lineHeight: '1.6', marginBottom: '1rem' }}>
        {message}
      </div>

      {/* Show piece info */}
      <div style={{
        fontSize: '0.95rem',
        textAlign: 'center',
        opacity: 0.9,
        marginBottom: '1.5rem',
        padding: '0.75rem',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: '8px',
      }}>
        {mode === 'identical' && requiredPieceId ? (
          <>
            <div>You tried: <strong>{attemptedPieceId}</strong></div>
            <div>Required: <strong>{requiredPieceId}</strong></div>
          </>
        ) : (
          <div>Piece: <strong>{attemptedPieceId}</strong></div>
        )}
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
