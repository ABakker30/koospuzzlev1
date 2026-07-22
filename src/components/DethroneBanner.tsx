// DethroneBanner — the reclaim hook. Shows on Home when a later solve took a
// #1 the signed-in user held; one tap opens the game with that board's
// palette preselected. Dismissal is keyed on (board + the leader's solve id)
// in localStorage, so the same dethronement never re-nags but a NEW leader
// solve shows again.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { getDethronements, type Dethronement } from '../services/dethroneService';
import { paletteLabel } from '../utils/piecePalette';
import { track } from '../lib/observability';

const seenKey = (userId: string, d: Dethronement) =>
  `dethroneSeen:${userId}:${d.puzzleId}:${d.palette}:${d.leaderSolutionId}`;

function isSeen(userId: string, d: Dethronement): boolean {
  try {
    return localStorage.getItem(seenKey(userId, d)) != null;
  } catch {
    return false;
  }
}

function markSeen(userId: string, d: Dethronement): void {
  try {
    localStorage.setItem(seenKey(userId, d), new Date().toISOString());
  } catch {
    /* storage unavailable */
  }
}

export const DethroneBanner: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [events, setEvents] = useState<Dethronement[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    getDethronements(user.id).then((all) => {
      const fresh = all.filter((d) => !isSeen(user.id, d));
      if (!cancelled && fresh.length) {
        setEvents(fresh);
        track('dethrone_banner_shown', { count: fresh.length });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user?.id || events.length === 0) return null;

  const dismissAll = () => {
    events.forEach((d) => markSeen(user.id, d));
    setEvents([]);
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '500px',
        background: 'linear-gradient(135deg, rgba(254,202,87,0.18) 0%, rgba(248,113,113,0.14) 100%)',
        border: '1px solid rgba(254,202,87,0.45)',
        borderRadius: '14px',
        padding: '14px 16px',
        marginTop: '16px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 800, color: '#feca57', fontSize: '0.9rem' }}>
          ⚔️ {t('dethrone.title')}
        </span>
        <button
          onClick={dismissAll}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.55)',
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          ✕
        </button>
      </div>
      {events.map((d) => (
        <div
          key={`${d.puzzleId}:${d.palette}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '5px 0',
            fontSize: '0.88rem',
            color: 'rgba(255,255,255,0.9)',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t('dethrone.row', {
              name: d.leaderName,
              puzzle: d.puzzleName,
              palette: paletteLabel(d.palette, t),
            })}
          </span>
          <button
            onClick={() => {
              markSeen(user.id, d);
              track('dethrone_reclaim_clicked');
              navigate(`/game/${d.puzzleId}?palette=${encodeURIComponent(d.palette)}`);
            }}
            style={{
              marginLeft: 'auto',
              background: 'linear-gradient(135deg, #feca57 0%, #f59e0b 100%)',
              border: 'none',
              borderRadius: '999px',
              color: '#1e1e2e',
              fontWeight: 700,
              fontSize: '0.8rem',
              padding: '5px 14px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            👑 {t('dethrone.reclaim')}
          </button>
        </div>
      ))}
    </div>
  );
};

export default DethroneBanner;
