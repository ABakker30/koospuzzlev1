import React from 'react';

type PieceMode = 'unlimited' | 'unique' | 'identical';

interface ModeViolationModalProps {
  isOpen: boolean;
  onClose: () => void;
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
  if (!isOpen) return null;

  const { title, message } = MODE_MESSAGES[mode];

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 3000,
        pointerEvents: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          color: '#fff',
          padding: '2rem 2.5rem',
          borderRadius: '20px',
          boxShadow: '0 12px 48px rgba(239, 68, 68, 0.5)',
          border: '3px solid rgba(255, 255, 255, 0.4)',
          maxWidth: '450px',
          animation: 'modeViolationSlideIn 0.3s ease-out',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '0.75rem', textAlign: 'center' }}>
          🚫
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.75rem', textAlign: 'center' }}>
          {title}
        </div>
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

        <button
          onClick={onClose}
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
      </div>
      <style>{`
        @keyframes modeViolationSlideIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};
