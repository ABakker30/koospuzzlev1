import React, { useEffect } from 'react';

interface InvalidMoveModalProps {
  isOpen: boolean;
  playerName?: string;
  onClose: () => void;
}

export const InvalidMoveModal: React.FC<InvalidMoveModalProps> = ({
  isOpen,
  playerName,
  onClose,
}) => {
  // Auto-dismiss after 2 seconds
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 3000,
        pointerEvents: 'none', // Non-blocking
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
          color: '#fff',
          padding: '1.5rem 2rem',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(220, 38, 38, 0.4)',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          maxWidth: '400px',
          animation: 'slideIn 0.3s ease-out',
        }}
      >
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem', textAlign: 'center' }}>
          ⚠️
        </div>
        <div style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.5rem', textAlign: 'center' }}>
          Invalid Move!
        </div>
        <div style={{ fontSize: '0.95rem', textAlign: 'center', opacity: 0.95 }}>
          That move breaks the puzzle's solvability.
        </div>
        <div style={{ fontSize: '0.85rem', textAlign: 'center', marginTop: '0.5rem', opacity: 0.8 }}>
          Piece removed. Turn passes on.
        </div>
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
