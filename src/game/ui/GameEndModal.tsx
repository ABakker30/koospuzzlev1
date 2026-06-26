// src/game/ui/GameEndModal.tsx
// End-of-game modal overlay - Phase 2C

import React from 'react';
import { ModalBase } from '../../components/ModalBase';
import type { GameEndState, PlayerState } from '../contracts/GameState';
import { tokens } from '../../styles/tokens';

interface GameEndModalProps {
  endState: GameEndState;
  players: PlayerState[];
  onNewGame: () => void;
  onClose?: () => void;
  scoringEnabled?: boolean;
  playerNameOverrides?: Record<string, string>;
}

export function GameEndModal({ endState, players, onNewGame, onClose, scoringEnabled = true, playerNameOverrides }: GameEndModalProps) {
  const { reason, winnerPlayerIds, finalScores, turnNumberAtEnd } = endState;

  // Helper to resolve display name
  const displayName = (playerId: string, fallback: string) =>
    playerNameOverrides?.[playerId] ?? fallback;

  // Get winner names
  const winners = players.filter(p => winnerPlayerIds.includes(p.id));
  const isTie = winners.length > 1;

  // Reason display text
  const reasonText = {
    completed: 'Puzzle Completed!',
    stalled: 'No More Moves',
    timeout: 'Time Expired',
  }[reason];

  return (
    <ModalBase
      isOpen
      onClose={onClose ?? (() => {})}
      dismissOnBackdrop={false}
      maxWidth={400}
      surface="linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%)"
      headerIcon={<div style={styles.trophyIcon}>🏆</div>}
      title="Game Over"
      subtitle={reasonText}
      footer={
        <div style={styles.actions}>
          <button style={styles.newGameButton} onClick={onNewGame}>
            New Game
          </button>
        </div>
      }
    >
      <div style={{ textAlign: 'center' }}>
        {/* Winner announcement - only show when scoring is enabled */}
        {scoringEnabled && (
          <div style={styles.winnerSection}>
            {winners.length === 0 ? (
              <div style={styles.winnerName}>No winner</div>
            ) : isTie ? (
              <>
                <div style={styles.tieLabel}>It's a Tie!</div>
                <div style={styles.winnerNames}>
                  {winners.map(w => displayName(w.id, w.name)).join(' & ')}
                </div>
              </>
            ) : (
              <>
                <div style={styles.winnerLabel}>Winner</div>
                <div style={styles.winnerName}>{displayName(winners[0].id, winners[0].name)}</div>
              </>
            )}
            {winners.length > 0 && (
              <div style={styles.winnerScore}>
                {winners[0].score} point{winners[0].score !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        {/* Final Scores - only show when scoring is enabled */}
        {scoringEnabled && (
          <div style={styles.scoresSection}>
            <div style={styles.scoresTitle}>Final Scores</div>
            <div style={styles.scoresList}>
              {finalScores.map((entry, idx) => (
                <div
                  key={entry.playerId}
                  style={{
                    ...styles.scoreRow,
                    ...(winnerPlayerIds.includes(entry.playerId) ? styles.winnerRow : {}),
                  }}
                >
                  <span style={styles.rank}>#{idx + 1}</span>
                  <span style={styles.playerName}>{displayName(entry.playerId, entry.playerName)}</span>
                  <span style={styles.score}>{entry.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={styles.stats}>
          Completed in {turnNumberAtEnd} turn{turnNumberAtEnd !== 1 ? 's' : ''}
        </div>
      </div>
    </ModalBase>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  trophyIcon: {
    fontSize: '64px',
    animation: 'bounce 0.6s ease',
  },
  winnerSection: {
    marginBottom: '24px',
  },
  winnerLabel: {
    fontSize: '0.85rem',
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: '2px',
    marginBottom: '4px',
  },
  tieLabel: {
    fontSize: '1rem',
    color: '#fbbf24',
    fontWeight: 'bold',
    marginBottom: '4px',
  },
  winnerName: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#fbbf24',
  },
  winnerNames: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: '#fbbf24',
  },
  winnerScore: {
    fontSize: '1rem',
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: '4px',
  },
  scoresSection: {
    marginBottom: '20px',
  },
  scoresTitle: {
    fontSize: '0.85rem',
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '12px',
  },
  scoresList: {
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '12px',
    padding: '8px',
  },
  scoreRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: '8px',
    marginBottom: '4px',
  },
  winnerRow: {
    background: 'rgba(251, 191, 36, 0.15)',
  },
  rank: {
    width: '32px',
    fontSize: '0.85rem',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  playerName: {
    flex: 1,
    textAlign: 'left',
    fontSize: '1rem',
    color: '#fff',
  },
  score: {
    fontSize: '1rem',
    fontWeight: 'bold',
    color: '#fff',
  },
  stats: {
    fontSize: '0.85rem',
    color: 'rgba(255, 255, 255, 0.4)',
    marginBottom: '24px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  newGameButton: {
    padding: '14px 32px',
    fontSize: '1rem',
    fontWeight: 'bold',
    background: tokens.gradient.brand,
    border: 'none',
    borderRadius: '12px',
    color: '#fff',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
};

export default GameEndModal;
