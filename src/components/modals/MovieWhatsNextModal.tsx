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
  onSaveMovie: () => void;
  onSaveAsNew?: () => void;
  onShareMovie: () => void;
  onChangeEffect?: () => void;
  isSaved: boolean;
}

export const MovieWhatsNextModal: React.FC<MovieWhatsNextModalProps> = ({
  isOpen,
  onClose,
  movieTitle,
  onPlayAgain,
  onTryPuzzle,
  onSaveMovie,
  onShareMovie,
  onChangeEffect,
  isSaved
}) => {
  const draggable = useDraggable();
  
  // Debug: Log the saved state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      console.log('🎬 What\'s Next Modal opened - isSaved:', isSaved);
    }
  }, [isOpen, isSaved]);
  
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
      
      {/* Backdrop - Transparent to keep scene visible */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'transparent',
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
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '20px',
              color: '#fff',
              fontWeight: 700,
              transition: 'all 0.2s',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent'
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

          {/* Change Movie Effect Button */}
          {onChangeEffect && (
            <button
              onClick={onChangeEffect}
              style={{
                padding: '14px 20px',
                background: 'rgba(255, 255, 255, 0.7)',
                border: '2px solid rgba(147, 51, 234, 0.4)',
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
              <span>✨</span> Change Movie Effect
            </button>
          )}

          {/* Save Movie Button - Auto-detects update vs new based on title change */}
          <button
            onClick={onSaveMovie}
            style={{
              padding: '14px 20px',
              background: isSaved 
                ? 'linear-gradient(135deg, #059669, #047857)' 
                : 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
              transition: 'all 0.2s'
            }}
          >
            <span>💾</span> {isSaved ? 'Save Movie' : 'Save My Movie'}
          </button>

          {/* Share Button - Disabled if not saved */}
          <button
            onClick={() => {
              if (!isSaved) {
                alert('💾 Please save your movie first!\n\nClick "Save My Movie" to save your movie settings to the database before sharing.');
              } else {
                onShareMovie();
              }
            }}
            style={{
              padding: '14px 20px',
              background: isSaved 
                ? 'rgba(255, 255, 255, 0.7)' 
                : 'rgba(203, 213, 225, 0.5)',
              border: `2px solid ${isSaved ? 'rgba(59,130,246,0.4)' : 'rgba(148, 163, 184, 0.3)'}`,
              borderRadius: '12px',
              color: isSaved ? '#1e293b' : '#94a3b8',
              fontSize: '16px',
              fontWeight: 700,
              cursor: isSaved ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: isSaved ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s',
              opacity: isSaved ? 1 : 0.6
            }}
          >
            <span>📤</span> Share {!isSaved && '🔒'}
          </button>
        </div>
      </div>
    </>
  );
};
