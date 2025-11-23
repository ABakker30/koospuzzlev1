// Movie What's Next Modal - Post-playback navigation for gallery viewers
// Shown after watching a movie from the gallery
import React from 'react';

interface MovieWhatsNextModalProps {
  isOpen: boolean;
  onClose: () => void;
  movieTitle: string;
  onPlayAgain: () => void;
  onTryPuzzle: () => void;
  onShareMovie: () => void;
  onBackToGallery: () => void;
  onMoreMovies: () => void;
}

export const MovieWhatsNextModal: React.FC<MovieWhatsNextModalProps> = ({
  isOpen,
  onClose,
  movieTitle,
  onPlayAgain,
  onTryPuzzle,
  onShareMovie,
  onBackToGallery,
  onMoreMovies
}) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        background: 'linear-gradient(135deg, #dbeafe 0%, #e0e7ff 50%, #fae8ff 100%)',
        borderRadius: '20px',
        padding: '0',
        maxWidth: '500px',
        width: '100%',
        boxShadow: '0 25px 80px rgba(59,130,246,0.6), 0 0 60px rgba(59,130,246,0.3)',
        border: '3px solid rgba(59,130,246,0.6)'
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ 
          background: 'linear-gradient(135deg, #3b82f6, #2563eb, #1d4ed8)',
          padding: '2rem',
          borderRadius: '17px 17px 0 0',
          marginBottom: '24px',
          textAlign: 'center',
          borderBottom: '3px solid rgba(255,255,255,0.3)',
          boxShadow: '0 4px 20px rgba(59,130,246,0.4)'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎬</div>
          <h2 style={{ 
            color: '#fff', 
            fontSize: '24px', 
            fontWeight: 700,
            margin: 0,
            marginBottom: '8px',
            textShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            What's Next?
          </h2>
          <p style={{ 
            color: 'rgba(255,255,255,0.95)', 
            fontSize: '14px',
            margin: 0,
            fontWeight: 600
          }}>
            {movieTitle}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={onPlayAgain}
            style={{
              padding: '14px 24px',
              background: '#3b82f6',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <span>🔄</span> Play Again
          </button>
          
          <button
            onClick={onTryPuzzle}
            style={{
              padding: '14px 24px',
              background: 'rgba(34, 197, 94, 0.2)',
              border: '1px solid rgba(34, 197, 94, 0.4)',
              borderRadius: '8px',
              color: '#4ade80',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <span>🧩</span> Try This Puzzle
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={onShareMovie}
              style={{
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <span>📤</span> Share
            </button>
            <button
              onClick={onMoreMovies}
              style={{
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <span>🎥</span> More
            </button>
          </div>

          <button
            onClick={onBackToGallery}
            style={{
              padding: '12px 24px',
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>🏠</span> Back to Gallery
          </button>
        </div>
      </div>
    </div>
  );
};
