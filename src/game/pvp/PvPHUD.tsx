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
  opponentNotification?: string | null;
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
  opponentNotification,
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

  const myHintsUsed = myPlayerNumber === 1 ? session.player1_hints_used : session.player2_hints_used;
  const myChecksUsed = myPlayerNumber === 1 ? session.player1_checks_used : session.player2_checks_used;
  const oppHintsUsed = myPlayerNumber === 1 ? session.player2_hints_used : session.player1_hints_used;
  const oppChecksUsed = myPlayerNumber === 1 ? session.player2_checks_used : session.player1_checks_used;

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
      {/* Opponent card — top, left of center */}
      <div style={{
        ...styles.card,
        top: '12px',
        right: 'calc(50% + 12px)',
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
            <div style={styles.cardInventory}>
              <span title="Hints used">💡{oppHintsUsed}</span>
              <span title="Checks used">🔍{oppChecksUsed}</span>
            </div>
          </div>
        </div>
      </div>

      {/* My card — top, right of center */}
      <div style={{
        ...styles.card,
        top: '12px',
        left: 'calc(50% + 12px)',
        borderLeft: 'none',
        borderRight: `3px solid ${meIsActive ? '#4ade80' : 'rgba(255,255,255,0.12)'}`,
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
            <div style={styles.cardInventory}>
              <span title="Hints used">💡{myHintsUsed}</span>
              <span title="Checks used">🔍{myChecksUsed}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Opponent action notification */}
      {opponentNotification && (
        <div style={styles.opponentNotification}>
          {opponentNotification}
        </div>
      )}

      {/* Disconnect warning */}
      {opponentDisconnected && disconnectCountdown !== null && (
        <div style={styles.disconnectBanner}>
          ⚠️ {t('pvp.disconnect.warning', { seconds: disconnectCountdown })}
        </div>
      )}

      {/* Game over overlay removed — GameEndModal handles end-of-game display */}
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
  cardInventory: {
    display: 'flex',
    gap: '6px',
    fontSize: '0.65rem',
    color: 'rgba(255,255,255,0.5)',
    marginTop: '1px',
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
  opponentNotification: {
    position: 'fixed',
    top: '52px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(15, 20, 30, 0.9)',
    backdropFilter: 'blur(12px)',
    color: '#fbbf24',
    padding: '8px 20px',
    borderRadius: '10px',
    fontSize: '0.85rem',
    fontWeight: 600,
    zIndex: 1001,
    border: '1px solid rgba(251, 191, 36, 0.3)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    animation: 'fadeInOut 3s ease-in-out',
    whiteSpace: 'nowrap' as const,
  },
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
