import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GameSessionState } from '../types/manualGame';

interface ManualGameResultModalProps {
  session: GameSessionState;
  isOpen: boolean;
  onClose: () => void;
  onPlayAgain: () => void;
  puzzleName?: string;
  totalPieces?: number; // Total pieces in puzzle (e.g., 10 for 40-cell puzzle)
}

export const ManualGameResultModal: React.FC<ManualGameResultModalProps> = ({
  session,
  isOpen,
  onClose,
  onPlayAgain,
  puzzleName,
  totalPieces = 10,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const winnerId = session.winnerId;
  const winner = winnerId ? session.players.find(p => p.id === winnerId) : null;
  const loser = winnerId ? session.players.find(p => p.id !== winnerId) : null;
  const humanPlayer = session.players.find(p => !p.isComputer);
  const humanWon = humanPlayer && winner && winner.id === humanPlayer.id;
  const isDraw = !winner;
  
  // Calculate pieces placed by winner
  const winnerScore = winner ? (session.scores[winner.id] ?? 0) : 0;
  const piecesPlaced = winnerScore; // Assuming score = pieces placed
  
  // Check if game ended due to invalid move making puzzle unsolvable
  const computerMadeInvalidMove = session.endReason === 'manual' && humanWon && loser?.isComputer;
  const humanMadeInvalidMove = session.endReason === 'manual' && !humanWon && !isDraw && loser && !loser.isComputer;

  return (
    <div className="vs-result-backdrop" onClick={(e) => e.stopPropagation()}>
      <div className="vs-result-modal">
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎉</div>
        <h2 className="vs-result-title" style={{ color: '#ff6b35', marginBottom: '0.5rem' }}>
          {humanWon ? 'You win!' : isDraw ? "It's a draw!" : 'Computer wins!'}
        </h2>
        <p style={{ fontSize: '1.1rem', color: '#a0a0a0', marginBottom: '1.5rem' }}>
          {humanWon ? 'Victory!' : isDraw ? 'Good effort!' : 'Good game!'}
        </p>

        {puzzleName && (
          <p style={{ 
            fontSize: '1rem', 
            color: '#6366f1', 
            fontWeight: '500',
            marginBottom: '1.5rem'
          }}>
            Puzzle: {puzzleName}
          </p>
        )}

        {/* Single score display */}
        <div style={{
          background: 'rgba(255, 235, 205, 0.3)',
          border: '2px solid #ffb380',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#ff6b35', marginBottom: '0.5rem' }}>
            {piecesPlaced} / {totalPieces}
          </div>
          <div style={{ fontSize: '1rem', color: '#666' }}>
            pieces placed
          </div>
        </div>

        {/* Explanation if computer made invalid move */}
        {computerMadeInvalidMove && (
          <div style={{
            background: 'rgba(99, 102, 241, 0.1)',
            border: '2px solid #6366f1',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.5rem',
            fontSize: '0.95rem',
            color: '#4b5563',
            lineHeight: '1.5',
          }}>
            <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#6366f1' }}>
              💡 How you won
            </div>
            The computer placed a piece that made the puzzle unsolvable. When the solver detected no valid solutions remained, you automatically won!
          </div>
        )}

        {/* Explanation if human made invalid move */}
        {humanMadeInvalidMove && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '2px solid #ef4444',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.5rem',
            fontSize: '0.95rem',
            color: '#4b5563',
            lineHeight: '1.5',
          }}>
            <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#ef4444' }}>
              ❌ What happened
            </div>
            You placed a piece that made the puzzle unsolvable. When the solver detected no valid solutions remained, the computer automatically won!
          </div>
        )}

        <div className="vs-result-actions">
          <button 
            type="button" 
            className="btn" 
            onClick={(e) => {
              e.stopPropagation();
              onPlayAgain();
            }}
          >
            🔄 Play again
          </button>
          <button 
            type="button" 
            className="btn" 
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            ✖ Close
          </button>
        </div>
      </div>
    </div>
  );
};
