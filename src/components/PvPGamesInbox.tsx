// PvPGamesInbox — Home strip listing every open PvP game this player is in
// (async-first PvP Phase 2b). Supersedes PvPResumeBanner (single host
// breadcrumb) now that turn-at-your-leisure play means multiple concurrent
// games. Sources are unioned:
//   • the local 'pvp.mySessions' store (guests live off this entirely — their
//     anonymous auth.uid() makes the per-id fetches pass RLS), and
//   • when any auth session exists, a query of game_sessions where the user
//     is player1 or player2 (covers games created on other devices).
// Rows show opponent, puzzle, a turn chip and an unread-chat badge; tapping
// opens /game/:puzzleId?session=<id> where GamePage's session routing
// reattaches. Games with no activity for 14 days render dimmed "inactive" —
// tapping one marks it abandoned via the existing cancel api (open-time
// reaping, no cron), which cleans it out of both players' inboxes.
// Fires after mount and degrades silently on any error — never Home jank.

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { cancelPvPSession, countSessionMoves, endPvPGame } from '../game/pvp/pvpApi';
import type { PvPGameSession } from '../game/pvp/types';
import {
  readMySessions,
  removeMySession,
} from '../game/pvp/mySessionsStore';
import { clearHostSessionPointer } from '../game/pvp/hostSessionPointer';
import { countUnreadMessages, clearChatSeen } from '../game/pvp/gameMessages';
import { getPuzzleById } from '../api/puzzles';

// 14 days with no move → the game renders as inactive and is reaped on open.
const INACTIVE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ROWS = 10;

// Session-lifetime cache: puzzle id -> display name (avoids re-fetching on
// every Home visit). Same pattern as the old resume banner.
const puzzleNameCache = new Map<string, string>();

interface InboxRow {
  sessionId: string;
  puzzleId: string;
  puzzleName: string;
  opponentName: string | null;
  status: 'yourTurn' | 'theirTurn' | 'waiting';
  // Close-action inputs: raw DB status decides cancel-vs-resign, myNum picks
  // the winner on resign, scores are frozen as the final result.
  rawStatus: 'waiting' | 'active';
  myNum: 1 | 2;
  p1Score: number;
  p2Score: number;
  lastActivityAt: number;
  inactive: boolean;
  unread: number;
}

