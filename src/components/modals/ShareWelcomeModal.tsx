// Share Welcome Modal - Welcome new users who arrived via share link
// Acquisition-focused with clear CTAs
import React from 'react';
import { useDraggable } from '../../hooks/useDraggable';

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
  const draggable = useDraggable();
  if (!isOpen) return null;

  return (
    <>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .share-welcome-modal-scrollable::-webkit-scrollbar {
          width: 12px;
        }
        .share-welcome-modal-scrollable::-webkit-scrollbar-track {
          background: rgba(75, 85, 99, 0.3);
          border-radius: 10px;
          margin: 20px 0;
        }
        .share-welcome-modal-scrollable::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #4b5563, #374151);
          border-radius: 10px;
          border: 2px solid rgba(31, 41, 55, 0.5);
        }
        .share-welcome-modal-scrollable::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #6b7280, #4b5563);
        }
        .share-welcome-modal-scrollable::-webkit-scrollbar-thumb:active {
          background: #6b7280;
        }
        .share-welcome-modal-scrollable {
          scrollbar-width: thin;
          scrollbar-color: #4b5563 rgba(75, 85, 99, 0.3);
        }
      `}</style>
      
      {/* Backdrop */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'transparent',
        backdropFilter: 'none',
        zIndex: 10000
      }} onClick={onClose} />
      
      {/* Modal - Centered and Draggable */}
      <div
        ref={draggable.ref}
        className="share-welcome-modal-scrollable"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
          borderRadius: '20px',
          padding: '0',
          maxWidth: '550px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '3px solid rgba(255, 255, 255, 0.15)',
          zIndex: 10001,
          ...draggable.style
        }} onClick={(e) => e.stopPropagation()}>
        {/* Header - Draggable */}
        <div style={{ 
          marginBottom: '24px', 
          textAlign: 'center',
          padding: '24px 32px 0',
          userSelect: 'none',
          ...draggable.headerStyle
        }}>
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
          margin: '0 32px',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 32px 32px' }}>
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
          padding: '0 32px 32px',
          margin: '20px 0 0 0'
        }}>
          💡 Create your own movies and share them with friends!
        </p>
      </div>
    </>
  );
};
