import React from 'react';

interface InvalidMoveModalProps {
  isOpen: boolean;
  onClose: (dontShowAgain: boolean) => void;
}

export const InvalidMoveModal: React.FC<InvalidMoveModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [dontShowAgain, setDontShowAgain] = React.useState(false);
  
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 3000,
        pointerEvents: 'auto', // Enable clicks
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: '#fff',
          padding: '2rem 2.5rem',
          borderRadius: '20px',
          boxShadow: '0 12px 48px rgba(245, 158, 11, 0.5)',
          border: '3px solid rgba(255, 255, 255, 0.4)',
          maxWidth: '450px',
          animation: 'slideIn 0.3s ease-out',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '0.75rem', textAlign: 'center' }}>
          ⚠️
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.75rem', textAlign: 'center' }}>
          Invalid Move!
        </div>
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
            marginBottom: '1rem',
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
      </div>
      <style>{`
        @keyframes slideIn {
          from {
            transform: translate(-50%, -60%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, -50%);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};