/** Latest move timestamp, else started_at/created_at (the display rule). */
async function lastActivityOf(session: PvPGameSession): Promise<number> {
  const fallback = Date.parse(session.started_at ?? session.created_at) || Date.now();
  try {
    const { data, error } = await supabase
      .from('game_moves')
      .select('created_at')
      .eq('session_id', session.id)
      .order('move_number', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return fallback;
    return Date.parse(data[0].created_at) || fallback;
  } catch {
    return fallback;
  }
}

export const PvPGamesInbox: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [reapingId, setReapingId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  // Two-tap close: first ✕ tap arms a "Sure?" chip (auto-disarms), second
  // tap executes. No modal — the pill is small, the action stays in place.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const confirmTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Any auth session works — real accounts AND invite-link guests
        // (anonymous sessions have a uid; RLS scopes their reads the same).
        const { data: { session: authSession } } = await supabase.auth.getSession();
        const uid = authSession?.user?.id ?? null;

        const local = readMySessions();
        const byId = new Map<string, PvPGameSession>();

        // Server union: everything where I'm a player, still open.
        if (uid) {
          const { data, error } = await supabase
            .from('game_sessions')
            .select('*')
            .or(`player1_id.eq.${uid},player2_id.eq.${uid}`)
            .in('status', ['waiting', 'active'])
            .order('updated_at', { ascending: false })
            .limit(25);
          if (!error && data) {
            for (const s of data as PvPGameSession[]) byId.set(s.id, s);
          }
        }

        // Local entries the query didn't cover (or no uid at all): fetch by id.
        const missing = local.filter((e) => !byId.has(e.sessionId));
        if (missing.length > 0 && uid) {
          const { data, error } = await supabase
            .from('game_sessions')
            .select('*')
            .in('id', missing.map((e) => e.sessionId));
          if (!error && data) {
            for (const s of data as PvPGameSession[]) byId.set(s.id, s);
          }
          // Self-pruning: locally-remembered sessions that are terminal,
          // gone, or not mine anymore drop out of the store.
          for (const entry of missing) {
            const s = byId.get(entry.sessionId);
            const mine = s && (s.player1_id === uid || s.player2_id === uid);
            const open = s && (s.status === 'waiting' || s.status === 'active');
            if (!s || !mine || !open) {
              removeMySession(entry.sessionId);
              clearChatSeen(entry.sessionId);
              if (s) byId.delete(entry.sessionId);
            }
          }
        }
        if (cancelled || !uid) {
          if (!uid && !cancelled) setRows([]);
          return;
        }

        const open = Array.from(byId.values()).filter(
          (s) =>
            !s.is_simulated &&
            (s.status === 'active' || s.status === 'waiting') &&
            (s.player1_id === uid || s.player2_id === uid) &&
            // An expired unanswered invite reads as closed, not "waiting".
            !(
              s.status === 'waiting' &&
              s.invite_expires_at &&
              new Date(s.invite_expires_at) < new Date()
            )
        );

        const built = await Promise.all(
          open.map(async (s): Promise<InboxRow> => {
            const myNum = s.player1_id === uid ? 1 : 2;
            const opponentName = myNum === 1 ? s.player2_name : s.player1_name;
            const [lastActivityAt, unread] = await Promise.all([
              lastActivityOf(s),
              s.status === 'active' ? countUnreadMessages(s.id, uid) : Promise.resolve(0),
            ]);

            let puzzleName = s.puzzle_name || puzzleNameCache.get(s.puzzle_id) || '';
            if (!puzzleName) {
              try {
                const puzzle = await getPuzzleById(s.puzzle_id);
                puzzleName = puzzle?.name || '';
                if (puzzleName) puzzleNameCache.set(s.puzzle_id, puzzleName);
              } catch {
                // Name is decoration — show the row anyway.
              }
            }

            return {
              sessionId: s.id,
              puzzleId: s.puzzle_id,
              puzzleName: puzzleName || '…',
              opponentName: opponentName || null,
              status:
                s.status === 'waiting'
                  ? 'waiting'
                  : s.current_turn === myNum
                    ? 'yourTurn'
                    : 'theirTurn',
              rawStatus: s.status as 'waiting' | 'active',
              myNum: myNum as 1 | 2,
              p1Score: s.player1_score ?? 0,
              p2Score: s.player2_score ?? 0,
              lastActivityAt,
              inactive: Date.now() - lastActivityAt > INACTIVE_AFTER_MS,
              unread,
            };
          })
        );

        if (cancelled) return;
        built.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
        setRows(built.slice(0, MAX_ROWS));
      } catch {
        // Query failed — no inbox, no noise.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  // Open-time reaping: tapping an inactive game abandons it instead of
  // opening it — the cancel flows through realtime/queries to BOTH inboxes.
  const handleRowClick = useCallback(
    async (row: InboxRow) => {
      if (row.inactive) {
        if (reapingId) return;
        setReapingId(row.sessionId);
        try {
          await cancelPvPSession(row.sessionId);
        } catch {
          // Best-effort — the row is dropped locally either way.
        }
        removeMySession(row.sessionId);
        clearHostSessionPointer(row.sessionId);
        clearChatSeen(row.sessionId);
        setReapingId(null);
        setReloadTick((n) => n + 1);
        return;
      }
      navigate(`/game/${row.puzzleId}?session=${row.sessionId}`);
    },
    [navigate, reapingId]
  );

  // Close from the pill. Semantics by state: an unanswered invite is simply
  // cancelled; an untouched active game is abandoned (no winner); an active
  // game with moves is a RESIGN — the opponent gets the win, closing a real
  // game is not a free escape. The opponent's client learns via the session
  // realtime UPDATE (ended overlay / GameEndModal handle it).
  const handleCloseClick = useCallback(
    async (row: InboxRow, e: React.MouseEvent) => {
      e.stopPropagation();
      if (closingId) return;
      if (confirmingId !== row.sessionId) {
        setConfirmingId(row.sessionId);
        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = setTimeout(() => setConfirmingId(null), 4000);
        return;
      }
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmingId(null);
      setClosingId(row.sessionId);
      try {
        if (row.rawStatus === 'waiting') {
          await cancelPvPSession(row.sessionId);
        } else {
          const moves = await countSessionMoves(row.sessionId);
          if (moves !== null && moves > 0) {
            const winner = (row.myNum === 1 ? 2 : 1) as 1 | 2;
            await endPvPGame(row.sessionId, winner, 'resign', {
              player1: row.p1Score,
              player2: row.p2Score,
            });
          } else {
            await cancelPvPSession(row.sessionId);
          }
        }
      } catch {
        // Best-effort — the row is dropped locally either way; the reaper
        // or the opponent's next open settles any server-side remainder.
      }
      removeMySession(row.sessionId);
      clearHostSessionPointer(row.sessionId);
      clearChatSeen(row.sessionId);
      setClosingId(null);
      setReloadTick((n) => n + 1);
    },
    [confirmingId, closingId]
  );

  if (rows.length === 0) return null;

  const yourTurnCount = rows.filter((r) => !r.inactive && r.status === 'yourTurn').length;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.14) 100%)',
        border: '1px solid rgba(99,102,241,0.45)',
        borderRadius: '14px',
        padding: '12px 14px',
        marginTop: '16px',
        width: 'min(92vw, 520px)',
        boxSizing: 'border-box',
        textAlign: 'left',
      }}
    >
      <div
        style={{
          fontSize: '0.88rem',
          fontWeight: 700,
          color: 'rgba(255,255,255,0.92)',
          marginBottom: 8,
        }}
      >
        {yourTurnCount > 0
          ? yourTurnCount === 1
            ? `⚔️ ${t('pvp.inbox.yourTurnOne')}`
            : `⚔️ ${t('pvp.inbox.yourTurnMany', { count: yourTurnCount })}`
          : `⚔️ ${t('pvp.inbox.title')}`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((row) => (
          // div+role, not <button>: the close chip inside is a real button
          // and buttons must not nest.
          <div
            key={row.sessionId}
            role="button"
            tabIndex={0}
            onClick={() => handleRowClick(row)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleRowClick(row);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              padding: '8px 10px',
              cursor: 'pointer',
              opacity: row.inactive ? 0.45 : 1,
              color: '#fff',
              width: '100%',
              boxSizing: 'border-box',
              textAlign: 'left',
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '0.85rem',
              }}
            >
              <span style={{ fontWeight: 700 }}>
                {row.opponentName || t('pvp.inbox.noOpponentYet')}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}> · {row.puzzleName}</span>
            </span>
            {row.unread > 0 && !row.inactive && (
              <span
                title={t('pvp.inbox.unreadTitle')}
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  borderRadius: '999px',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  minWidth: 18,
                  height: 18,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 5px',
                  flexShrink: 0,
                }}
              >
                💬{row.unread > 9 ? '9+' : row.unread}
              </span>
            )}
            <span
              style={{
                flexShrink: 0,
                fontSize: '0.72rem',
                fontWeight: 700,
                borderRadius: '999px',
                padding: '3px 10px',
                whiteSpace: 'nowrap',
                background: row.inactive
                  ? 'rgba(255,255,255,0.12)'
                  : row.status === 'yourTurn'
                    ? 'rgba(74,222,128,0.22)'
                    : 'rgba(255,255,255,0.12)',
                color: row.inactive
                  ? 'rgba(255,255,255,0.6)'
                  : row.status === 'yourTurn'
                    ? '#4ade80'
                    : 'rgba(255,255,255,0.75)',
                border: `1px solid ${
                  !row.inactive && row.status === 'yourTurn'
                    ? 'rgba(74,222,128,0.5)'
                    : 'rgba(255,255,255,0.2)'
                }`,
              }}
            >
              {row.inactive
                ? reapingId === row.sessionId
                  ? '…'
                  : t('pvp.inbox.inactive')
                : row.status === 'yourTurn'
                  ? t('pvp.inbox.yourTurn')
                  : row.status === 'theirTurn'
                    ? t('pvp.inbox.theirTurn')
                    : t('pvp.inbox.waiting')}
            </span>
            <button
              aria-label={t('pvp.inbox.close')}
              title={t('pvp.inbox.close')}
              onClick={(e) => handleCloseClick(row, e)}
              disabled={closingId !== null}
              style={{
                flexShrink: 0,
                border: `1px solid ${
                  confirmingId === row.sessionId
                    ? 'rgba(239,68,68,0.7)'
                    : 'rgba(255,255,255,0.25)'
                }`,
                background:
                  confirmingId === row.sessionId
                    ? 'rgba(239,68,68,0.25)'
                    : 'rgba(255,255,255,0.08)',
                color:
                  confirmingId === row.sessionId ? '#fca5a5' : 'rgba(255,255,255,0.65)',
                borderRadius: '999px',
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: confirmingId === row.sessionId ? '3px 10px' : '3px 8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {closingId === row.sessionId
                ? '…'
                : confirmingId === row.sessionId
                  ? t('pvp.inbox.closeConfirm')
                  : '✕'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PvPGamesInbox;
