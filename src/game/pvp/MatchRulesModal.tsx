// src/game/pvp/MatchRulesModal.tsx
// PvP match-opening ceremony: one modal that merges the coin-flip moment with
// the match rules — who goes first, which pieces this puzzle allows (the
// session's inventory_state IS the piece mode), the shared-pool rule, how a
// piece is formed, the no-undo warning, and the hint/check/timer limits with
// a one-line explanation of how each mechanic actually works.
//
// Shown ONCE per player per match (localStorage, per device) when a REAL PvP
// match starts fresh — never on mid-game/ended resumes, never for simulated
// vs-computer matches (those keep the old 3s coin-flip overlay). Confirm-by-
// close: every dismissal path (CTA, ✕, Escape) runs onConfirm, which marks
// the match as seen. While open, the ModalBase backdrop blocks all pointer
// interaction with the board; play resumes the moment the player confirms.

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalBase } from '../../components/ModalBase';
import { getPieceColor } from '../../components/scene/sceneMath';
import { tokens } from '../../styles/tokens';
import type { PvPGameSession } from './types';

// ---------------------------------------------------------------------------
// Seen-once persistence (per match, per player device)
// ---------------------------------------------------------------------------

const SEEN_KEY_PREFIX = 'pvp.rulesSeen.';

export function hasSeenMatchRules(sessionId: string): boolean {
  try {
    return localStorage.getItem(SEEN_KEY_PREFIX + sessionId) === '1';
  } catch {
    return false; // storage unavailable → show the ceremony (harmless)
  }
}

export function markMatchRulesSeen(sessionId: string): void {
  try {
    localStorage.setItem(SEEN_KEY_PREFIX + sessionId, '1');
  } catch {
    // Storage unavailable — the modal may show again next visit; acceptable.
  }
}

// ---------------------------------------------------------------------------
// Inventory interpretation
// ---------------------------------------------------------------------------

// buildInventory (GamePage) uses 99 as "effectively unlimited" for the
// duplicates / Choose Pieces modes; a 100-sphere puzzle needs 25 pieces total.
const UNLIMITED_COUNT = 99;
const FULL_SET_SIZE = 25;

type PoolVariant = 'once' | 'multi' | 'unlimited' | 'mixed';

interface PieceEntry {
  pieceId: string;
  count: number;
}

function readAllowedPieces(inventory: Record<string, number> | null | undefined): PieceEntry[] {
  if (!inventory) return [];
  return Object.entries(inventory)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([pieceId, count]) => ({ pieceId, count }))
    .sort((a, b) => a.pieceId.localeCompare(b.pieceId));
}

function poolVariant(pieces: PieceEntry[]): { variant: PoolVariant; count: number } {
  const counts = new Set(pieces.map((p) => p.count));
  if (counts.size === 1) {
    const c = pieces[0]?.count ?? 1;
    if (c === 1) return { variant: 'once', count: 1 };
    if (c >= UNLIMITED_COUNT) return { variant: 'unlimited', count: c };
    return { variant: 'multi', count: c };
  }
  return { variant: 'mixed', count: 0 };
}

