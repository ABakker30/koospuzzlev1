// PvPResumeBanner — Home strip for a PvP invite this device is hosting.
// Reads the 'pvp.hostSession' localStorage pointer, verifies the session is
// still waiting/active, and offers one tap back to /game/:puzzleId where the
// GamePage mount logic reattaches (waiting room, or live start if the invitee
// arrived meanwhile). Degrades silently on any error.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { getPvPSession } from '../game/pvp/pvpApi';
import {
  readHostSessionPointer,
  clearHostSessionPointer,
} from '../game/pvp/hostSessionPointer';
import { getPuzzleById } from '../api/puzzles';

// Session-lifetime cache: puzzle id -> display name (avoids re-fetching on
// every Home visit).
const puzzleNameCache = new Map<string, string>();

export const PvPResumeBanner: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [match, setMatch] = useState<{ puzzleId: string; puzzleName: string } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const pointer = readHostSessionPointer();
    if (!pointer) return;

    let cancelled = false;
    (async () => {
      try {
        const session = await getPvPSession(pointer.sessionId);
        if (cancelled) return;

        // Stale pointer: gone, someone else's, simulated, or terminal state.
        if (!session || session.is_simulated || session.player1_id !== user.id) {
          clearHostSessionPointer(pointer.sessionId);
          return;
        }
        if (session.status === 'waiting') {
          const expired =
            session.invite_expires_at && new Date(session.invite_expires_at) < new Date();
          if (expired) {
            clearHostSessionPointer(pointer.sessionId);
            return;
          }
        } else if (session.status !== 'active') {
          clearHostSessionPointer(pointer.sessionId);
          return;
        }

        // Puzzle display name: session row first, getPuzzleById as fallback.
        let puzzleName = session.puzzle_name || puzzleNameCache.get(session.puzzle_id) || '';
        if (!puzzleName) {
          try {
            const puzzle = await getPuzzleById(session.puzzle_id);
            puzzleName = puzzle?.name || '';
            if (puzzleName) puzzleNameCache.set(session.puzzle_id, puzzleName);
          } catch {
            // Name is decoration — show the banner anyway.
          }
        }
        if (!cancelled) {
          setMatch({ puzzleId: session.puzzle_id, puzzleName: puzzleName || '…' });
        }
      } catch {
        // Query failed — no banner, no noise.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!match) return null;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.14) 100%)',
        border: '1px solid rgba(99,102,241,0.45)',
        borderRadius: '14px',
        padding: '12px 16px',
        marginTop: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        maxWidth: 'min(92vw, 520px)',
      }}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: '0.88rem',
          color: 'rgba(255,255,255,0.9)',
        }}
      >
        ⚔️ {t('pvp.resume.pending', { puzzle: match.puzzleName })}
      </span>
      <button
        onClick={() => navigate(`/game/${match.puzzleId}`)}
        style={{
          marginLeft: 'auto',
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          border: 'none',
          borderRadius: '999px',
          color: '#fff',
          fontWeight: 700,
          fontSize: '0.8rem',
          padding: '6px 14px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {t('pvp.resume.return')}
      </button>
    </div>
  );
};

export default PvPResumeBanner;
