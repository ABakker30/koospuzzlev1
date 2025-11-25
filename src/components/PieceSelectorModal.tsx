import React, { useEffect } from 'react';

interface PieceSelectorModalProps {
  isOpen: boolean;
  pieces: string[];
  activePiece: string;
  placedCount: Record<string, number>;
  mode: 'oneOfEach' | 'unlimited' | 'single';
  onSelectPiece: (pieceId: string) => void;
  onClose: () => void;
}

export const PieceSelectorModal: React.FC<PieceSelectorModalProps> = ({
  isOpen,
  pieces,
  activePiece,
  placedCount,
  mode,
  onSelectPiece,
  onClose
}) => {
  // ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;

  const handleSelect = (pieceId: string) => {
    onSelectPiece(pieceId);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'transparent',
          backdropFilter: 'none',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={onClose}
      />
      
      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
          borderRadius: '16px',
          padding: '2rem',
          maxWidth: '600px',
          maxHeight: '80vh',
          overflow: 'auto',
          zIndex: 1001,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          paddingBottom: '1rem'
        }}>
          <h2 style={{ 
            margin: 0, 
            color: '#fff',
            fontSize: '1.5rem',
            fontWeight: 600
          }}>
            📦 Select Piece
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '28px',
              cursor: 'pointer',
              padding: '0',
              lineHeight: '1',
              opacity: 0.7,
              transition: 'opacity 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
            onMouseOut={(e) => e.currentTarget.style.opacity = '0.7'}
          >
            ×
          </button>
        </div>

        {/* Mode Info */}
        <div style={{
          background: 'rgba(76, 175, 80, 0.15)',
          border: '1px solid rgba(76, 175, 80, 0.3)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '1.5rem',
          color: '#a5d6a7',
          fontSize: '14px'
        }}>
          <strong>Mode:</strong> {mode === 'oneOfEach' ? 'One of Each' : mode === 'unlimited' ? 'Unlimited' : 'Single Piece'}
        </div>

        {/* Piece Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '12px',
        }}>
          {pieces.map((pieceId) => {
            const count = placedCount[pieceId] || 0;
            const isActive = pieceId === activePiece;
            const isMaxed = mode === 'oneOfEach' && count >= 1;
            
            return (
              <button
                key={pieceId}
                onClick={() => !isMaxed && handleSelect(pieceId)}
                disabled={isMaxed}
                style={{
                  background: isActive 
                    ? 'linear-gradient(135deg, #4caf50 0%, #66bb6a 100%)'
                    : isMaxed
                    ? 'rgba(100, 100, 100, 0.3)'
                    : 'rgba(255, 255, 255, 0.1)',
                  border: isActive ? '2px solid #81c784' : '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '12px',
                  padding: '20px 12px',
                  color: isMaxed ? '#666' : '#fff',
                  fontSize: '24px',
                  fontWeight: isActive ? 700 : 600,
                  cursor: isMaxed ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: isMaxed ? 0.4 : 1,
                  transform: isActive ? 'scale(1.05)' : 'scale(1)',
                  boxShadow: isActive 
                    ? '0 4px 12px rgba(76, 175, 80, 0.4)' 
                    : '0 2px 4px rgba(0, 0, 0, 0.2)'
                }}
                onMouseOver={(e) => {
                  if (!isMaxed && !isActive) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = isMaxed 
                      ? 'rgba(100, 100, 100, 0.3)'
                      : 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                <span>{pieceId}</span>
                <span style={{ 
                  fontSize: '11px', 
                  opacity: 0.8,
                  fontWeight: 400
                }}>
                  {mode === 'oneOfEach' 
                    ? `${count}/1`
                    : mode === 'single'
                    ? count > 0 ? '✓' : ''
                    : count > 0 ? `×${count}` : ''
                  }
                </span>
                {isMaxed && (
                  <span style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    fontSize: '16px'
                  }}>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '13px',
          color: '#999'
        }}>
          <div>
            💡 Click a piece to select it
          </div>
          <div>
            Press <kbd style={{ 
              background: 'rgba(255,255,255,0.1)', 
              padding: '2px 6px', 
              borderRadius: '4px',
              fontSize: '11px'
            }}>ESC</kbd> to close
          </div>
        </div>
      </div>
    </>
  );
};
