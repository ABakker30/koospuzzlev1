// src/game/ui/GameHUD.tsx
// Game HUD - Displays scoreboard, turn info, and action buttons
// Phase 2D: Added narration lane + score pulse animation

import React from 'react';
import type { GameState, PlayerState, PlayerId } from '../contracts/GameState';
import { getActivePlayer, isHumanTurn } from '../engine/GameMachine';
import { NarrationLane } from './NarrationLane';

interface GameHUDProps {
  gameState: GameState;
  onHintClick: () => void;
  onCheckClick: () => void;
  onPassClick: () => void;
  scorePulse?: Record<PlayerId, number>;
}

export function GameHUD({ gameState, onHintClick, onCheckClick, onPassClick, scorePulse = {} }: GameHUDProps) {
  const activePlayer = getActivePlayer(gameState);
  const humanTurn = isHumanTurn(gameState);
  
  return (
    <>
      {/* Top Scoreboard */}
      <div style={styles.scoreboard}>
        {gameState.players.map((player, idx) => (
          <PlayerScoreCard
            key={player.id}
            player={player}
            isActive={idx === gameState.activePlayerIndex}
            showTimer={gameState.settings.timerMode === 'timed'}
            pulseKey={scorePulse[player.id] ?? 0}
          />
        ))}
      </div>

      {/* Turn Indicator */}
      <div style={styles.turnIndicator}>
        <span style={styles.turnNumber}>Turn {gameState.turnNumber}</span>
        <span style={styles.turnPlayer}>
          {activePlayer.name}'s turn
        </span>
      </div>

      {/* UI Message */}
      {gameState.uiMessage && (
        <div style={styles.uiMessage}>
          {gameState.uiMessage}
        </div>
      )}

      {/* Narration Lane (Phase 2D) */}
      <div style={styles.narrationContainer}>
        <NarrationLane entries={gameState.narration} maxVisible={5} />
      </div>

      {/* Action Buttons (only show for human's turn, disabled during repair/resolving) */}
      {humanTurn && (gameState.phase === 'in_turn' || gameState.phase === 'resolving') && (
        <div style={styles.actionBar}>
          <ActionButton
            icon="💡"
            label="Hint"
            count={activePlayer.hintsRemaining}
            onClick={onHintClick}
            disabled={
              activePlayer.hintsRemaining <= 0 || 
              gameState.subphase === 'repairing' || 
              gameState.phase === 'resolving'
            }
          />
          <ActionButton
            icon="✓"
            label="Check"
            count={activePlayer.checksRemaining}
            onClick={onCheckClick}
            disabled={
              activePlayer.checksRemaining <= 0 || 
              gameState.subphase === 'repairing' || 
              gameState.phase === 'resolving'
            }
          />
          <ActionButton
            icon="⏭"
            label="Pass"
            onClick={onPassClick}
            disabled={gameState.subphase === 'repairing' || gameState.phase === 'resolving'}
          />
        </div>
      )}

      {/* Game Phase Indicator */}
      {gameState.phase === 'ended' && (
        <div style={styles.gameEndOverlay}>
          <div style={styles.gameEndCard}>
            <h2 style={styles.gameEndTitle}>Game Over!</h2>
            <div style={styles.finalScores}>
              {[...gameState.players]
                .sort((a, b) => b.score - a.score)
                .map((player, idx) => (
                  <div key={player.id} style={styles.finalScoreRow}>
                    <span style={styles.rank}>{idx + 1}.</span>
                    <span style={{ ...styles.playerName, color: player.color }}>
                      {player.name}
                    </span>
                    <span style={styles.finalScore}>{player.score} pts</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface PlayerScoreCardProps {
  player: PlayerState;
  isActive: boolean;
  showTimer: boolean;
  pulseKey?: number;
}

function PlayerScoreCard({ player, isActive, showTimer, pulseKey = 0 }: PlayerScoreCardProps) {
  const formatTime = (seconds: number | null): string => {
    if (seconds === null) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        ...styles.playerCard,
        ...(isActive ? styles.playerCardActive : {}),
        borderColor: player.color,
      }}
    >
      <div style={styles.playerCardHeader}>
        <div
          style={{
            ...styles.playerDot,
            backgroundColor: player.color,
          }}
        />
        <span style={styles.playerCardName}>{player.name}</span>
        {player.type === 'ai' && <span style={styles.aiTag}>AI</span>}
      </div>
      <AnimatedScore score={player.score} pulseKey={pulseKey} />
      <div style={styles.playerCounters}>
        <span title="Hints">💡 {player.hintsRemaining}</span>
        <span title="Checks">✓ {player.checksRemaining}</span>
      </div>
      {showTimer && player.clockSecondsRemaining !== null && (
        <div style={styles.playerTimer}>
          ⏱ {formatTime(player.clockSecondsRemaining)}
        </div>
      )}
    </div>
  );
}

// AnimatedScore component with pulse animation (Phase 2D-2)
interface AnimatedScoreProps {
  score: number;
  pulseKey: number;
}

function AnimatedScore({ score, pulseKey }: AnimatedScoreProps) {
  const [isPulsing, setIsPulsing] = React.useState(false);
  const lastPulseKeyRef = React.useRef(pulseKey);
  
  React.useEffect(() => {
    if (pulseKey !== lastPulseKeyRef.current) {
      lastPulseKeyRef.current = pulseKey;
      setIsPulsing(true);
      const timeout = setTimeout(() => setIsPulsing(false), 300);
      return () => clearTimeout(timeout);
    }
  }, [pulseKey]);
  
  return (
    <div 
      style={{
        ...styles.playerScore,
        ...(isPulsing ? styles.playerScorePulse : {}),
      }}
    >
      {score}
    </div>
  );
}

interface ActionButtonProps {
  icon: string;
  label: string;
  count?: number;
  onClick: () => void;
  disabled?: boolean;
}

function ActionButton({ icon, label, count, onClick, disabled }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.actionButton,
        ...(disabled ? styles.actionButtonDisabled : {}),
      }}
    >
      <span style={styles.actionIcon}>{icon}</span>
      <span style={styles.actionLabel}>{label}</span>
      {count !== undefined && (
        <span style={styles.actionCount}>{count}</span>
      )}
    </button>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  scoreboard: {
    position: 'fixed',
    top: '60px', // Below header
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '12px',
    zIndex: 100,
    padding: '8px',
  },
  playerCard: {
    background: 'rgba(30, 30, 40, 0.95)',
    borderRadius: '12px',
    border: '2px solid transparent',
    padding: '12px 16px',
    minWidth: '100px',
    textAlign: 'center',
    backdropFilter: 'blur(8px)',
  },
  playerCardActive: {
    boxShadow: '0 0 20px rgba(102, 126, 234, 0.4)',
    background: 'rgba(40, 40, 60, 0.95)',
  },
  playerCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    marginBottom: '4px',
  },
  playerDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  playerCardName: {
    color: '#fff',
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  aiTag: {
    fontSize: '0.6rem',
    background: 'rgba(255,255,255,0.2)',
    padding: '1px 4px',
    borderRadius: '4px',
    color: 'rgba(255,255,255,0.7)',
  },
  playerScore: {
    fontSize: '1.8rem',
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1.2,
    transition: 'all 0.2s ease',
  },
  playerScorePulse: {
    transform: 'scale(1.3)',
    color: '#fbbf24',
    textShadow: '0 0 12px rgba(251, 191, 36, 0.8)',
  },
  playerCounters: {
    display: 'flex',
    justifyContent: 'center',
    gap: '10px',
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.6)',
    marginTop: '4px',
  },
  playerTimer: {
    marginTop: '4px',
    fontSize: '0.8rem',
    color: 'rgba(255,255,255,0.8)',
    fontFamily: 'monospace',
  },
  turnIndicator: {
    position: 'fixed',
    top: '180px',
    left: '50%',
    transform: 'translateX(-50%)',
    textAlign: 'center',
    zIndex: 100,
  },
  turnNumber: {
    display: 'block',
    fontSize: '0.7rem',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  turnPlayer: {
    display: 'block',
    fontSize: '0.9rem',
    color: '#fff',
    fontWeight: 500,
  },
  uiMessage: {
    position: 'fixed',
    bottom: '120px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(30, 30, 40, 0.95)',
    borderRadius: '8px',
    padding: '10px 20px',
    color: '#fff',
    fontSize: '0.9rem',
    maxWidth: '400px',
    textAlign: 'center',
    backdropFilter: 'blur(8px)',
    zIndex: 100,
    animation: 'fadeIn 0.3s ease',
  },
  narrationContainer: {
    position: 'fixed',
    top: '220px',
    right: '20px',
    zIndex: 100,
  },
  actionBar: {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '12px',
    zIndex: 100,
    padding: '12px 16px',
    background: 'rgba(30, 30, 40, 0.95)',
    borderRadius: '16px',
    backdropFilter: 'blur(8px)',
  },
  actionButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '12px 20px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '12px',
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minWidth: '70px',
  },
  actionButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  actionIcon: {
    fontSize: '1.5rem',
  },
  actionLabel: {
    fontSize: '0.75rem',
    fontWeight: 500,
  },
  actionCount: {
    fontSize: '0.7rem',
    background: 'rgba(255,255,255,0.2)',
    padding: '1px 6px',
    borderRadius: '8px',
  },
  gameEndOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  gameEndCard: {
    background: 'linear-gradient(145deg, rgba(40, 40, 50, 0.98), rgba(30, 30, 40, 0.98))',
    borderRadius: '20px',
    padding: '32px 40px',
    textAlign: 'center',
    minWidth: '300px',
  },
  gameEndTitle: {
    color: '#fff',
    fontSize: '1.5rem',
    margin: '0 0 20px',
  },
  finalScores: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  finalScoreRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '8px',
  },
  rank: {
    color: 'rgba(255,255,255,0.5)',
    width: '24px',
  },
  playerName: {
    flex: 1,
    textAlign: 'left',
    fontWeight: 600,
  },
  finalScore: {
    color: '#fff',
    fontWeight: 700,
  },
};