/** number → '#rrggbb' */
function hexColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Legible letter color on a vibrant chip background. */
function chipTextColor(color: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? '#1a202c' : '#ffffff';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface MatchRulesModalProps {
  isOpen: boolean;
  session: PvPGameSession;
  /** The viewing player's seat in the session row (1 = host, 2 = invitee). */
  myNumber: 1 | 2;
  /** Confirm-by-close: fires for the CTA, the ✕ and Escape alike. */
  onConfirm: () => void;
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: tokens.text.onGradientMuted,
  margin: '0 0 8px 0',
};

const descStyle: React.CSSProperties = {
  margin: '2px 0 0 0',
  fontSize: '0.8rem',
  lineHeight: 1.45,
  color: tokens.text.onGradientMuted,
};

const badgeStyle: React.CSSProperties = {
  marginLeft: 'auto',
  flexShrink: 0,
  fontSize: '0.78rem',
  fontWeight: 700,
  color: '#fff',
  background: 'rgba(255,255,255,0.14)',
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: `${tokens.radius.pill}px`,
  padding: '2px 10px',
  whiteSpace: 'nowrap',
};

export const MatchRulesModal: React.FC<MatchRulesModalProps> = ({
  isOpen,
  session,
  myNumber,
  onConfirm,
}) => {
  const { t } = useTranslation();

  const opponentName =
    (myNumber === 1 ? session.player2_name : session.player1_name) ||
    t('pvp.hud.opponent');
  const iGoFirst = session.first_player === myNumber;

  const pieces = useMemo(
    () => readAllowedPieces(session.inventory_state),
    [session.inventory_state]
  );
  const { variant, count } = useMemo(() => poolVariant(pieces), [pieces]);
  const allPieces = pieces.length >= FULL_SET_SIZE;

  const poolSentence =
    variant === 'once'
      ? t('pvp.matchRules.poolOnce')
      : variant === 'multi'
        ? t('pvp.matchRules.poolMulti', { count })
        : variant === 'unlimited'
          ? t('pvp.matchRules.poolUnlimited')
          : t('pvp.matchRules.poolMixed');

  const hintBadge =
    session.hint_limit === 0
      ? t('pvp.matchRules.unlimited')
      : t('pvp.matchRules.perPlayer', { count: session.hint_limit });
  const checkBadge =
    session.check_limit === 0
      ? t('pvp.matchRules.unlimited')
      : t('pvp.matchRules.perPlayer', { count: session.check_limit });
  const timerBadge =
    session.timer_seconds === 0
      ? t('pvp.matchRules.noTimer')
      : t('pvp.matchRules.timerMinutes', {
          count: Math.max(1, Math.round(session.timer_seconds / 60)),
        });

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onConfirm}
      dismissOnBackdrop={false}
      size="md"
      headerIcon="⚔️"
      title={t('pvp.matchRules.title', { name: opponentName })}
      subtitle={
        <span
          style={{
            color: iGoFirst ? '#4ade80' : '#f87171',
            fontWeight: 700,
          }}
        >
          🪙{' '}
          {iGoFirst
            ? t('pvp.coinFlip.youGoFirst')
            : t('pvp.coinFlip.opponentGoesFirst', { name: opponentName })}
        </span>
      }
      footer={
        <button
          onClick={onConfirm}
          style={{
            width: '100%',
            background: tokens.gradient.success,
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '13px 20px',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          {t('pvp.matchRules.cta')}
        </button>
      }
    >
      {/* ---- The goal (verified against GameMachine: +1 per placement when
          scoringEnabled — always true in PvP; end on puzzle-complete or on a
          pass with no hints/checks left ("stalled"); computeWinners = highest
          score, ties possible) ---- */}
      <p
        style={{
          margin: '0 0 16px 0',
          fontSize: '0.88rem',
          lineHeight: 1.5,
          color: tokens.text.onGradient,
        }}
      >
        <span aria-hidden="true">🎯 </span>
        {t('pvp.matchRules.goal')}
      </p>

      {/* ---- Allowed pieces ---- */}
      <div style={{ marginBottom: '16px' }}>
        <p style={sectionLabelStyle}>
          {t('pvp.matchRules.piecesTitle')}
          {allPieces && (
            <span style={{ textTransform: 'none', letterSpacing: 'normal', fontWeight: 600 }}>
              {' · '}
              {t('pvp.matchRules.allPieces')}
            </span>
          )}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {pieces.map(({ pieceId, count: pieceCount }) => {
            const color = getPieceColor(pieceId);
            const showMultiplier = pieceCount > 1 && pieceCount < UNLIMITED_COUNT;
            return (
              <span
                key={pieceId}
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '32px',
                  height: '32px',
                  padding: showMultiplier ? '0 6px' : 0,
                  borderRadius: '8px',
                  background: hexColor(color),
                  border: '1px solid rgba(255,255,255,0.35)',
                  color: chipTextColor(color),
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                {pieceId}
                {showMultiplier && (
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, marginLeft: '2px' }}>
                    ×{pieceCount}
                  </span>
                )}
              </span>
            );
          })}
        </div>
        <p style={{ ...descStyle, marginTop: '8px' }}>{poolSentence}</p>
      </div>

      {/* ---- How to form a piece + no-undo warning ---- */}
      <div style={{ marginBottom: '16px' }}>
        <p style={{ ...descStyle, margin: 0 }}>
          <span aria-hidden="true">👆 </span>
          {t('pvp.matchRules.howToForm')}
        </p>
        <p
          style={{
            margin: '8px 0 0 0',
            fontSize: '0.8rem',
            lineHeight: 1.45,
            fontWeight: 700,
            color: '#fbbf24',
          }}
        >
          <span aria-hidden="true">⚠️ </span>
          {t('pvp.matchRules.noUndo')}
        </p>
      </div>

      {/* ---- Limits + how the mechanics work ---- */}
      <div>
        <p style={sectionLabelStyle}>{t('pvp.matchRules.limitsTitle')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span aria-hidden="true">💡</span>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                {t('pvp.matchRules.hintsLabel')}
              </span>
              <span style={badgeStyle}>{hintBadge}</span>
            </div>
            <p style={descStyle}>{t('pvp.matchRules.hintDesc')}</p>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span aria-hidden="true">🔍</span>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                {t('pvp.matchRules.checksLabel')}
              </span>
              <span style={badgeStyle}>{checkBadge}</span>
            </div>
            <p style={descStyle}>{t('pvp.matchRules.checkDesc')}</p>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span aria-hidden="true">⏱</span>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                {t('pvp.matchRules.timerLabel')}
              </span>
              <span style={badgeStyle}>{timerBadge}</span>
            </div>
            {session.timer_seconds > 0 && (
              <p style={descStyle}>{t('pvp.matchRules.timerDesc')}</p>
            )}
          </div>
        </div>
      </div>
    </ModalBase>
  );
};
