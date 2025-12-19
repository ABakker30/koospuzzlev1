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

  const handleSolveUnrated = () => {
    navigate(`/manual/${puzzle.id}`);
  };

  const handleSolveRated = () => {
    navigate(`/manual/${puzzle.id}?rated=true`);
  };

  const handleVsComputer = () => {
    navigate(`/game/${puzzle.id}`);
  };

  const handleVsPlayer = () => {
    alert('Multiplayer mode coming soon!');
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
            borderRadius: '20px',
            padding: '0',
            width: '90%',
            maxWidth: '460px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            animation: 'modalSlideIn 0.3s ease-out',
            zIndex: 10001,
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '16px 20px',
              borderRadius: '18px 18px 0 0',
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
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '24px',
                color: 'rgba(255, 255, 255, 0.8)',
                padding: '4px',
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
              }}
            >
              ✕
            </button>

            <h2
              style={{
                color: '#fff',
                fontSize: '1.05rem',
                fontWeight: 700,
                margin: 0,
                paddingRight: '40px',
                paddingLeft: '10px',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              What would you like to do?
            </h2>
          </div>

          {/* Actions - Uniform Grid */}
          <div
            style={{
              padding: '16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, 136px)',
              gap: '10px',
              justifyContent: 'center',
              alignItems: 'start',
            }}
          >

            {/* Solve Puzzle (Unrated) */}
            <button
              onClick={handleSolveUnrated}
              style={{
                background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '16px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                width: '136px',
                height: '145px',
                boxSizing: 'border-box',
                overflow: 'hidden',
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
              <span style={{ fontSize: '22px' }}>🎯</span>
              <span>Solve Puzzle (Unrated)</span>
            </button>

            {/* Solve Puzzle (Rated) */}
            <button
              onClick={handleSolveRated}
              style={{
                background: 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '16px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                width: '136px',
                height: '145px',
                boxSizing: 'border-box',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(33, 150, 243, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.4)';
              }}
            >
              <span style={{ fontSize: '22px' }}>🏆</span>
              <span>Solve Puzzle (Rated)</span>
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
                padding: '16px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                width: '136px',
                height: '145px',
                boxSizing: 'border-box',
                overflow: 'hidden',
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
              <span style={{ fontSize: '22px' }}>⚡</span>
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
                padding: '16px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                width: '136px',
                height: '145px',
                boxSizing: 'border-box',
                overflow: 'hidden',
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
              <span style={{ fontSize: '22px' }}>🤖</span>
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
                padding: '16px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                width: '136px',
                height: '145px',
                boxSizing: 'border-box',
                overflow: 'hidden',
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
              <span style={{ fontSize: '22px' }}>
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
                padding: '16px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                width: '136px',
                height: '145px',
                boxSizing: 'border-box',
                overflow: 'hidden',
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
              <span style={{ fontSize: '22px' }}>ℹ️</span>
              <span>About This Puzzle</span>
            </button>

            {/* Play vs Another Player (Coming Soon) */}
            <button
              onClick={handleVsPlayer}
              style={{
                background: 'linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                cursor: 'pointer',
                padding: '16px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                width: '136px',
                height: '145px',
                boxSizing: 'border-box',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(156, 39, 176, 0.4)',
                opacity: 0.7,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(156, 39, 176, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(156, 39, 176, 0.4)';
              }}
            >
              <span style={{ fontSize: '22px' }}>👥</span>
              <span>Play vs Another Player</span>
              <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>(Coming Soon)</span>
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
