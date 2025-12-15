import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AboutPuzzleInfoModal } from './AboutPuzzleInfoModal';

interface PuzzleActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzle: {
    id: string;
    name: string;
    creator: string;
  };
}

export const PuzzleActionModal: React.FC<PuzzleActionModalProps> = ({
  isOpen,
  onClose,
  puzzle,
}) => {
  const navigate = useNavigate();
  const [showCopied, setShowCopied] = useState(false);
  const [showAboutInfo, setShowAboutInfo] = useState(false);

  if (!isOpen) return null;

  const handleSolve = () => {
    navigate(`/manual/${puzzle.id}`);
  };

  const handleVsComputer = () => {
    navigate(`/game/${puzzle.id}`);
  };

  const handleAutoSolve = () => {
    navigate(`/auto/${puzzle.id}`);
  };

  const handleShare = async () => {
    // Share via gallery with puzzle parameter
    const puzzleUrl = `${window.location.origin}/gallery?puzzle=${puzzle.id}&shared=true`;
    
    // Try Web Share API first (works on mobile with HTTPS)
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: puzzle.name,
          text: `Check out this puzzle: ${puzzle.name}`,
          url: puzzleUrl
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
      await navigator.clipboard.writeText(puzzleUrl);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (clipboardError) {
      console.error('Clipboard error:', clipboardError);
      // Last resort: show the URL so user can copy it manually
      alert(`Share this puzzle:\n${puzzleUrl}`);
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
        
        @keyframes actionButtonPop {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
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
              padding: '20px 24px',
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

            <h2
              style={{
                color: '#fff',
                fontSize: '1.3rem',
                fontWeight: 700,
                margin: 0,
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              What would you like to do?
            </h2>
          </div>

          {/* Actions - Two Column Grid */}
          <div
            style={{
              padding: '24px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >

            {/* Solve Button */}
            <button
              onClick={handleSolve}
              style={{
                background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '20px 16px',
                fontSize: '0.9rem',
                fontWeight: 700,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
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
              <span style={{ fontSize: '2rem' }}>🎯</span>
              <span>Solve This Puzzle</span>
            </button>

            {/* Auto Solve Button */}
            <button
              onClick={handleAutoSolve}
              style={{
                background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '20px 16px',
                fontSize: '0.9rem',
                fontWeight: 700,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
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
              <span style={{ fontSize: '2rem' }}>⚡</span>
              <span>Auto Solve</span>
            </button>

            {/* VS Computer Button */}
            <button
              onClick={handleVsComputer}
              style={{
                background: 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '20px 16px',
                fontSize: '0.9rem',
                fontWeight: 700,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
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
              <span style={{ fontSize: '2rem' }}>🤖</span>
              <span>Play VS Computer</span>
            </button>

            {/* Share Button */}
            <button
              onClick={handleShare}
              style={{
                background: showCopied
                  ? 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)'
                  : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '20px 16px',
                fontSize: '0.9rem',
                fontWeight: 700,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
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
              <span style={{ fontSize: '2rem' }}>
                {showCopied ? '✓' : '🔗'}
              </span>
              <span>{showCopied ? 'Link Copied!' : 'Share Puzzle'}</span>
            </button>

            {/* About This Puzzle Button */}
            <button
              onClick={() => setShowAboutInfo(true)}
              style={{
                background: 'linear-gradient(135deg, #9333ea 0%, #7e22ce 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '20px 16px',
                fontSize: '0.9rem',
                fontWeight: 700,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
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
              <span style={{ fontSize: '2rem' }}>ℹ️</span>
              <span>About This Puzzle</span>
            </button>
          </div>

          {/* Back to Gallery Button */}
          <div style={{ padding: '0 24px 24px' }}>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '12px',
                fontSize: '0.9rem',
                fontWeight: 600,
                width: '100%',
                textAlign: 'center',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              }}
            >
              Back to Gallery
            </button>
          </div>
        </div>

        {/* About Puzzle Info Modal */}
        <AboutPuzzleInfoModal
          isOpen={showAboutInfo}
          onClose={() => setShowAboutInfo(false)}
          puzzle={puzzle}
        />
      </div>
    </>
  );
};
