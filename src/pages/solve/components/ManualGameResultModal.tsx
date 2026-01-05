import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GameSessionState } from '../types/manualGame';

interface ManualGameResultModalProps {
  session: GameSessionState;
  isOpen: boolean;
  onClose: () => void;
  puzzleName?: string;
  elapsedSeconds?: number;
}

export const ManualGameResultModal: React.FC<ManualGameResultModalProps> = ({
  session,
  isOpen,
  onClose,
  puzzleName,
  elapsedSeconds = 0,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  // Determine winner/loser
  const winnerId = session.winnerId;
  const winner = winnerId ? session.players.find(p => p.id === winnerId) : null;
  const humanPlayer = session.players.find(p => !p.isComputer);
  const computerPlayer = session.players.find(p => p.isComputer);
  const humanWon = humanPlayer && winner && winner.id === humanPlayer.id;
  const isDraw = !winner;

  // Get scores
  const humanScore = humanPlayer ? (session.scores[humanPlayer.id] ?? 0) : 0;
  const computerScore = computerPlayer ? (session.scores[computerPlayer.id] ?? 0) : 0;
  const totalPieces = humanScore + computerScore;

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get stats
  const humanStats = humanPlayer ? session.stats[humanPlayer.id] : null;
  const hintsUsed = humanStats?.hintsUsed ?? 0;

  // Theme based on result
  const theme = humanWon 
    ? {
        backdrop: 'rgba(255, 215, 0, 0.15)',
        modalBg: 'linear-gradient(135deg, #fff9e6 0%, #fff3cc 50%, #ffe699 100%)',
        border: '3px solid #ffd700',
        shadow: '0 25px 60px rgba(255, 193, 7, 0.4)',
        titleColor: '#b8860b',
        subtitleColor: '#8b6914',
        statBg: 'rgba(255, 215, 0, 0.2)',
        statBorder: '1px solid rgba(255, 193, 7, 0.3)',
        statText: '#5c4a00',
        statLabel: '#8b7355',
        scoreBg: 'rgba(255, 215, 0, 0.25)',
        scoreBorder: '2px solid #ffd700',
        scoreText: '#b8860b',
      }
    : isDraw
    ? {
        backdrop: 'rgba(100, 100, 100, 0.3)',
        modalBg: 'linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%)',
        border: '2px solid #9ca3af',
        shadow: '0 25px 50px rgba(0, 0, 0, 0.2)',
        titleColor: '#4b5563',
        subtitleColor: '#6b7280',
        statBg: 'rgba(156, 163, 175, 0.15)',
        statBorder: '1px solid rgba(156, 163, 175, 0.3)',
        statText: '#374151',
        statLabel: '#6b7280',
        scoreBg: 'rgba(156, 163, 175, 0.2)',
        scoreBorder: '2px solid #9ca3af',
        scoreText: '#4b5563',
      }
    : {
        backdrop: 'rgba(99, 102, 241, 0.15)',
        modalBg: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
        border: '2px solid #818cf8',
        shadow: '0 25px 50px rgba(99, 102, 241, 0.25)',
        titleColor: '#4338ca',
        subtitleColor: '#6366f1',
        statBg: 'rgba(99, 102, 241, 0.1)',
        statBorder: '1px solid rgba(99, 102, 241, 0.2)',
        statText: '#3730a3',
        statLabel: '#6366f1',
        scoreBg: 'rgba(99, 102, 241, 0.15)',
        scoreBorder: '2px solid #818cf8',
        scoreText: '#4338ca',
      };

  return (
    <div 
      className="vs-result-backdrop" 
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        background: theme.backdrop,
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div 
        className="vs-result-modal"
        style={{
          background: theme.modalBg,
          borderRadius: '24px',
          padding: '2rem',
          maxWidth: '420px',
          width: '90%',
          boxShadow: theme.shadow,
          border: theme.border,
          textAlign: 'center',
          position: 'relative',
        }}
      >
        {/* X Close Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(0,0,0,0.1)',
            color: theme.statText,
            fontSize: '1.2rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(0,0,0,0.2)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(0,0,0,0.1)';
          }}
        >
          ✕
        </button>

        {/* Trophy/Result Icon */}
        <div style={{ 
          fontSize: '4rem', 
          marginBottom: '0.5rem',
          filter: humanWon ? 'drop-shadow(0 0 25px #ffd700)' : 'none',
        }}>
          {humanWon ? '🏆' : isDraw ? '🤝' : '🤖'}
        </div>

        {/* Main Result */}
        <h2 style={{ 
          fontSize: '2.2rem',
          fontWeight: 'bold',
          marginBottom: '0.5rem',
          color: theme.titleColor,
        }}>
          {humanWon ? '🎉 Victory! 🎉' : isDraw ? 'Draw!' : 'Defeat'}
        </h2>

        <p style={{ 
          fontSize: '1rem', 
          color: theme.subtitleColor, 
          marginBottom: '1.5rem' 
        }}>
          {humanWon ? 'You outsmarted the computer!' : isDraw ? 'A perfectly matched game!' : 'The computer wins this round.'}
        </p>

        {/* Score Display - VS Style */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}>
          {/* Human Score */}
          <div style={{
            flex: 1,
            background: humanWon ? theme.scoreBg : theme.statBg,
            border: humanWon ? theme.scoreBorder : theme.statBorder,
            borderRadius: '16px',
            padding: '1rem',
          }}>
            <div style={{ fontSize: '0.8rem', color: theme.scoreText, fontWeight: '600', marginBottom: '0.25rem' }}>
              YOU
            </div>
            <div style={{ 
              fontSize: '2.5rem', 
              fontWeight: 'bold', 
              color: humanWon ? '#b8860b' : theme.statText,
            }}>
              {humanScore}
            </div>
          </div>

          {/* VS Divider */}
          <div style={{
            fontSize: '1.2rem',
            fontWeight: 'bold',
            color: theme.statLabel,
          }}>
            vs
          </div>

          {/* Computer Score */}
          <div style={{
            flex: 1,
            background: !humanWon && !isDraw ? theme.scoreBg : theme.statBg,
            border: !humanWon && !isDraw ? theme.scoreBorder : theme.statBorder,
            borderRadius: '16px',
            padding: '1rem',
          }}>
            <div style={{ fontSize: '0.8rem', color: theme.statLabel, fontWeight: '600', marginBottom: '0.25rem' }}>
              CPU
            </div>
            <div style={{ 
              fontSize: '2.5rem', 
              fontWeight: 'bold', 
              color: theme.statText,
            }}>
              {computerScore}
            </div>
          </div>
        </div>

        {/* Game Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}>
          <div style={{
            background: theme.statBg,
            border: theme.statBorder,
            borderRadius: '12px',
            padding: '0.75rem 0.5rem',
          }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: theme.statText }}>
              {totalPieces}
            </div>
            <div style={{ fontSize: '0.7rem', color: theme.statLabel, textTransform: 'uppercase' }}>
              Pieces
            </div>
          </div>
          <div style={{
            background: theme.statBg,
            border: theme.statBorder,
            borderRadius: '12px',
            padding: '0.75rem 0.5rem',
          }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: theme.statText }}>
              {formatTime(elapsedSeconds)}
            </div>
            <div style={{ fontSize: '0.7rem', color: theme.statLabel, textTransform: 'uppercase' }}>
              Time
            </div>
          </div>
          <div style={{
            background: theme.statBg,
            border: theme.statBorder,
            borderRadius: '12px',
            padding: '0.75rem 0.5rem',
          }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: theme.statText }}>
              {hintsUsed}
            </div>
            <div style={{ fontSize: '0.7rem', color: theme.statLabel, textTransform: 'uppercase' }}>
              Hints
            </div>
          </div>
        </div>

        {/* Puzzle Name */}
        {puzzleName && (
          <div style={{ 
            fontSize: '0.85rem', 
            color: theme.statLabel,
            marginBottom: '1.5rem',
          }}>
            {puzzleName}
          </div>
        )}

      </div>
    </div>
  );
};
