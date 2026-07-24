// src/game/pvp/PvPHUD.tsx
// PvP HUD overlay - shows opponent info, timers, resign button, turn indicator

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../styles/tokens';
import type { PvPGameSession } from './types';

// ============================================================================
// OPPONENT EVENT TOAST
// ============================================================================
// The opponent-action lane (top center, shares its slot with the turn pill)
// carries the resource economy: hint/check events arrive as styled pills with
// the "N left" fragment. Plain strings from legacy callers (chat/moderation
// notices) flow through the 'neutral' variant unchanged.

export type OpponentToastVariant = 'neutral' | 'hint' | 'checkCorrect' | 'checkWrong';

export interface OpponentToast {
  /** Main line (already localized). */
  text: string;
  /** Leading emoji (💡 / 🔍) rendered ahead of the text. */
  icon?: string;
  /** Trailing "N left" fragment (already localized) — absent when unlimited. */
  suffix?: string;
  variant: OpponentToastVariant;
  /** This event burned the player's LAST hint/check — escalated styling. */
  last?: boolean;
  /** Render nonce so back-to-back toasts restart the entrance animation. */
  key?: number;
}

// ============================================================================
// BUSY PILL (in-flight hint / check / sync feedback)
// ============================================================================
// Occupies the turn-pill slot of the top-center lane while a local action is
// grinding (hint search, board check, engine catch-up). Lane hierarchy:
// opponent toast > busy pill > turn pill. Exported standalone so non-PvP
// GamePage renders (solo has hints too) can reuse the exact same pill.

export interface BusyNotice {
  /** Main line (already localized), e.g. "Looking for a hint…". */
  text: string;
  /** Leading emoji (💡 / 🔍) — omitted for the sync notice (spinner carries it). */
  icon?: string;
}

export function BusyPill({ notice, top = 72 }: { notice: BusyNotice; top?: number }) {
  return (
    <>
      <style>{`
        @keyframes kpBusySpin {
          to { transform: rotate(360deg); }
        }
        @keyframes kpBusyIn {
          from { opacity: 0; transform: translateX(-50%) scale(0.9); }
          to   { opacity: 1; transform: translateX(-50%) scale(1); }
        }
      `}</style>
      <div style={{ ...styles.busyPill, top: `${top}px` }} role="status">
        <span style={styles.busySpinner} aria-hidden="true" />
        {notice.icon && <span style={styles.toastIcon}>{notice.icon}</span>}
        {notice.text}
      </div>
    </>
  );
}

interface PvPHUDProps {
  session: PvPGameSession;
  myPlayerNumber: 1 | 2;
  isMyTurn: boolean;
  gameOver: boolean;
  opponentDisconnected: boolean;
  disconnectCountdown: number | null;
  onResign: () => void;
  engineScores?: { myScore: number; opponentScore: number };
  opponentNotification?: OpponentToast | null;
  /** In-flight hint/check/sync notice — takes the turn pill's lane slot. */
  busyNotice?: BusyNotice | null;
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
  busyNotice,
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

  // Whose-turn treatment: the active card gets a full 1px green ring (drawn
  // as a spread box-shadow so it can't fight the per-side accent borders or
  // shift layout) + a soft breathing outer glow; the waiting card dims
  // slightly. All CSS-only — no layout jumps.
  const activeCardStyle: React.CSSProperties = {
    animation: 'pvpCardBreathe 2s ease-in-out infinite',
  };
  const idleCardStyle: React.CSSProperties = {
    // Only dim while the game is running (both cards full-strength when over).
    opacity: isActive ? 0.75 : 1,
  };

