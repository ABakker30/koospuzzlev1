import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AboutMovieInfoModal } from './AboutMovieInfoModal';

interface MovieActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  movie: {
    id: string;
    title: string;
    creator_name: string;
    effect_type: string;
    puzzle_id?: string;
    duration_sec: number;
    view_count: number;
    like_count: number;
    puzzle_name?: string;
  };
}

export const MovieActionModal: React.FC<MovieActionModalProps> = ({
  isOpen,
  onClose,
  movie,
}) => {
  const navigate = useNavigate();
  const [showCopied, setShowCopied] = useState(false);
  const [showAboutInfo, setShowAboutInfo] = useState(false);

  if (!isOpen) return null;

  const handleViewMovie = () => {
    const effectType = movie.effect_type || 'turntable';
    navigate(`/movies/${effectType}/${movie.id}?from=gallery`);
  };

  const handleSolve = () => {
    if (movie.puzzle_id) {
      navigate(`/manual/${movie.puzzle_id}`);
    } else {
      alert('Puzzle not available for this movie');
    }
  };

  const handleVsComputer = () => {
    if (movie.puzzle_id) {
      navigate(`/game/${movie.puzzle_id}`);
    } else {
      alert('Puzzle not available for this movie');
    }
  };

  const handleShare = async () => {
    // Share via gallery with movie parameter
    const movieUrl = `${window.location.origin}/gallery?tab=movies&movie=${movie.id}&shared=true`;
    
    // Try Web Share API first (works on mobile with HTTPS)
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: movie.title,
          text: `Check out this movie: ${movie.title}`,
          url: movieUrl
        });
        return; // Success
      } catch (error) {
        // User cancelled
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        // Share failed, fall through to clipboard
        console.error('Share failed:', error);
      }
    }
    
    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(movieUrl);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (clipboardError) {
      console.error('Clipboard error:', clipboardError);
      // Last resort: show the URL so user can copy it manually
      alert(`Share this movie:\n${movieUrl}`);
    }
  };

  return (
    <>
      <style>{`
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translate(-50%, -45%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '24px',
            padding: '0',
            width: '90%',
            maxWidth: '480px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '3px solid rgba(255, 255, 255, 0.2)',
            animation: 'modalSlideIn 0.3s ease-out',
            zIndex: 10001,
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '24px',
              borderRadius: '21px 21px 0 0',
              textAlign: 'center',
              position: 'relative',
            }}
          >
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '20px',
                color: '#fff',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.transform = 'rotate(90deg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'rotate(0deg)';
              }}
            >
              ✕
            </button>

            <div style={{ fontSize: '4rem', marginBottom: '8px' }}>🎬</div>
            <h2
              style={{
                color: '#fff',
                fontSize: '1.5rem',
                fontWeight: 700,
                margin: '0 0 8px 0',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              {movie.title}
            </h2>
            <p
              style={{
                color: 'rgba(255, 255, 255, 0.8)',
                fontSize: '0.9rem',
                margin: 0,
              }}
            >
              by {movie.creator_name}
            </p>
          </div>

          {/* Actions */}
          <div
            style={{
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <p
              style={{
                color: '#fff',
                fontSize: '0.95rem',
                textAlign: 'center',
                margin: '0 0 8px 0',
                fontWeight: 600,
              }}
            >
              What would you like to do?
            </p>

            {/* View Movie Button */}
            <button
              onClick={handleViewMovie}
              style={{
                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '16px 24px',
                fontSize: '1rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>▶️</span>
              <span>View Movie</span>
            </button>

            {/* Solve Puzzle Button */}
            {movie.puzzle_id && (
              <button
                onClick={handleSolve}
                style={{
                  background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: '16px 24px',
                  fontSize: '1rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(76, 175, 80, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.4)';
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>🎯</span>
                <span>Solve This Puzzle</span>
              </button>
            )}

            {/* VS Computer Button */}
            {movie.puzzle_id && (
              <button
                onClick={handleVsComputer}
                style={{
                  background: 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: '16px 24px',
                  fontSize: '1rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(255, 152, 0, 0.4)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 152, 0, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 152, 0, 0.4)';
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>🤖</span>
                <span>Play VS Computer</span>
              </button>
            )}

            {/* Share Button */}
            <button
              onClick={handleShare}
              style={{
                background: showCopied
                  ? 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)'
                  : 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '16px 24px',
                fontSize: '1rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transition: 'all 0.2s',
                boxShadow: showCopied
                  ? '0 4px 12px rgba(76, 175, 80, 0.4)'
                  : '0 4px 12px rgba(33, 150, 243, 0.4)',
              }}
              onMouseEnter={(e) => {
                if (!showCopied) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(33, 150, 243, 0.6)';
                }
              }}
              onMouseLeave={(e) => {
                if (!showCopied) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.4)';
                }
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>
                {showCopied ? '✓' : '🔗'}
              </span>
              <span>{showCopied ? 'Link Copied!' : 'Share Movie'}</span>
            </button>

            {/* About This Movie Button */}
            <button
              onClick={() => setShowAboutInfo(true)}
              style={{
                background: 'linear-gradient(135deg, #9333ea 0%, #7e22ce 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '16px 24px',
                fontSize: '1rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(147, 51, 234, 0.4)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(147, 51, 234, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(147, 51, 234, 0.4)';
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>ℹ️</span>
              <span>About This Movie</span>
            </button>
          </div>
        </div>

        {/* About Movie Info Modal */}
        <AboutMovieInfoModal
          isOpen={showAboutInfo}
          onClose={() => setShowAboutInfo(false)}
          movie={movie}
        />
      </div>
    </>
  );
};
