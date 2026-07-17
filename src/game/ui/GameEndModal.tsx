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
  /** When set (guest games), shows a non-blocking "sign in to save" nudge. */
  onSignIn?: () => void;
  /** When set (puzzle completed), shows a "Share a clip" button. */
  onShareClip?: () => void;
  /** When set (puzzle completed), links to the puzzle's leaderboard. */
  onViewLeaderboard?: () => void;
  /** When set (challenge run), shows the head-to-head verdict. */
  challenge?: {
    outcome: 'won' | 'lost' | 'tied';
    playerName: string;
    targetName: string;
    playerScore: string | null;
    playerTime: string | null;
    targetScore: string | null;
    targetTime: string | null;
  };
}

export function GameEndModal({ endState, players, onNewGame, onClose, scoringEnabled = true, playerNameOverrides, onSignIn, onShareClip, onViewLeaderboard, challenge }: GameEndModalProps) {
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
          {onViewLeaderboard && (
            <button style={styles.leaderboardButton} onClick={onViewLeaderboard}>
              🏆 See where you stand
            </button>
          )}
          <button style={styles.newGameButton} onClick={onNewGame}>
            New Game
          </button>
        </div>
      }
    >
      <div style={{ textAlign: 'center' }}>
        {/* Challenge verdict — head-to-head vs the target */}
        {challenge && (
          <div style={styles.verdictBox}>
            <div
              style={{
                ...styles.verdictHeadline,
                color:
                  challenge.outcome === 'won'
                    ? '#34d399'
                    : challenge.outcome === 'tied'
                    ? '#fbbf24'
                    : '#f87171',
              }}
            >
              {challenge.outcome === 'won' && `🏆 You beat ${challenge.targetName}!`}
              {challenge.outcome === 'lost' && `😮 ${challenge.targetName} still leads`}
              {challenge.outcome === 'tied' && `🤝 Dead heat with ${challenge.targetName}!`}
            </div>
            <div style={styles.verdictRows}>
              <div style={styles.verdictRow}>
                <span style={styles.verdictWho}>{challenge.playerName}</span>
                <span style={styles.verdictScore}>{challenge.playerScore ?? '—'}</span>
                <span style={styles.verdictTime}>
                  {challenge.playerTime ? `⏱ ${challenge.playerTime}` : ''}
                </span>
              </div>
              <div style={styles.verdictRow}>
                <span style={styles.verdictWho}>{challenge.targetName}</span>
                <span style={styles.verdictScore}>{challenge.targetScore ?? '—'}</span>
                <span style={styles.verdictTime}>
                  {challenge.targetTime ? `⏱ ${challenge.targetTime}` : ''}
                </span>
              </div>
            </div>
            {challenge.outcome === 'lost' && (
              <div style={styles.verdictHint}>Tap New Game to try again.</div>
            )}
          </div>
        )}

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

        {/* Share a clip (puzzle completed) */}
        {onShareClip && (
          <button style={styles.shareButton} onClick={onShareClip}>
            📤 Share
          </button>
        )}

        {/* Guest nudge: sign in to save results */}
        {onSignIn && (
          <div style={styles.nudge}>
            <span style={styles.nudgeText}>💾 Sign in to save your results</span>
            <button style={styles.nudgeButton} onClick={onSignIn}>
              Sign In
            </button>
          </div>
        )}
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
  verdictBox: {
    background: 'rgba(0,0,0,0.25)',
    borderRadius: 12,
    padding: '16px',
    marginBottom: 20,
  },
  verdictHeadline: {
    fontSize: '1.25rem',
    fontWeight: 700,
    marginBottom: 12,
  },
  verdictRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  verdictRow: {
    display: 'grid',
    gridTemplateColumns: '1fr auto auto',
    alignItems: 'baseline',
    gap: 12,
    padding: '6px 10px',
    borderRadius: 8,
    background: 'rgba(255,255,255,0.06)',
  },
  verdictWho: {
    textAlign: 'left',
    color: '#fff',
    fontSize: '0.95rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  verdictScore: {
    color: '#34d399',
    fontWeight: 700,
    fontSize: '1rem',
  },
  verdictTime: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: '0.9rem',
    minWidth: 56,
    textAlign: 'right',
  },
  verdictHint: {
    fontSize: '0.85rem',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
  },
  shareButton: {
    width: '100%',
    padding: '14px 20px',
    fontSize: '1rem',
    fontWeight: 700,
    background: '#10b981',
    border: 'none',
    borderRadius: '12px',
    color: '#fff',
    cursor: 'pointer',
    marginBottom: '16px',
    boxShadow: '0 4px 14px rgba(16,185,129,0.4)',
  },
  nudge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '14px 16px',
    marginTop: '4px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '12px',
  },
  nudgeText: {
    fontSize: '0.9rem',
    color: tokens.text.onGradientMuted,
  },
  nudgeButton: {
    padding: '8px 18px',
    fontSize: '0.9rem',
    fontWeight: 700,
    background: 'rgba(255, 255, 255, 0.14)',
    border: '1px solid rgba(255, 255, 255, 0.25)',
    borderRadius: '10px',
    color: '#fff',
    cursor: 'pointer',
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
  leaderboardButton: {
    padding: '14px 20px',
    fontSize: '0.95rem',
    fontWeight: 'bold',
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '12px',
    color: '#fff',
    cursor: 'pointer',
  },
};

export default GameEndModal;