  return (
    <>
      <style>{`
        @keyframes pvpCardBreathe {
          0%, 100% { box-shadow: 0 0 0 1px rgba(74,222,128,0.5), 0 2px 12px rgba(0,0,0,0.4), 0 0 6px 1px rgba(74,222,128,0.22); }
          50%      { box-shadow: 0 0 0 1px rgba(74,222,128,0.5), 0 2px 12px rgba(0,0,0,0.4), 0 0 16px 4px rgba(74,222,128,0.5); }
        }
        @keyframes pvpPillBreathe {
          0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
          50%      { box-shadow: 0 0 12px 2px rgba(74,222,128,0.35); }
        }
        @keyframes pvpToastIn {
          from { opacity: 0; transform: translateX(-50%) scale(0.9); }
          to   { opacity: 1; transform: translateX(-50%) scale(1); }
        }
        @keyframes pvpToastPop {
          0%   { opacity: 0; transform: translateX(-50%) scale(0.7); }
          60%  { opacity: 1; transform: translateX(-50%) scale(1.08); }
          100% { opacity: 1; transform: translateX(-50%) scale(1); }
        }
        @keyframes pvpToastGlowAmber {
          0%, 100% { box-shadow: 0 4px 16px rgba(0,0,0,0.4); }
          50%      { box-shadow: 0 4px 16px rgba(0,0,0,0.4), 0 0 18px 4px rgba(251,191,36,0.55); }
        }
        @keyframes pvpToastGlowRed {
          0%, 100% { box-shadow: 0 4px 16px rgba(0,0,0,0.4); }
          50%      { box-shadow: 0 4px 16px rgba(0,0,0,0.4), 0 0 18px 4px rgba(248,113,113,0.55); }
        }
      `}</style>

      {/* Opponent card — top, left of center */}
      <div style={{
        ...styles.card,
        top: '12px',
        right: 'calc(50% + 12px)',
        borderLeftColor: oppIsActive ? '#4ade80' : 'rgba(255,255,255,0.12)',
        ...(oppIsActive ? activeCardStyle : idleCardStyle),
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
              <span title={t('hud.hintsUsed')}>💡{oppHintsUsed}</span>
              <span title={t('hud.checksUsed')}>🔍{oppChecksUsed}</span>
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
        ...(meIsActive ? activeCardStyle : idleCardStyle),
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
              <span title={t('hud.hintsUsed')}>💡{myHintsUsed}</span>
              <span title={t('hud.checksUsed')}>🔍{myChecksUsed}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Whose-turn pill — compact, centered under the player cards. Green +
          gentle breathing glow on your own turn; neutral/dim while waiting.
          Hidden while an opponent-action toast OR a busy pill occupies the
          same lane (hierarchy: toast > busy > turn). Also covers simulated
          (vs-computer) matches — they share this HUD and have real turns. */}
      {isActive && !opponentNotification && !busyNotice && (
        <div style={{
          ...styles.turnPill,
          ...(isMyTurn ? styles.turnPillMine : styles.turnPillTheirs),
        }}>
          {isMyTurn
            ? t('pvp.turn.yours')
            : t('pvp.turn.waiting', { name: opponentName || t('pvp.hud.opponent') })}
        </div>
      )}

      {/* In-flight busy pill — takes the turn pill's slot while a hint/check/
          sync grinds; still yields to opponent toasts (which carry game
          events and must never be masked by a spinner). */}
      {busyNotice && !opponentNotification && <BusyPill notice={busyNotice} />}

      {/* Opponent action notification — styled event pill. Variant tint +
          escalated "last one" treatment (hotter tint, pop-in, brief glow).
          Keyed by nonce so consecutive toasts restart the entrance. */}
      {opponentNotification && (
        <div
          key={opponentNotification.key ?? opponentNotification.text}
          style={{
            ...styles.opponentNotification,
            ...toastVariantStyles[opponentNotification.variant ?? 'neutral'],
            ...(opponentNotification.last
              ? toastLastStyles[opponentNotification.variant] ?? {}
              : {}),
          }}
        >
          {opponentNotification.icon && (
            <span style={styles.toastIcon}>{opponentNotification.icon}</span>
          )}
          {opponentNotification.text}
          {opponentNotification.suffix && (
            <span style={styles.toastSuffix}>{' · '}{opponentNotification.suffix}</span>
          )}
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
    transition: 'border-left-color 0.3s ease, border-right-color 0.3s ease, opacity 0.3s ease',
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
  // Whose-turn pill
  turnPill: {
    position: 'fixed',
    top: '72px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 999,
    padding: '4px 14px',
    borderRadius: '999px',
    fontSize: '0.75rem',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
    maxWidth: '80vw',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    backdropFilter: 'blur(8px)',
    pointerEvents: 'none' as const,
    transition: 'color 0.3s ease, background 0.3s ease, border-color 0.3s ease',
  },
  turnPillMine: {
    background: 'rgba(74,222,128,0.16)',
    color: '#4ade80',
    border: '1px solid rgba(74,222,128,0.45)',
    animation: 'pvpPillBreathe 2s ease-in-out infinite',
  },
  turnPillTheirs: {
    background: 'rgba(15,20,30,0.85)',
    color: 'rgba(255,255,255,0.55)',
    border: '1px solid rgba(255,255,255,0.12)',
  },
  // In-flight busy pill — neutral member of the pill family (turn pill /
  // toast). Non-interactive by design: it reports work, it isn't a control.
  busyPill: {
    position: 'fixed',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 999,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 14px',
    borderRadius: '999px',
    background: 'rgba(15, 20, 30, 0.88)',
    color: 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(255,255,255,0.16)',
    backdropFilter: 'blur(8px)',
    fontSize: '0.75rem',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
    maxWidth: '90vw',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    pointerEvents: 'none' as const,
    animation: 'kpBusyIn 0.2s ease-out',
  },
  // Tiny CSS ring spinner — no assets.
  busySpinner: {
    width: '12px',
    height: '12px',
    flexShrink: 0,
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.25)',
    borderTopColor: 'rgba(255,255,255,0.9)',
    animation: 'kpBusySpin 0.8s linear infinite',
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
  // Opponent event toast — base pill (neutral variant look). Kept ONE line on
  // small phones: nowrap + viewport-capped width + ellipsis backstop (names
  // are additionally clamped at the callsite).
  opponentNotification: {
    position: 'fixed',
    top: '52px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(15, 20, 30, 0.9)',
    backdropFilter: 'blur(12px)',
    color: '#fbbf24',
    padding: '7px 16px',
    borderRadius: `${tokens.radius.pill}px`,
    fontSize: '0.8rem',
    fontWeight: 600,
    zIndex: 1001,
    border: '1px solid rgba(251, 191, 36, 0.3)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    animation: 'pvpToastIn 0.2s ease-out',
    whiteSpace: 'nowrap' as const,
    maxWidth: '94vw',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  toastIcon: {
    marginRight: '6px',
  },
  toastSuffix: {
    fontWeight: 500,
    opacity: 0.8,
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

// Per-variant toast tints (rgba families of tokens.color.warning / danger and
// the teal/info family). 'neutral' keeps the base amber-on-dark look so legacy
// string toasts (chat + moderation notices) render exactly as before.
const toastVariantStyles: Record<OpponentToastVariant, React.CSSProperties> = {
  neutral: {},
  // Warm amber — tokens.color.warning (#f59e0b) family.
  hint: {
    background: 'rgba(245, 158, 11, 0.18)',
    color: '#fcd34d',
    border: '1px solid rgba(245, 158, 11, 0.45)',
  },
  // Teal/info tint, weightier — a correct call is the drama.
  checkCorrect: {
    background: 'rgba(20, 184, 166, 0.2)',
    color: '#5eead4',
    border: '1px solid rgba(45, 212, 191, 0.5)',
    fontWeight: 700,
  },
  // Muted — a whiffed check reads as a fizzle.
  checkWrong: {
    background: 'rgba(15, 20, 30, 0.88)',
    color: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(255,255,255,0.14)',
  },
};

// "Last one" escalation — hotter tint + springy pop-in + two glow pulses.
// Only consuming events can be last (hint used / wrong check), so only those
// variants carry an escalated skin.
const toastLastStyles: Partial<Record<OpponentToastVariant, React.CSSProperties>> = {
  hint: {
    background: 'rgba(245, 158, 11, 0.32)',
    color: '#fde68a',
    border: '1px solid rgba(251, 191, 36, 0.85)',
    fontWeight: 700,
    animation: 'pvpToastPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), pvpToastGlowAmber 1.3s ease-in-out 2',
  },
  // tokens.color.danger (#ef4444) family — burning the last check hurts.
  checkWrong: {
    background: 'rgba(239, 68, 68, 0.28)',
    color: '#fecaca',
    border: '1px solid rgba(248, 113, 113, 0.75)',
    fontWeight: 700,
    animation: 'pvpToastPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), pvpToastGlowRed 1.3s ease-in-out 2',
  },
};
