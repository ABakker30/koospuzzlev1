// Movie What's Next Modal - Post-playback navigation for gallery viewers
// Shown after watching a movie from the gallery
import React from 'react';
import { useDraggable } from '../../hooks/useDraggable';

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
  const draggable = useDraggable();
  if (!isOpen) return null;

  return (
    <>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .movie-whats-next-modal-scrollable::-webkit-scrollbar {
          width: 12px;
        }
        .movie-whats-next-modal-scrollable::-webkit-scrollbar-track {
          background: rgba(59, 130, 246, 0.1);
          border-radius: 10px;
          margin: 20px 0;
        }
        .movie-whats-next-modal-scrollable::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #3b82f6, #2563eb);
          border-radius: 10px;
          border: 2px solid rgba(219, 234, 254, 0.5);
        }
        .movie-whats-next-modal-scrollable::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #2563eb, #1d4ed8);
        }
        .movie-whats-next-modal-scrollable::-webkit-scrollbar-thumb:active {
          background: #1d4ed8;
        }
        .movie-whats-next-modal-scrollable {
          scrollbar-width: thin;
          scrollbar-color: #3b82f6 rgba(59, 130, 246, 0.1);
        }
      `}</style>
      
      {/* Backdrop */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 10000
      }} onClick={onClose} />
      
      {/* Modal - Centered and Draggable */}
      <div
        ref={draggable.ref}
        className="movie-whats-next-modal-scrollable"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          background: 'linear-gradient(135deg, #dbeafe 0%, #e0e7ff 50%, #fae8ff 100%)',
          borderRadius: '20px',
          padding: '0',
          maxWidth: '450px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '3px solid rgba(59,130,246,0.6)',
          zIndex: 10001,
          ...draggable.style
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          background: 'linear-gradient(135deg, #3b82f6, #2563eb, #1d4ed8)',
          padding: '1.5rem',
          borderRadius: '17px 17px 0 0',
          marginBottom: '20px',
          textAlign: 'center',
          borderBottom: '3px solid rgba(255,255,255,0.3)',
          boxShadow: '0 4px 20px rgba(59,130,246,0.4)',
          position: 'relative',
          userSelect: 'none',
          ...draggable.headerStyle
        }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '18px',
              color: '#fff',
              fontWeight: 700,
              transition: 'all 0.2s'
            }}
            title="Close"
          >
            ×
          </button>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 1.5rem 1.5rem' }}>
          <button
            onClick={onPlayAgain}
            style={{
              padding: '14px 20px',
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(59, 130, 246, 0.4)',
              textShadow: '0 2px 4px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <span>🔄</span> Play Again
          </button>
          
          <button
            onClick={onTryPuzzle}
            style={{
              padding: '14px 20px',
              background: 'rgba(255, 255, 255, 0.7)',
              border: '2px solid rgba(59,130,246,0.4)',
              borderRadius: '12px',
              color: '#1e293b',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              transition: 'all 0.2s'
            }}
          >
            <span>🧩</span> Try This Puzzle
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              onClick={onShareMovie}
              style={{
                padding: '10px 12px',
                background: 'rgba(255, 255, 255, 0.7)',
                border: '2px solid rgba(59,130,246,0.4)',
                borderRadius: '10px',
                color: '#1e293b',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                transition: 'all 0.2s'
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
                padding: '10px 20px',
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
          >
            <span>🏠</span> Back to Gallery
          </button>
        </div>
      </div>
    </>
  );
};
