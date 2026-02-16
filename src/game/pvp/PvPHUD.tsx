// src/game/pvp/PvPHUD.tsx
// PvP HUD overlay - shows opponent info, timers, resign button, turn indicator

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { PvPGameSession } from './types';

interface PvPHUDProps {
  session: PvPGameSession;
  myPlayerNumber: 1 | 2;
  isMyTurn: boolean;
  gameOver: boolean;
  opponentDisconnected: boolean;
  disconnectCountdown: number | null;
  onResign: () => void;
  engineScores?: { myScore: number; opponentScore: number };
}

export function PvPHUD({
  session,
  myPlayerNumber,
  isMyTurn,
  gameOver,
  opponentDisconnected,
  disconnectCountdown,
  onResign,
  engineScores,
}: PvPHUDProps) {
  const { t } = useTranslation();
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showGameOverOverlay, setShowGameOverOverlay] = useState(true);
  const [myTimeDisplay, setMyTimeDisplay] = useState('');
  const [opponentTimeDisplay, setOpponentTimeDisplay] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const myName = myPlayerNumber === 1 ? session.player1_name : session.player2_name;
  const opponentName = myPlayerNumber === 1 ? session.player2_name : session.player1_name;
  const opponentAvatar = myPlayerNumber === 1 ? session.player2_avatar_url : session.player1_avatar_url;
  const myScore = engineScores?.myScore ?? (myPlayerNumber === 1 ? session.player1_score : session.player2_score);
  const opponentScore = engineScores?.opponentScore ?? (myPlayerNumber === 1 ? session.player2_score : session.player1_score);
  const hasTimer = session.timer_seconds > 0;

  // Format time from ms
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Update timer display every second (skip if no timer)
  useEffect(() => {
    if (!hasTimer) return;
    const updateTimers = () => {
      let myMs = myPlayerNumber === 1 ? session.player1_time_remaining_ms : session.player2_time_remaining_ms;
      let oppMs = myPlayerNumber === 1 ? session.player2_time_remaining_ms : session.player1_time_remaining_ms;

      // Subtract elapsed time for the active player
      if (session.turn_started_at && session.status === 'active') {
        const elapsed = Date.now() - new Date(session.turn_started_at).getTime();
        if (isMyTurn) {
          myMs = Math.max(0, myMs - elapsed);
        } else {
          oppMs = Math.max(0, oppMs - elapsed);
        }
      }

      setMyTimeDisplay(formatTime(myMs));
      setOpponentTimeDisplay(formatTime(oppMs));
    };

    updateTimers();
    // Only tick while game is active
    if (session.status === 'active') {
      timerRef.current = setInterval(updateTimers, 500);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session, isMyTurn, myPlayerNumber]);

  const isActive = session.status === 'active';
  const oppIsActive = isActive && !isMyTurn;
  const meIsActive = isActive && isMyTurn;

  return (
    <>
      {/* Opponent card — top left */}
      <div style={{
        ...styles.card,
        top: '12px',
        left: '12px',
        borderLeftColor: oppIsActive ? '#4ade80' : 'rgba(255,255,255,0.12)',
      }}>
        <div style={styles.cardRow}>
          {opponentAvatar ? (
            <img src={opponentAvatar} alt="" style={styles.avatar} />
          ) : (
            <div style={styles.avatarPlaceholder}>
              {(opponentName || '?')[0].toUpperCase()}
            </div>
          )}
          <div style={styles.cardInfo}>
            <div style={styles.cardName}>{opponentName || t('pvp.hud.opponent')}</div>
            <div style={styles.cardStats}>
              <span style={styles.cardScore}>{opponentScore}</span>
              {hasTimer && <span style={{
                ...styles.cardTimer,
                color: oppIsActive ? '#4ade80' : 'rgba(255,255,255,0.5)',
              }}>
                {opponentTimeDisplay}
              </span>}
            </div>
          </div>
        </div>
      </div>

      {/* My card — bottom left, above action bar */}
      <div style={{
        ...styles.card,
        bottom: '100px',
        left: '12px',
        borderLeftColor: meIsActive ? '#4ade80' : 'rgba(255,255,255,0.12)',
      }}>
        <div style={styles.cardRow}>
          <div style={styles.avatarPlaceholder}>
            {(myName || 'Y')[0].toUpperCase()}
          </div>
          <div style={styles.cardInfo}>
            <div style={styles.cardName}>{myName}</div>
            <div style={styles.cardStats}>
              <span style={styles.cardScore}>{myScore}</span>
              {hasTimer && <span style={{
                ...styles.cardTimer,
                color: meIsActive ? '#4ade80' : 'rgba(255,255,255,0.5)',
              }}>
                {myTimeDisplay}
              </span>}
            </div>
          </div>
        </div>
      </div>

      {/* Disconnect warning */}
      {opponentDisconnected && disconnectCountdown !== null && (
        <div style={styles.disconnectBanner}>
          ⚠️ {t('pvp.disconnect.warning', { seconds: disconnectCountdown })}
        </div>
      )}

      {/* Game over overlay */}
      {gameOver && session.status === 'completed' && showGameOverOverlay && (
        <div style={styles.gameOverOverlay}>
          <div style={{ ...styles.gameOverCard, position: 'relative' as const }}>
            <button
              onClick={() => setShowGameOverOverlay(false)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.7)',
                fontSize: '1rem',
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>
              {myScore > opponentScore ? '🏆' : myScore === opponentScore ? '🤝' : '😔'}
            </div>
            <h2 style={{ color: '#fff', margin: '0 0 8px 0' }}>
              {myScore > opponentScore
                ? t('pvp.gameOver.youWin')
                : myScore === opponentScore
                  ? t('pvp.gameOver.draw')
                  : t('pvp.gameOver.youLost')}
            </h2>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '8px' }}>
              {session.end_reason === 'completed' && t('pvp.gameOver.puzzleCompleted')}
              {session.end_reason === 'timeout' && t('pvp.gameOver.timeRanOut')}
              {session.end_reason === 'resign' && (myScore > opponentScore ? t('pvp.gameOver.opponentResigned') : 'You resigned')}
              {session.end_reason === 'disconnect' && t('pvp.gameOver.opponentDisconnected')}
              {session.end_reason === 'stalled' && t('pvp.gameOver.noMoreMoves')}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1.1rem', fontWeight: 700 }}>
              {myScore} - {opponentScore}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  // Floating player card
  card: {
    position: 'fixed',
    zIndex: 1000,
    background: 'rgba(15, 20, 30, 0.85)',
    backdropFilter: 'blur(12px)',
    borderRadius: '10px',
    padding: '6px 10px',
    borderLeft: '3px solid transparent',
    boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
    transition: 'border-left-color 0.3s ease',
    pointerEvents: 'auto',
    maxWidth: '160px',
  },
  cardRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  avatar: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    objectFit: 'cover' as const,
    border: '1.5px solid rgba(255,255,255,0.25)',
    flexShrink: 0,
  },
  avatarPlaceholder: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontWeight: 700,
    fontSize: '0.7rem',
    flexShrink: 0,
  },
  cardInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
    minWidth: 0,
  },
  cardName: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: 600,
    fontSize: '0.72rem',
    lineHeight: 1.2,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardStats: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  cardScore: {
    color: '#fff',
    fontWeight: 700,
    fontSize: '0.85rem',
    lineHeight: 1,
  },
  cardTimer: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    fontWeight: 600,
    lineHeight: 1,
    transition: 'color 0.3s ease',
  },
  // Resign
  resignArea: {
    position: 'fixed',
    bottom: '14px',
    right: '14px',
    zIndex: 1000,
  },
  resignButton: {
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#f87171',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    borderRadius: '8px',
    padding: '5px 12px',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: 600,
    backdropFilter: 'blur(8px)',
  },
  resignConfirm: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(15, 20, 30, 0.9)',
    backdropFilter: 'blur(12px)',
    borderRadius: '8px',
    padding: '6px 10px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  },
  resignYes: {
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '3px 10px',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: 600,
  },
  resignNo: {
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    padding: '3px 10px',
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  // Disconnect
  disconnectBanner: {
    position: 'fixed',
    top: '60px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(239, 68, 68, 0.9)',
    color: '#fff',
    padding: '6px 18px',
    borderRadius: '8px',
    fontSize: '0.8rem',
    fontWeight: 600,
    zIndex: 1001,
    backdropFilter: 'blur(8px)',
  },
  // Game over
  gameOverOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  gameOverCard: {
    background: 'linear-gradient(145deg, #2d3748, #1a202c)',
    borderRadius: '20px',
    padding: '40px',
    textAlign: 'center' as const,
    border: '1px solid rgba(255,255,255,0.15)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    minWidth: '280px',
  },
};
