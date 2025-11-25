import React, { useEffect } from 'react';
import { useDraggable } from '../hooks/useDraggable';

interface SharedWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'puzzle' | 'movie';
  puzzleName?: string;
  creatorName?: string;
  sphereCount?: number;
  movieTitle?: string;
  effectType?: string;
}

export const SharedWelcomeModal: React.FC<SharedWelcomeModalProps> = ({
  isOpen,
  onClose,
  type,
  puzzleName,
  creatorName,
  sphereCount,
  movieTitle,
  effectType
}) => {
  if (!isOpen) return null;

  const isPuzzle = type === 'puzzle';
  const draggable = useDraggable();

  // Handle ESC key
  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Auto-close after 5 seconds if onReady is provided
  useEffect(() => {
    if (!onClose) return;
    
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'transparent',
          backdropFilter: 'none',
          zIndex: 10000
        }}
      />
      
      {/* Modal - Centered and Draggable */}
      <div 
        ref={draggable.ref}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          backgroundColor: '#1a1a1a',
          borderRadius: '20px',
          padding: '40px',
          maxWidth: '600px',
          width: '90%',
          border: '2px solid #4CAF50',
          boxShadow: '0 16px 48px rgba(76, 175, 80, 0.3)',
          zIndex: 10001,
          ...draggable.style
        }}>
        {/* Emoji Header */}
        <div style={{
          fontSize: '4rem',
          textAlign: 'center',
          marginBottom: '24px',
          filter: 'drop-shadow(0 4px 12px rgba(76, 175, 80, 0.5))'
        }}>
          {isPuzzle ? '🧩' : '🎬'}
        </div>

        {/* Title */}
        <h2 style={{
          color: '#fff',
          textAlign: 'center',
          marginBottom: '16px',
          fontSize: '2rem',
          fontWeight: '700'
        }}>
          {isPuzzle ? 'You Received a Puzzle!' : 'You Received a Movie!'}
        </h2>

        {/* Content Info */}
        <div style={{
          backgroundColor: '#252525',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '28px',
          border: '1px solid #333'
        }}>
          {isPuzzle ? (
            <>
              <div style={{
                color: '#4CAF50',
                fontSize: '1.5rem',
                fontWeight: '600',
                marginBottom: '12px',
                textAlign: 'center'
              }}>
                {puzzleName}
              </div>
              <div style={{
                color: '#aaa',
                fontSize: '1rem',
                textAlign: 'center',
                marginBottom: '16px'
              }}>
                Created by <span style={{ color: '#fff', fontWeight: '600' }}>{creatorName}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '24px',
                marginTop: '16px'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '4px' }}>
                    Spheres
                  </div>
                  <div style={{ color: '#4CAF50', fontSize: '1.8rem', fontWeight: '700' }}>
                    {sphereCount}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{
                color: '#4CAF50',
                fontSize: '1.5rem',
                fontWeight: '600',
                marginBottom: '12px',
                textAlign: 'center'
              }}>
                {movieTitle}
              </div>
              <div style={{
                textAlign: 'center',
                marginTop: '12px'
              }}>
                <span style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: '#fff',
                  padding: '6px 16px',
                  borderRadius: '20px',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  textTransform: 'capitalize'
                }}>
                  {effectType} Effect
                </span>
              </div>
            </>
          )}
        </div>

        {/* Instructions */}
        <div style={{
          backgroundColor: '#1f1f1f',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '28px',
          border: '1px solid #2a2a2a'
        }}>
          <h3 style={{
            color: '#fff',
            fontSize: '1.1rem',
            fontWeight: '600',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>💡</span> What You Can Do
          </h3>
          <ul style={{
            color: '#bbb',
            fontSize: '0.95rem',
            lineHeight: '1.8',
            paddingLeft: '24px',
            margin: 0
          }}>
            {isPuzzle ? (
              <>
                <li>Try to solve this puzzle challenge</li>
                <li>Rotate and inspect the 3D pieces</li>
                <li>Beat the creator's time</li>
                <li>Share your solution with friends</li>
                <li>Explore more puzzles in the gallery</li>
              </>
            ) : (
              <>
                <li>Watch the animated effect</li>
                <li>Try solving the puzzle yourself</li>
                <li>Create your own movie version</li>
                <li>Share with your friends</li>
                <li>Browse more movies in the gallery</li>
              </>
            )}
          </ul>
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
            border: 'none',
            borderRadius: '12px',
            padding: '16px 32px',
            color: '#fff',
            fontSize: '1.2rem',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.3s',
            boxShadow: '0 4px 16px rgba(76, 175, 80, 0.4)',
            transform: 'translateY(0)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(76, 175, 80, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(76, 175, 80, 0.4)';
          }}
        >
          {isPuzzle ? '🚀 Start Solving!' : '▶️ Watch Now!'}
        </button>

        {/* Skip text */}
        <div style={{
          textAlign: 'center',
          marginTop: '16px',
          color: '#666',
          fontSize: '0.85rem'
        }}>
          Press ESC or click outside to skip
        </div>
      </div>
    </>
  );
};
