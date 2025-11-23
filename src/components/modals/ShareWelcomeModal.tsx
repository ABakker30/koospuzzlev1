// Share Welcome Modal - Welcome new users who arrived via share link
// Acquisition-focused with clear CTAs
import React from 'react';

interface ShareWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  movieTitle: string;
  creatorName?: string;
  personalMessage?: string;
  onTryPuzzle: () => void;
  onWatchAgain: () => void;
  onCreateOwn: () => void;
  onExplorePuzzles: () => void;
  onShare: () => void;
}

export const ShareWelcomeModal: React.FC<ShareWelcomeModalProps> = ({
  isOpen,
  onClose,
  movieTitle,
  creatorName,
  personalMessage,
  onTryPuzzle,
  onWatchAgain,
  onCreateOwn,
  onExplorePuzzles,
  onShare
}) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
        borderRadius: '16px',
        padding: '32px',
        maxWidth: '550px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '12px' }}>👋</div>
          <h2 style={{ 
            color: '#fff', 
            fontSize: '28px', 
            fontWeight: 600,
            margin: 0,
            marginBottom: '8px'
          }}>
            Welcome to Koos Puzzles!
          </h2>
          <p style={{ 
            color: '#9ca3af', 
            fontSize: '14px',
            margin: 0,
            marginBottom: '16px'
          }}>
            {creatorName ? `${creatorName} shared` : 'Someone shared'} this puzzle solution with you
          </p>
          
          {/* Personal Message */}
          {personalMessage && (
            <div style={{
              padding: '16px',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '8px',
              marginTop: '16px'
            }}>
              <div style={{ color: '#60a5fa', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                💬 MESSAGE FROM {creatorName?.toUpperCase() || 'CREATOR'}
              </div>
              <div style={{ color: '#fff', fontSize: '14px', fontStyle: 'italic' }}>
                "{personalMessage}"
              </div>
            </div>
          )}
        </div>

        {/* Movie Title */}
        <div style={{
          padding: '12px 16px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          marginBottom: '24px',
          textAlign: 'center'
        }}>
          <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '4px' }}>
            MOVIE
          </div>
          <div style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>
            {movieTitle}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={onTryPuzzle}
            style={{
              padding: '16px 24px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '18px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(59, 130, 246, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}
          >
            <span>🧩</span> Try This Puzzle!
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={onWatchAgain}
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
              <span>🔄</span> Watch Again
            </button>
            <button
              onClick={onCreateOwn}
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
              <span>🎥</span> Create Own
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={onExplorePuzzles}
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
              <span>🏠</span> Explore
            </button>
            <button
              onClick={onShare}
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
          </div>
        </div>

        {/* Footer tip */}
        <p style={{
          marginTop: '20px',
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '12px',
          margin: '20px 0 0 0'
        }}>
          💡 Create your own movies and share them with friends!
        </p>
      </div>
    </div>
  );
};
