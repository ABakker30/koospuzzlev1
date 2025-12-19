import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GameSessionState } from '../types/manualGame';

interface ManualGameResultModalProps {
  session: GameSessionState;
  isOpen: boolean;
  onClose: () => void;
  onPlayAgain: () => void;
  puzzleName?: string;
}

export const ManualGameResultModal: React.FC<ManualGameResultModalProps> = ({
  session,
  isOpen,
  onClose,
  onPlayAgain,
  puzzleName,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const winnerId = session.winnerId;
  const winner = winnerId ? session.players.find(p => p.id === winnerId) : null;
  const humanPlayer = session.players.find(p => !p.isComputer);
  const humanWon = humanPlayer && winner && winner.id === humanPlayer.id;
  const isDraw = !winner;

  // Determine festive emoji and message
  let emoji = '';
  let celebration = '';
  if (humanWon) {
    emoji = '🎉';
    celebration = t('game.result.victory');
  } else if (isDraw) {
    emoji = '🤝';
    celebration = t('game.result.draw');
  } else {
    emoji = '💪';
    celebration = t('game.result.goodGame');
  }

  return (
    <div className="vs-result-backdrop" onClick={(e) => e.stopPropagation()}>
      <div className="vs-result-modal">
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>{emoji}</div>
        <h2 className="vs-result-title">
          {winner
            ? t('game.result.playerWins', { name: winner.name })
            : t('game.result.itsADraw')}
        </h2>
        <p style={{ fontSize: '1.1rem', color: '#a0a0a0', marginTop: '0.25rem' }}>
          {celebration}
        </p>
        {puzzleName && (
          <p className="vs-result-subtitle">
            {t('game.result.puzzleLabel')}: {puzzleName}
          </p>
        )}

        <div className="vs-result-scores">
          {session.players.map(p => (
            <div key={p.id} className="vs-result-card">
              <div className="vs-result-name">{p.name}</div>
              <div className="vs-result-score">
                {t('game.result.scoreLabel')}: {session.scores[p.id] ?? 0}
              </div>
              <div className="vs-result-stats">
                {t('game.result.hintsLabel')}: {session.stats[p.id]?.hintsUsed ?? 0} · {t('game.result.checksLabel')}:{' '}
                {session.stats[p.id]?.solvabilityChecksUsed ?? 0}
              </div>
            </div>
          ))}
        </div>

        <div className="vs-result-actions">
          <button 
            type="button" 
            className="btn" 
            onClick={(e) => {
              e.stopPropagation();
              onPlayAgain();
            }}
          >
            🔄 {t('game.result.playAgainButton')}
          </button>
          <button 
            type="button" 
            className="btn" 
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            ✖ {t('button.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
