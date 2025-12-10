import React from 'react';
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
  if (!isOpen) return null;

  const winnerId = session.winnerId;
  const winner =
    winnerId &&
    session.players.find(p => p.id === winnerId);

  return (
    <div className="vs-result-backdrop">
      <div className="vs-result-modal">
        <h2 className="vs-result-title">
          {winner
            ? `${winner.name} wins!` 
            : "Game over – it's a draw"}
        </h2>
        {puzzleName && (
          <p className="vs-result-subtitle">
            Puzzle: {puzzleName}
          </p>
        )}

        <div className="vs-result-scores">
          {session.players.map(p => (
            <div key={p.id} className="vs-result-card">
              <div className="vs-result-name">{p.name}</div>
              <div className="vs-result-score">
                Score: {session.scores[p.id] ?? 0}
              </div>
              <div className="vs-result-stats">
                Hints: {session.stats[p.id]?.hintsUsed ?? 0} · Checks:{' '}
                {session.stats[p.id]?.solvabilityChecksUsed ?? 0}
              </div>
            </div>
          ))}
        </div>

        <div className="vs-result-actions">
          <button type="button" className="btn" onClick={onPlayAgain}>
            Play again
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
