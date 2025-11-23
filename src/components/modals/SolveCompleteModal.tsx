// Solve Complete Modal - Celebrate puzzle completion and encourage movie creation
// Shown when arriving from solve-complete route
import React from 'react';

interface SolveCompleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzleName: string;
  solveTime?: number;
  moveCount?: number;
  rank?: number;
  totalSolvers?: number;
  onCreateMovie: () => void;
  onPreviewSolution: () => void;
  onSolveAgain: () => void;
  onBackToGallery: () => void;
}

export const SolveCompleteModal: React.FC<SolveCompleteModalProps> = ({
  isOpen,
  onClose,
  puzzleName,
  solveTime,
  moveCount,
  rank,
  totalSolvers,
  onCreateMovie,
  onPreviewSolution,
  onSolveAgain,
  onBackToGallery
}) => {
  if (!isOpen) return null;

  const formatTime = (ms?: number) => {
    if (!ms) return '--';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
  };

  const getPercentile = () => {
    if (!rank || !totalSolvers) return null;
    return Math.round((rank / totalSolvers) * 100);
  };

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
          <div style={{ fontSize: '64px', marginBottom: '12px' }}>🎉</div>
          <h2 style={{ 
            color: '#fff', 
            fontSize: '32px', 
            fontWeight: 600,
            margin: 0,
            marginBottom: '8px'
          }}>
            Puzzle Solved!
          </h2>
          <p style={{ 
            color: '#9ca3af', 
            fontSize: '16px',
            margin: 0
          }}>
            {puzzleName}
          </p>
        </div>

        {/* Stats */}
        <div style={{
          padding: '20px',
          background: 'rgba(34, 197, 94, 0.1)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: '12px',
          marginBottom: '24px'
        }}>
          <div style={{ color: '#4ade80', fontSize: '14px', fontWeight: 600, marginBottom: '16px', textAlign: 'center' }}>
            🏆 YOUR PERFORMANCE
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            {solveTime && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '4px' }}>
                  ⏱️ TIME
                </div>
                <div style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>
                  {formatTime(solveTime)}
                </div>
              </div>
            )}
            {moveCount !== undefined && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '4px' }}>
                  🧩 MOVES
                </div>
                <div style={{ color: '#fff', fontSize: '24px', fontWeight: 600 }}>
                  {moveCount}
                </div>
              </div>
            )}
          </div>

          {rank && totalSolvers && (
            <div style={{
              padding: '12px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ color: '#fff', fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>
                Rank: #{rank} of {totalSolvers}
              </div>
              <div style={{ color: '#4ade80', fontSize: '14px' }}>
                Top {getPercentile()}%!
              </div>
            </div>
          )}
        </div>

        {/* Encouragement */}
        <div style={{
          padding: '16px',
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '8px',
          marginBottom: '24px',
          textAlign: 'center'
        }}>
          <div style={{ color: '#60a5fa', fontSize: '14px', marginBottom: '6px' }}>
            📹 Show off your solve!
          </div>
          <div style={{ color: '#9ca3af', fontSize: '13px' }}>
            Create a movie and share with friends
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={onCreateMovie}
            style={{
              padding: '16px 24px',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '18px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}
          >
            <span>🎬</span> Create Movie & Share
          </button>

          <button
            onClick={onPreviewSolution}
            style={{
              padding: '14px 24px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <span>👀</span> Preview Solution
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={onSolveAgain}
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
              <span>🔄</span> Solve Again
            </button>
            <button
              onClick={onBackToGallery}
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
              <span>🏠</span> Gallery
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
